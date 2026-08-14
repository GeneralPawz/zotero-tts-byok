/*
	Read Aloud BYOK — routes Zotero's built-in Read Aloud through a user-supplied TTS API.

	Zotero's reader asks the parent process for voices and audio through
	Zotero.Sync.APIClient.prototype.getReadAloudVoices/getReadAloudAudio. We wrap those two
	methods: our voices get merged into the catalog the reader receives, and any request for
	one of them is answered by the user's own provider instead of api.zotero.org. Everything
	else (segmentation, prefetching, the parent-side audio cache, playback speed, sentence
	highlighting) is untouched Zotero code.
*/

Zotero.BYOKTTS = new function () {
	const PREF = 'extensions.zotero.byokTTS.';
	const PREFIX = 'byok:';
	const ENABLED_VOICES_PATH = PathUtils.join(Zotero.Profile.dir, 'readAloudEnabledVoices.json');

	const SAMPLE_TEXT = {
		de: 'Dies ist eine Beispielstimme für das Vorlesen von Texten.',
		en: 'This is a sample of how this voice reads your documents.',
		fr: 'Voici un exemple de cette voix lisant vos documents.',
		es: 'Esta es una muestra de cómo esta voz lee tus documentos.',
		it: 'Questo è un esempio di come questa voce legge i tuoi documenti.',
		nl: 'Dit is een voorbeeld van hoe deze stem je documenten voorleest.',
		pt: 'Esta é uma amostra de como esta voz lê os seus documentos.'
	};

	let _origVoices = null;
	let _origAudio = null;
	let _prefObservers = [];

	// The reader can only render 'An unknown error occurred', so the real detail is kept here
	// for the preferences pane to show.
	this.lastError = null;

	/**
	 * Turn a failed request into something worth reading. Providers explain rejections in the
	 * response body, which is a Blob when responseType is 'blob' — where responseText throws.
	 */
	this.describeError = async function (e) {
		if (e && e.status) {
			let body = '';
			try {
				let response = e.xmlhttp?.response;
				if (response && typeof response.text === 'function') {
					body = await response.text();
				}
				else if (typeof response === 'string') {
					body = response;
				}
				else if (response && typeof response === 'object') {
					body = JSON.stringify(response);
				}
			}
			catch (ignore) {}
			return `HTTP ${e.status}${body ? ' — ' + body.slice(0, 2000) : ''}`;
		}
		return (e && e.message) || String(e);
	};

	this.rootURI = null;

	/* ------------------------------------------------------------------ prefs */

	this.getPref = function (key) {
		return Zotero.Prefs.get(PREF + key, true);
	};

	this.setPref = function (key, value) {
		return Zotero.Prefs.set(PREF + key, value, true);
	};

	this.isEnabled = function () {
		return !!this.getPref('enabled') && this.getVoices().length > 0;
	};

	/**
	 * @return {Array<{id: String, label: String, locales: String[]}>}
	 */
	this.getVoices = function () {
		let raw = this.getPref('voices');
		if (!raw) return [];
		let parsed;
		try {
			parsed = JSON.parse(raw);
		}
		catch (e) {
			Zotero.logError(new Error('BYOK TTS: voice list is not valid JSON: ' + e.message));
			return [];
		}
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(v => v && typeof v.id === 'string' && v.id.length)
			.map(v => ({
				id: v.id,
				label: v.label || v.id,
				locales: Array.isArray(v.locales) && v.locales.length ? v.locales : ['en-US']
			}));
	};

	this.getVoiceByID = function (id) {
		let bare = id.startsWith(PREFIX) ? id.slice(PREFIX.length) : id;
		return this.getVoices().find(v => v.id === bare) || null;
	};

	/* ------------------------------------------------------- voice catalog */

	/**
	 * Build a voices response in the shape the reader's parseVoicesResponse() expects:
	 * { <tier>: [ { creditsPerMinute, segmentGranularity, voices: {id: {label}}, locales: {...} } ] }
	 * creditsPerMinute of 0 makes the reader treat these voices as unmetered, so no quota UI.
	 */
	this.buildCatalog = function () {
		let voices = this.getVoices();
		if (!voices.length) return null;

		let tier = this.getPref('tier') || 'premium';
		if (!['standard', 'premium', 'local'].includes(tier)) tier = 'premium';
		let granularity = this.getPref('granularity') === 'paragraph' ? 'paragraph' : 'sentence';

		let voiceMap = {};
		let locales = {};
		for (let voice of voices) {
			let id = PREFIX + voice.id;
			voiceMap[id] = { label: voice.label };
			for (let locale of voice.locales) {
				if (!locales[locale]) locales[locale] = { default: [], other: [] };
				if (!locales[locale].default.includes(id)) locales[locale].default.push(id);
			}
		}

		return {
			[tier]: [{
				creditsPerMinute: 0,
				segmentGranularity: granularity,
				sentenceDelay: 0,
				voices: voiceMap,
				locales
			}]
		};
	};

	/**
	 * If the user has ever opened "More Voices…", Zotero persists an explicit allowlist per
	 * language and tier, and anything missing from it is hidden. Make sure our voices are in it.
	 */
	this.reconcileEnabledVoices = async function () {
		let existing;
		try {
			existing = await IOUtils.readJSON(ENABLED_VOICES_PATH);
		}
		catch (e) {
			return; // No allowlist yet — voices default to visible
		}
		if (!existing || typeof existing !== 'object') return;

		let tier = this.getPref('tier') || 'premium';
		let ids = this.getVoices().map(v => PREFIX + v.id);
		let modified = false;

		for (let langConfig of Object.values(existing)) {
			if (!langConfig || !Array.isArray(langConfig[tier])) continue;
			for (let id of ids) {
				if (!langConfig[tier].includes(id)) {
					langConfig[tier].push(id);
					modified = true;
				}
			}
		}
		if (modified) {
			await IOUtils.writeJSON(ENABLED_VOICES_PATH, existing);
			Zotero.debug('BYOK TTS: added voices to the persisted Read Aloud allowlist');
		}
	};

	/* ------------------------------------------------------------ synthesis */

	this.sampleTextFor = function (locale) {
		let base = String(locale || 'en').split('-')[0].toLowerCase();
		return SAMPLE_TEXT[base] || SAMPLE_TEXT.en;
	};

	/**
	 * @param {Object|String} segment - A reader segment, or the string 'sample'
	 * @param {String} voiceID - Namespaced voice ID (byok:<id>)
	 * @return {Promise<{audio: Blob|null, error: String|undefined}>}
	 */
	this.getAudio = async function (segment, voiceID) {
		let voice = this.getVoiceByID(voiceID);
		if (!voice) {
			return { audio: null, error: 'unknown' };
		}
		let locale = voice.locales[0];
		let text;
		if (segment === 'sample') {
			text = this.sampleTextFor(locale);
		}
		else {
			// Measure the document before judging the first segment, otherwise the layout rules
			// stay dormant for whatever plays before the reader panel is ever opened
			if (this.Skip && this.Skip.anyOn() && !this.Skip.stats) {
				await this.Skip.ensureStats();
			}
			let result = this.Skip
				? this.Skip.apply(segment, 'playback')
				: { text: String(segment?.text ?? '') };
			if (result.skipped) {
				// Answer locally: the reader advances, nothing is sent, nothing is billed
				Zotero.debug(`BYOK TTS: skipped a segment (${result.reason})`);
				return { audio: this._silence() };
			}
			text = result.text;
		}
		if (!text.trim()) {
			return { audio: null, error: 'unknown' };
		}

		let started = Date.now();
		try {
			let blob = await this.synthesize(text, voice, locale);
			if (!blob || !blob.size) throw new Error('Provider returned empty audio');
			this.Log?.write('request', {
				provider: this.getPref('provider'),
				model: this.getPref('model'),
				voice: voice.id,
				chars: text.length,
				ms: Date.now() - started,
				bytes: blob.size,
				type: blob.type,
				sample: segment === 'sample',
				sent: this.Log.clip(text)
			});
			return { audio: blob };
		}
		catch (e) {
			Zotero.logError(e);
			this.lastError = `[${new Date().toLocaleTimeString()}] voice "${voice.id}", `
				+ `model "${this.getPref('model')}"\n${await this.describeError(e)}`;
			this.Log?.write('request', {
				provider: this.getPref('provider'),
				model: this.getPref('model'),
				voice: voice.id,
				chars: text.length,
				ms: Date.now() - started,
				status: e?.status ?? null,
				error: await this.describeError(e),
				sent: this.Log.clip(text)
			});
			// Only 'network' and 'unknown' are safe to report: 'quota-exceeded' and
			// 'daily-limit-exceeded' make the reader offer to top up Zotero credits.
			let error = (e instanceof Zotero.HTTP.BrowserOfflineException) ? 'network' : 'unknown';
			return { audio: null, error };
		}
	};

	/**
	 * Gemini and most expressive models take direction as natural language in the text itself
	 * ("Say cheerfully: …"), so in prepend mode the style prompt is glued to the front of every
	 * segment. Applied here rather than in getAudio() so the pane's test button hears it too.
	 */
	this._applyStyle = function (text) {
		let prompt = (this.getPref('stylePrompt') || '').trim();
		if (!prompt || this.getPref('styleMode') !== 'prepend') return text;
		// A trailing colon or dash reads as running into the sentence; anything else is a
		// standalone instruction and wants a break after it.
		let separator = /[:\-–—]$/.test(prompt) ? ' ' : '\n\n';
		return prompt + separator + text;
	};

	/** Merge the user's extra JSON over a request body, for provider-specific knobs. */
	this._withExtraBody = function (body) {
		let raw = (this.getPref('extraBody') || '').trim();
		if (!raw) return body;
		let extra;
		try {
			extra = JSON.parse(raw);
		}
		catch (e) {
			throw new Error('Extra request JSON is not valid JSON: ' + e.message);
		}
		return Object.assign({}, body, extra);
	};

	/** OpenRouter is offered separately for convenience but speaks the OpenAI dialect. */
	this.providerKind = function () {
		let provider = this.getPref('provider');
		return provider === 'openrouter' ? 'openai' : provider;
	};

	this.synthesize = async function (text, voice, locale) {
		text = this._applyStyle(text);
		switch (this.providerKind()) {
			case 'elevenlabs':
				return this._elevenLabs(text, voice);
			case 'speechify':
				return this._speechify(text, voice, locale);
			case 'azure':
				return this._azure(text, voice, locale);
			case 'google':
				return this._google(text, voice);
			case 'custom':
				return this._custom(text, voice, locale);
			case 'openai':
			default:
				return this._openAI(text, voice);
		}
	};

	// OpenAI-compatible: OpenAI, Groq, DeepInfra, Kokoro-FastAPI, Speaches,
	// openedai-speech, LM Studio, and most self-hosted servers.
	this._openAI = async function (text, voice) {
		let base = (this.getPref('baseUrl') || 'https://api.openai.com/v1').replace(/\/+$/, '');
		let format = this.getPref('format') || 'mp3';
		// Speed is applied by the reader during playback, so always request 1x.
		let body = {
			model: this.getPref('model') || 'gpt-4o-mini-tts',
			input: text,
			voice: voice.id,
			response_format: format
		};
		// OpenAI's expressive models take direction here instead of inline
		let stylePrompt = (this.getPref('stylePrompt') || '').trim();
		if (stylePrompt && this.getPref('styleMode') === 'instructions') {
			body.instructions = stylePrompt;
		}
		body = this._withExtraBody(body);

		let headers = { 'Content-Type': 'application/json' };
		let key = this.getPref('apiKey');
		if (key) headers.Authorization = 'Bearer ' + key;

		let audio = await this._requestBlob('POST', base + '/audio/speech', headers, JSON.stringify(body));

		// Some models emit only headerless PCM — Gemini via OpenRouter rejects every other
		// format outright. The reader can't decode that, so give it a WAV container.
		if (format === 'pcm') {
			let rate = parseInt(this.getPref('pcmSampleRate'), 10) || 24000;
			return this._pcmToWavBlob(audio, rate);
		}
		return audio;
	};

	this._elevenLabs = async function (text, voice) {
		let base = (this.getPref('baseUrl') || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');
		let url = base + '/text-to-speech/' + encodeURIComponent(voice.id) + '?output_format=mp3_44100_128';
		let headers = {
			'Content-Type': 'application/json',
			'xi-api-key': this.getPref('apiKey') || ''
		};
		let body = JSON.stringify(this._withExtraBody({
			text,
			model_id: this.getPref('model') || 'eleven_turbo_v2_5'
		}));
		return this._requestBlob('POST', url, headers, body);
	};

	// Speechify returns base64 audio inside JSON on /audio/speech. Its /audio/stream sibling
	// hands back raw bytes, but only documents the output_format enum, so this takes the
	// endpoint whose plain audio_format values are pinned down.
	this._speechify = async function (text, voice, locale) {
		let base = (this.getPref('baseUrl') || 'https://api.speechify.ai/v1').replace(/\/+$/, '');
		let headers = {
			'Content-Type': 'application/json',
			Authorization: 'Bearer ' + (this.getPref('apiKey') || '')
		};
		let body = {
			input: text,
			voice_id: voice.id,
			audio_format: 'mp3'
		};
		let model = this.getPref('model');
		if (model) body.model = model;
		if (locale) body.language = locale;

		let xhr = await this._request(
			'POST', base + '/audio/speech', headers, JSON.stringify(this._withExtraBody(body)), 'json'
		);
		let data = xhr.response?.audio_data;
		if (!data) throw new Error('Speechify response contained no audio_data');
		return this._blob([this._base64ToBytes(data)], 'audio/mpeg');
	};

	this._azure = async function (text, voice, locale) {
		let base = (this.getPref('baseUrl') || '').trim().replace(/\/+$/, '');
		let url = /^https?:\/\//i.test(base)
			? base
			: `https://${base || 'westeurope'}.tts.speech.microsoft.com/cognitiveservices/v1`;
		let headers = {
			'Content-Type': 'application/ssml+xml',
			'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
			'Ocp-Apim-Subscription-Key': this.getPref('apiKey') || ''
		};
		let ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="'
			+ this._xml(locale) + '"><voice name="' + this._xml(voice.id) + '">'
			+ this._xml(text) + '</voice></speak>';
		return this._requestBlob('POST', url, headers, ssml);
	};

	// Gemini TTS returns base64 raw PCM (24 kHz, mono, 16-bit), which needs a WAV header
	// before AudioContext.decodeAudioData() will touch it.
	this._google = async function (text, voice) {
		let base = (this.getPref('baseUrl') || 'https://generativelanguage.googleapis.com/v1beta')
			.replace(/\/+$/, '');
		let model = this.getPref('model') || 'gemini-2.5-flash-preview-tts';
		let url = base + '/models/' + encodeURIComponent(model) + ':generateContent';
		let headers = {
			'Content-Type': 'application/json',
			'x-goog-api-key': this.getPref('apiKey') || ''
		};
		let body = JSON.stringify({
			contents: [{ parts: [{ text }] }],
			generationConfig: {
				responseModalities: ['AUDIO'],
				speechConfig: {
					voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.id } }
				}
			}
		});
		let xhr = await this._request('POST', url, headers, body, 'json');
		let data = this._dig(xhr.response, 'candidates.0.content.parts.0.inlineData.data');
		if (!data) throw new Error('Gemini response contained no audio');
		return this._pcmToWavBlob(this._base64ToBytes(data), 24000);
	};

	this._custom = async function (text, voice, locale) {
		let url = (this.getPref('custom.url') || '').trim();
		if (!url) throw new Error('No custom endpoint URL configured');
		let method = (this.getPref('custom.method') || 'POST').toUpperCase();

		let headers;
		try {
			headers = JSON.parse(this.getPref('custom.headers') || '{}');
		}
		catch (e) {
			throw new Error('Custom headers are not valid JSON: ' + e.message);
		}
		headers = this._fillObject(headers, voice, locale);
		url = this._fill(url, text, voice, locale, true);

		let body = null;
		if (method !== 'GET' && method !== 'HEAD') {
			body = this._fill(this.getPref('custom.body') || '', text, voice, locale, false);
		}

		let audioPath = (this.getPref('custom.audioPath') || '').trim();
		if (!audioPath) {
			return this._requestBlob(method, url, headers, body);
		}

		// Base64 audio nested in a JSON response
		let xhr = await this._request(method, url, headers, body, 'json');
		let data = this._dig(xhr.response, audioPath);
		if (!data) throw new Error('No audio found at response path "' + audioPath + '"');
		let bytes = this._base64ToBytes(data);
		let sampleRate = parseInt(this.getPref('custom.pcmSampleRate'), 10) || 0;
		return sampleRate
			? this._pcmToWavBlob(bytes, sampleRate)
			: this._blob([bytes], this.getPref('custom.mimeType') || 'audio/mpeg');
	};

	/* ------------------------------------------------------------- HTTP glue */

	this._request = async function (method, url, headers, body, responseType) {
		return Zotero.HTTP.request(method, url, {
			headers,
			body: body ?? undefined,
			responseType,
			timeout: 60000,
			successCodes: [200, 201],
			errorDelayMax: 0
		});
	};

	this._requestBlob = async function (method, url, headers, body) {
		let xhr = await this._request(method, url, headers, body, 'blob');
		return xhr.response;
	};

	/* ---------------------------------------------------------------- helpers */

	// Build in this sandbox, where the byte arrays were created — constructing across
	// compartments risks tripping over Xray wrappers. The resulting Blob is a normal DOM
	// object, so Zotero's Cu.cloneInto() into the reader window handles it fine.
	this._blob = function (parts, type) {
		let Ctor = (typeof Blob !== 'undefined' && Blob) || Zotero.getMainWindow()?.Blob;
		return new Ctor(parts, { type });
	};

	/** A beat of silence for skipped segments, so playback moves on without a request. */
	this._silence = function (seconds = 0.06, sampleRate = 24000) {
		return this._pcmToWavBlob(new Uint8Array(Math.round(seconds * sampleRate) * 2), sampleRate);
	};

	this._base64ToBytes = function (b64) {
		let binary = atob(String(b64).replace(/\s+/g, ''));
		let bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	};

	/**
	 * Wrap headerless PCM in a WAV container so AudioContext.decodeAudioData() accepts it.
	 * `pcm` may be a Uint8Array or a Blob — Blob parts are passed straight through, which
	 * avoids reading a cross-compartment ArrayBuffer just to prepend 44 bytes.
	 */
	this._pcmToWavBlob = function (pcm, sampleRate, channels = 1, bitsPerSample = 16) {
		let dataLength = pcm.byteLength ?? pcm.size;
		let blockAlign = channels * bitsPerSample / 8;
		let byteRate = sampleRate * blockAlign;
		let header = new ArrayBuffer(44);
		let view = new DataView(header);
		let ascii = (offset, str) => {
			for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
		};
		ascii(0, 'RIFF');
		view.setUint32(4, 36 + dataLength, true);
		ascii(8, 'WAVE');
		ascii(12, 'fmt ');
		view.setUint32(16, 16, true);        // PCM chunk size
		view.setUint16(20, 1, true);         // format = PCM
		view.setUint16(22, channels, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, byteRate, true);
		view.setUint16(32, blockAlign, true);
		view.setUint16(34, bitsPerSample, true);
		ascii(36, 'data');
		view.setUint32(40, dataLength, true);
		return this._blob([new Uint8Array(header), pcm], 'audio/wav');
	};

	this._xml = function (str) {
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&apos;');
	};

	/**
	 * Substitute {{text}} / {{voice}} / {{model}} / {{lang}} / {{key}} in a template.
	 * `urlEncode` percent-encodes for URLs; otherwise values are JSON-string-escaped so a
	 * template like {"text":"{{text}}"} stays valid JSON for any input.
	 */
	this._fill = function (template, text, voice, locale, urlEncode) {
		let esc = v => urlEncode
			? encodeURIComponent(v)
			: JSON.stringify(String(v)).slice(1, -1);
		return String(template)
			.replace(/\{\{text\}\}/g, esc(text))
			.replace(/\{\{voice\}\}/g, esc(voice.id))
			.replace(/\{\{model\}\}/g, esc(this.getPref('model') || ''))
			.replace(/\{\{lang\}\}/g, esc(locale || ''))
			.replace(/\{\{key\}\}/g, esc(this.getPref('apiKey') || ''));
	};

	this._fillObject = function (obj, voice, locale) {
		let out = {};
		for (let [k, v] of Object.entries(obj)) {
			// Header values are raw strings, not JSON, so substitute without escaping
			out[k] = String(v)
				.replace(/\{\{voice\}\}/g, voice.id)
				.replace(/\{\{model\}\}/g, this.getPref('model') || '')
				.replace(/\{\{lang\}\}/g, locale || '')
				.replace(/\{\{key\}\}/g, this.getPref('apiKey') || '');
		}
		return out;
	};

	this._dig = function (obj, path) {
		return String(path).split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
	};

	/* ------------------------------------------------- voice list discovery */

	/**
	 * Ask the configured provider what voices it offers. Used by the "Load voices" button.
	 * @return {Promise<Array>} voice entries ready to be written to the voices pref
	 */
	this.fetchRemoteVoices = async function () {
		let provider = this.providerKind();
		let key = this.getPref('apiKey');

		if (provider === 'elevenlabs') {
			let base = (this.getPref('baseUrl') || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');
			let xhr = await this._request('GET', base + '/voices', { 'xi-api-key': key || '' }, null, 'json');
			return (xhr.response?.voices || []).map(v => ({
				id: v.voice_id,
				label: v.name,
				locales: this._elevenLabsLocales(v)
			}));
		}

		if (provider === 'speechify') {
			let base = (this.getPref('baseUrl') || 'https://api.speechify.ai/v1').replace(/\/+$/, '');
			let headers = { Authorization: 'Bearer ' + (key || '') };
			let voices = [];
			let seen = new Set();
			let cursor = null;

			// Paged, and the page cap keeps a misread cursor from looping forever
			for (let page = 0; page < 10; page++) {
				let url = base + '/voices' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '');
				let xhr = await this._request('GET', url, headers, null, 'json');
				let batch = xhr.response?.voices || (Array.isArray(xhr.response) ? xhr.response : []);
				let added = 0;
				for (let v of batch) {
					if (!v?.id || seen.has(v.id)) continue;
					seen.add(v.id);
					added++;
					voices.push({
						id: v.id,
						label: v.display_name || v.id,
						locales: this._speechifyLocales(v)
					});
				}
				let next = xhr.response?.next_cursor;
				if (!xhr.response?.has_more || !next || next === cursor || !added) break;
				cursor = next;
			}
			return voices;
		}

		if (provider === 'openai') {
			let base = (this.getPref('baseUrl') || '').replace(/\/+$/, '');
			let headers = key ? { Authorization: 'Bearer ' + key } : {};

			// OpenRouter keeps speech models out of its default /models listing and publishes
			// each one's voice list under supported_voices.
			if (/(^|\/\/|\.)openrouter\.ai/.test(base)) {
				let xhr = await this._request(
					'GET', base + '/models?output_modalities=speech', headers, null, 'json'
				);
				let models = xhr.response?.data || [];
				let wanted = this.getPref('model');
				let match = models.find(m => m.id === wanted);
				if (!match) {
					throw new Error(
						`OpenRouter has no speech model "${wanted}". Available: `
						+ models.map(m => m.id).join(', ')
					);
				}
				let names = match.supported_voices || [];
				if (!names.length) {
					throw new Error(`OpenRouter lists no voices for "${wanted}" — enter them by hand.`);
				}
				return names.map(id => ({
					id,
					label: String(id).split(':')[0],
					locales: this._localesForVoiceName(id)
				}));
			}

			// Kokoro-FastAPI, Speaches, openedai-speech and friends expose this;
			// api.openai.com does not, so the caller falls back to the built-in list.
			let xhr = await this._request('GET', base + '/audio/voices', headers, null, 'json');
			let list = xhr.response?.voices || xhr.response?.data || [];
			return list.map((v) => {
				let id = typeof v === 'string' ? v : (v.id || v.name);
				return { id, label: typeof v === 'string' ? v : (v.name || id), locales: ['en'] };
			}).filter(v => v.id);
		}

		throw new Error('Voice discovery is not supported for this provider — enter voices manually.');
	};

	const MULTILINGUAL = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt'];

	// Most providers encode the language in the voice name. Read it out where we can, so voices
	// land under the right reader language; assume multilingual when nothing is encoded.
	this._localesForVoiceName = function (name) {
		let id = String(name);
		// de-DE-Klaus:MAI-Voice-2
		let m = /^([a-z]{2})-[A-Z]{2}\b/.exec(id);
		if (m) return [m[1]];
		// Kokoro: <language><gender>_name, e.g. af_bella (American), bm_george (British)
		m = /^([abefhijpz])[fm]_/.exec(id);
		if (m) {
			return [{ a: 'en', b: 'en', e: 'es', f: 'fr', h: 'hi', i: 'it', j: 'ja', p: 'pt', z: 'zh' }[m[1]]];
		}
		// Voxtral: en_paul_sad, gb_oliver_neutral, fr_marie_happy
		m = /^([a-z]{2})_/.exec(id);
		if (m) return [m[1] === 'gb' ? 'en' : m[1]];
		// Deepgram: aura-2-agathe-fr, flux-alexis-en
		m = /-([a-z]{2})$/.exec(id);
		if (m) return [m[1]];
		return MULTILINGUAL.slice();
	};

	// The reader matches a region-tagged voice only against documents in that exact region, but
	// an untagged one against every region — so language codes are left bare on purpose.
	/**
	 * Ask the provider what models it has, so the Model field can be picked from rather than
	 * typed. Providers that have no concept of a model, or no endpoint for it, simply return
	 * an empty list and the field stays free text.
	 *
	 * @return {Promise<Array<{id: String, label: String}>>}
	 */
	this.fetchRemoteModels = async function () {
		let provider = this.getPref('provider');
		let key = this.getPref('apiKey');
		let base = (this.getPref('baseUrl') || '').replace(/\/+$/, '');
		let bearer = key ? { Authorization: 'Bearer ' + key } : {};

		if (provider === 'openrouter' || /(^|\/\/|\.)openrouter\.ai/.test(base)) {
			// Speech models are absent from OpenRouter's default listing
			let xhr = await this._request(
				'GET', base + '/models?output_modalities=speech', bearer, null, 'json');
			return (xhr.response?.data || []).map(m => ({ id: m.id, label: m.name || m.id }));
		}

		if (provider === 'speechify') {
			let xhr = await this._request('GET', base + '/audio/models', bearer, null, 'json');
			let list = xhr.response?.models || [];
			return list
				.filter(m => !m.deprecated)
				.map(m => ({ id: m.id, label: m.name ? `${m.id} — ${m.name}` : m.id }));
		}

		if (provider === 'elevenlabs') {
			let xhr = await this._request(
				'GET', base + '/models', { 'xi-api-key': key || '' }, null, 'json');
			let list = Array.isArray(xhr.response) ? xhr.response : (xhr.response?.models || []);
			return list
				.filter(m => m.can_do_text_to_speech !== false)
				.map(m => ({ id: m.model_id, label: m.name ? `${m.model_id} — ${m.name}` : m.model_id }))
				.filter(m => m.id);
		}

		if (provider === 'google') {
			let xhr = await this._request('GET', base + '/models', { 'x-goog-api-key': key || '' }, null, 'json');
			return (xhr.response?.models || [])
				.map(m => String(m.name || '').replace(/^models\//, ''))
				.filter(id => /tts/i.test(id))
				.map(id => ({ id, label: id }));
		}

		if (provider === 'openai') {
			// api.openai.com lists everything, so narrow to the speech-capable ones; a local
			// server usually lists only what it serves and the filter then matches nothing,
			// in which case the unfiltered list is the better answer.
			let xhr = await this._request('GET', base + '/models', bearer, null, 'json');
			let ids = (xhr.response?.data || []).map(m => m.id).filter(Boolean);
			let speech = ids.filter(id => /tts|speech|audio|voice/i.test(id));
			return (speech.length ? speech : ids).map(id => ({ id, label: id }));
		}

		return [];
	};

	// A Speechify voice lists a locale per model it supports; collapse those to bare language
	// codes so the reader offers the voice for every region of that language.
	this._speechifyLocales = function (v) {
		let langs = new Set();
		let add = (locale) => {
			if (typeof locale === 'string' && locale) langs.add(locale.split('-')[0].toLowerCase());
		};
		add(v.locale);
		for (let model of v.models || []) {
			for (let lang of model.languages || []) {
				add(typeof lang === 'string' ? lang : lang.locale);
			}
		}
		return langs.size ? [...langs] : ['en'];
	};

	this._elevenLabsLocales = function (v) {
		let locales = new Set();
		for (let lang of v.verified_languages || []) {
			if (lang.language) locales.add(lang.language);
		}
		if (v.labels?.language) locales.add(v.labels.language);
		if (!locales.size) {
			// Multilingual models handle everything; expose the common set
			return ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt'];
		}
		return [...locales];
	};

	/* -------------------------------------------------------------- patching */

	this.patch = function () {
		let proto = Zotero.Sync.APIClient.prototype;
		if (_origVoices) return;

		_origVoices = proto.getReadAloudVoices;
		_origAudio = proto.getReadAloudAudio;
		let self = this;

		proto.getReadAloudVoices = async function (...args) {
			let empty = {
				voices: {},
				standardCreditsRemaining: null,
				premiumCreditsRemaining: null,
				devMode: false
			};
			let base;
			if (self.getPref('hideZoteroVoices') && self.isEnabled()) {
				base = empty;
			}
			else {
				try {
					base = await _origVoices.apply(this, args);
				}
				catch (e) {
					Zotero.logError(e);
					base = empty;
				}
			}

			if (!self.isEnabled()) return base;

			let catalog = self.buildCatalog();
			if (!catalog) return base;

			// A failed upstream call still leaves our voices usable, so drop its error
			let voices = (base && !base.error && base.voices) ? base.voices : {};
			for (let [tier, configs] of Object.entries(catalog)) {
				if (!Array.isArray(voices[tier])) voices[tier] = [];
				voices[tier].push(...configs);
			}
			return {
				voices,
				standardCreditsRemaining: base?.standardCreditsRemaining ?? null,
				premiumCreditsRemaining: base?.premiumCreditsRemaining ?? null,
				devMode: false
			};
		};

		proto.getReadAloudAudio = async function (segment, voiceID) {
			if (typeof voiceID === 'string' && voiceID.startsWith(PREFIX)) {
				return self.getAudio(segment, voiceID);
			}
			return _origAudio.apply(this, arguments);
		};

		Zotero.debug('BYOK TTS: patched Read Aloud API client');
	};

	this.unpatch = function () {
		if (!_origVoices) return;
		let proto = Zotero.Sync.APIClient.prototype;
		proto.getReadAloudVoices = _origVoices;
		proto.getReadAloudAudio = _origAudio;
		_origVoices = null;
		_origAudio = null;
		Zotero.debug('BYOK TTS: unpatched Read Aloud API client');
	};

	/**
	 * Drop the parent-process audio cache so edited provider settings take effect for text
	 * that has already been read once.
	 */
	this.clearAudioCache = async function () {
		let win = Zotero.getMainWindow();
		if (win?.caches) {
			await win.caches.delete('read-aloud');
		}
	};

	/* ------------------------------------------------------------- lifecycle */

	this.init = async function ({ rootURI, version }) {
		this.rootURI = rootURI;
		this.version = version;
		this.patch();
		this.Log?.session('startup');

		await Zotero.PreferencePanes.register({
			pluginID: 'byok-tts@local',
			src: rootURI + 'prefs/pane.xhtml',
			scripts: [rootURI + 'prefs/pane.js'],
			stylesheets: [rootURI + 'prefs/pane.css'],
			label: 'Read Aloud BYOK'
		});

		if (this.ReaderUI) this.ReaderUI.init();

		let reconcile = () => this.reconcileEnabledVoices().catch(e => Zotero.logError(e));
		// Voices added after Zotero has written an allowlist would otherwise stay hidden
		_prefObservers = ['voices', 'tier'].map(
			key => Zotero.Prefs.registerObserver(PREF + key, reconcile, true)
		);
		reconcile();
	};

	this.uninit = function () {
		for (let symbol of _prefObservers) {
			Zotero.Prefs.unregisterObserver(symbol);
		}
		_prefObservers = [];
		if (this.ReaderUI) this.ReaderUI.uninit();
		this.unpatch();
	};
};
