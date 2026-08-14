/* Read Aloud BYOK — preferences pane */

// Zotero loads plugin pane scripts into a Cu.Sandbox whose prototype is the window, so a
// top-level `var` here is NOT visible to inline oncommand/onload handlers — those are compiled
// in window scope. Hanging the controller off Zotero (a real window global) is how the built-in
// panes stay reachable; see the assignment at the bottom of this file.
var Zotero_BYOK_TTS = {
	PREF: 'extensions.zotero.byokTTS.',

	DEFAULTS: {
		openai: {
			baseUrl: 'https://api.openai.com/v1',
			model: 'gpt-4o-mini-tts',
			// Bare language codes on purpose: the reader offers a region-tagged voice only for
			// documents in that exact region, but an untagged one for every region.
			voices: [
				{ id: 'alloy', label: 'Alloy', locales: ['en', 'de'] },
				{ id: 'nova', label: 'Nova', locales: ['en', 'de'] },
				{ id: 'onyx', label: 'Onyx', locales: ['en', 'de'] }
			]
		},
		elevenlabs: {
			baseUrl: 'https://api.elevenlabs.io/v1',
			model: 'eleven_turbo_v2_5',
			voices: []
		},
		speechify: {
			baseUrl: 'https://api.speechify.ai/v1',
			model: 'simba-3.0',
			voices: []
		},
		azure: {
			baseUrl: 'westeurope',
			model: '',
			voices: [
				{ id: 'de-DE-KatjaNeural', label: 'Katja (de)', locales: ['de-DE'] },
				{ id: 'de-DE-ConradNeural', label: 'Conrad (de)', locales: ['de-DE'] },
				{ id: 'en-US-AvaNeural', label: 'Ava (en)', locales: ['en-US'] }
			]
		},
		google: {
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
			model: 'gemini-2.5-flash-preview-tts',
			voices: [
				{ id: 'Kore', label: 'Kore', locales: ['en', 'de'] },
				{ id: 'Puck', label: 'Puck', locales: ['en', 'de'] },
				{ id: 'Charon', label: 'Charon', locales: ['en', 'de'] }
			]
		},
		custom: { baseUrl: '', model: '', voices: [] }
	},

	async init() {
		// Zotero registers every plugin's locale/<lang>/*.ftl automatically; this pulls ours
		// into the preferences document so data-l10n-id resolves.
		try {
			window.MozXULElement.insertFTLIfNeeded('read-aloud-byok.ftl');
		}
		catch (e) {
			Zotero.logError(e);
		}

		let stamp = document.getElementById('byok-version');
		if (stamp) {
			stamp.textContent = `${Zotero.BYOKTTS.version || '?'} · Zotero ${Zotero.version}`;
		}

		this.bindVoiceEditor();
		this.onProviderChange(true);
		this.refreshLogPath();

		// Translate the nodes we built ourselves, plus anything inserted before the FTL landed
		try {
			await document.l10n.translateFragment(document.getElementById('byok-sticky').parentNode);
		}
		catch (e) {
			Zotero.logError(e);
		}
	},

	getPref(key) {
		return Zotero.Prefs.get(this.PREF + key, true);
	},

	setPref(key, value) {
		Zotero.Prefs.set(this.PREF + key, value, true);
	},

	// Messages land in a readonly textarea rather than a <description> so they can be selected
	// and copied — provider errors are the whole point of reading them.
	/** Localised message by id; falls back to the id so nothing renders blank. */
	async msg(id, args) {
		try {
			return (await document.l10n.formatValue(id, args)) || id;
		}
		catch (e) {
			return id;
		}
	},

	async statusL10n(id, args, isError) {
		this.status(await this.msg(id, args), isError);
	},

	status(message, isError) {
		let elem = document.getElementById('byok-status');
		let box = document.getElementById('byok-status-box');
		if (!elem) return;
		elem.value = message || '';
		elem.classList.toggle('byok-error', !!isError);
		if (box) box.hidden = !message;
	},

	copyStatus() {
		let elem = document.getElementById('byok-status');
		let text = elem && elem.value;
		if (!text) return;
		Zotero.Utilities.Internal.copyTextToClipboard(text);
		let button = document.getElementById('byok-copy-status');
		if (button) {
			let previous = button.label;
			document.l10n.setAttributes(button, 'byok-copied');
			setTimeout(() => document.l10n.setAttributes(button, 'byok-copy-message'), 1500);
			void previous;
		}
	},

	/* ------------------------------------------------------------- voices */

	readVoices() {
		try {
			let parsed = JSON.parse(this.getPref('voices') || '[]');
			return Array.isArray(parsed) ? parsed : [];
		}
		catch (e) {
			return null; // unparseable — the list view cannot represent it
		}
	},

	writeVoices(voices) {
		this.setPref('voices', JSON.stringify(voices, null, 2));
		this.renderVoiceRows();
		this.renderHighlight();
	},

	bindVoiceEditor() {
		let area = document.getElementById('byok-voices');
		if (!area) return;
		let sync = () => {
			this.renderHighlight();
			this.renderVoiceRows();
		};
		area.addEventListener('input', sync);
		area.addEventListener('syncfrompreference', sync);
		// Keep the highlight layer aligned while scrolling the textarea
		area.addEventListener('scroll', () => {
			let pre = document.getElementById('byok-voices-highlight');
			if (pre) {
				pre.scrollTop = area.scrollTop;
				pre.scrollLeft = area.scrollLeft;
			}
		});
	},

	updateVoicesView() {
		let view = this.getPref('voicesView') === 'json' ? 'json' : 'list';
		let list = document.getElementById('byok-voices-list-view');
		let json = document.getElementById('byok-voices-json-view');
		if (list) list.hidden = view !== 'list';
		if (json) json.hidden = view !== 'json';
		let tidy = document.getElementById('byok-format-voices');
		if (tidy) tidy.hidden = view !== 'json';
		if (view === 'json') this.renderHighlight();
		else this.renderVoiceRows();
	},

	/** Rebuild the rendered rows from the JSON pref. */
	renderVoiceRows() {
		let host = document.getElementById('byok-voices-rows');
		let empty = document.getElementById('byok-voices-empty');
		if (!host) return;
		let voices = this.readVoices();

		host.replaceChildren();
		if (voices === null) {
			// Malformed JSON: say so rather than silently showing an empty editor
			if (empty) {
				empty.hidden = false;
				document.l10n.setAttributes(empty, 'byok-msg-json-invalid-list');
			}
			return;
		}
		if (empty) {
			empty.hidden = voices.length > 0;
			document.l10n.setAttributes(empty, 'byok-voices-empty');
		}

		voices.forEach((voice, index) => {
			let row = document.createElement('div');
			row.className = 'byok-voice-row';

			let field = (value, placeholder, onChange) => {
				let input = document.createElement('input');
				input.type = 'text';
				input.value = value ?? '';
				input.placeholder = placeholder;
				input.addEventListener('change', () => onChange(input.value));
				return input;
			};

			row.append(
				field(voice.id, 'nova', (value) => {
					let all = this.readVoices() || [];
					all[index] = Object.assign({}, all[index], { id: value.trim() });
					this.writeVoices(all);
				}),
				field(voice.label, voice.id || '', (value) => {
					let all = this.readVoices() || [];
					all[index] = Object.assign({}, all[index], { label: value.trim() });
					this.writeVoices(all);
				}),
				field((voice.locales || []).join(', '), 'en, de', (value) => {
					let all = this.readVoices() || [];
					let locales = value.split(',').map(s => s.trim()).filter(Boolean);
					all[index] = Object.assign({}, all[index], { locales });
					this.writeVoices(all);
				})
			);

			let remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'byok-voice-remove';
			remove.textContent = '✕';
			document.l10n.setAttributes(remove, 'byok-voices-remove');
			remove.addEventListener('click', () => {
				let all = this.readVoices() || [];
				all.splice(index, 1);
				this.writeVoices(all);
			});
			row.append(remove);
			host.append(row);
		});
	},

	addVoice() {
		let voices = this.readVoices();
		if (voices === null) {
			this.statusL10n('byok-msg-json-fix-first', null, true);
			return;
		}
		voices.push({ id: '', label: '', locales: ['en'] });
		this.writeVoices(voices);
		let rows = document.getElementById('byok-voices-rows');
		let last = rows && rows.lastElementChild;
		if (last) last.querySelector('input')?.focus();
	},

	/**
	 * Paint the JSON behind the textarea. A textarea cannot render colour itself, so a <pre>
	 * with the same metrics sits underneath and the textarea's own text is made transparent.
	 */
	renderHighlight() {
		let area = document.getElementById('byok-voices');
		let pre = document.getElementById('byok-voices-highlight');
		if (!area || !pre) return;

		let escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		let source = area.value;
		let html = '';
		// key | string | number | literal | punctuation, in that order
		let token = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|\b(true|false|null)\b|([{}\[\],:])/g;
		let last = 0;
		let match;
		while ((match = token.exec(source)) !== null) {
			html += escape(source.slice(last, match.index));
			let cls = match[1] ? 'k' : match[2] ? 's' : match[3] ? 'n' : match[4] ? 'b' : 'p';
			html += `<span class="byok-t-${cls}">${escape(match[0])}</span>`;
			last = match.index + match[0].length;
		}
		html += escape(source.slice(last));
		// A trailing newline keeps the last line visible when the textarea scrolls to the end
		pre.innerHTML = html + '\n';
		pre.scrollTop = area.scrollTop;
		pre.scrollLeft = area.scrollLeft;
	},

	/* ------------------------------------------------------------ provider */

	/**
	 * Swap in sensible defaults for the newly selected provider, but never overwrite a value
	 * the user typed themselves — only empties and other providers' defaults.
	 */
	onProviderChange(initialLoad) {
		let provider = this.getPref('provider') || 'openai';
		let defaults = this.DEFAULTS[provider] || this.DEFAULTS.openai;

		if (!initialLoad) {
			for (let field of ['baseUrl', 'model']) {
				let current = String(this.getPref(field) ?? '');
				let isOtherDefault = Object.values(this.DEFAULTS).some(d => d[field] && d[field] === current);
				if (!current || isOtherDefault) {
					this.setPref(field, defaults[field]);
				}
			}
			let voices = String(this.getPref('voices') ?? '').trim();
			let isOtherVoiceDefault = Object.values(this.DEFAULTS).some(
				d => d.voices.length && JSON.stringify(d.voices) === voices
			);
			if ((!voices || voices === '[]' || isOtherVoiceDefault) && defaults.voices.length) {
				this.setPref('voices', JSON.stringify(defaults.voices, null, 2));
			}
		}

		this.updateVisibility();
		this.status('');
	},

	// Also called directly when the audio format changes, which must not re-apply defaults
	updateVisibility() {
		let provider = this.getPref('provider') || 'openai';
		let isPCM = this.getPref('format') === 'pcm';

		let show = (id, visible) => {
			let elem = document.getElementById(id);
			if (elem) elem.hidden = !visible;
		};
		show('byok-row-baseurl', provider !== 'custom');
		show('byok-row-model', provider !== 'azure');
		show('byok-row-format', provider === 'openai');
		show('byok-row-pcm', provider === 'openai' && isPCM);
		show('byok-pcm-hint', provider === 'openai' && isPCM);
		show('byok-custom-group', provider === 'custom');

		let baseLabel = document.getElementById('byok-baseurl-label');
		if (baseLabel) {
			document.l10n.setAttributes(baseLabel,
				provider === 'azure' ? 'byok-base-url-azure' : 'byok-base-url');
		}
		let loadButton = document.getElementById('byok-load-voices');
		if (loadButton) {
			loadButton.disabled = !['openai', 'elevenlabs', 'speechify'].includes(provider);
		}
		this.updateVoicesView();
	},

	async loadVoices() {
		this.statusL10n('byok-msg-loading-voices');
		try {
			let voices = await Zotero.BYOKTTS.fetchRemoteVoices();
			if (!voices.length) {
				this.statusL10n('byok-msg-voices-none', null, true);
				return;
			}
			this.writeVoices(voices);
			this.statusL10n('byok-msg-voices-loaded', { count: voices.length });
		}
		catch (e) {
			Zotero.logError(e);
			this.statusL10n('byok-msg-voices-failed', { detail: await this._describe(e) }, true);
		}
	},

	tidyVoices() {
		let voices = this.readVoices();
		if (voices === null) {
			this.statusL10n('byok-msg-json-invalid', null, true);
			return;
		}
		this.writeVoices(voices);
		this.statusL10n('byok-msg-voices-configured', { count: voices.length });
	},

	/* --------------------------------------------------------------- test */

	async test() {
		let voices = Zotero.BYOKTTS.getVoices();
		if (!voices.length) {
			this.statusL10n('byok-msg-need-voice', null, true);
			return;
		}
		let voice = voices[0];
		this.statusL10n('byok-msg-requesting', { voice: voice.label });
		try {
			let blob = await Zotero.BYOKTTS.synthesize(
				Zotero.BYOKTTS.sampleTextFor(voice.locales[0]), voice, voice.locales[0]);
			if (!blob || !blob.size) {
				this.statusL10n('byok-msg-no-audio', null, true);
				return;
			}
			// Rebuild the blob in this window so createObjectURL/Audio accept it
			let buffer = await blob.arrayBuffer();
			let local = new Blob([buffer], { type: blob.type || 'audio/mpeg' });
			let url = URL.createObjectURL(local);
			let audio = new Audio(url);
			audio.onended = audio.onerror = () => URL.revokeObjectURL(url);
			await audio.play();
			this.statusL10n('byok-msg-playing', { kb: Math.round(blob.size / 1024), type: blob.type || 'audio', voice: voice.label });
		}
		catch (e) {
			Zotero.logError(e);
			this.statusL10n('byok-msg-test-failed', { detail: await this._describe(e) }, true);
		}
	},

	async clearCache() {
		try {
			await Zotero.BYOKTTS.clearAudioCache();
			this.statusL10n('byok-msg-cache-cleared');
		}
		catch (e) {
			Zotero.logError(e);
			this.statusL10n('byok-msg-cache-failed', { detail: await this._describe(e) }, true);
		}
	},

	showLastError() {
		let last = Zotero.BYOKTTS.lastError;
		if (last) this.status(last, true); else this.statusL10n('byok-msg-no-errors');
	},

	/* ------------------------------------------------------------ logging */

	async refreshLogPath() {
		let elem = document.getElementById('byok-log-path');
		if (!elem) return;
		document.l10n.setAttributes(elem, 'byok-log-path', { path: Zotero.BYOKTTS.Log.path });
	},

	async openLogFolder() {
		let Log = Zotero.BYOKTTS.Log;
		await Log.flush();
		try {
			// reveal() selects the file when it exists; fall back to the profile folder
			if (await Log.size()) {
				await Zotero.File.reveal(Log.path);
			}
			else {
				await Zotero.File.reveal(Zotero.Profile.dir);
				this.statusL10n('byok-msg-log-none-yet');
			}
		}
		catch (e) {
			Zotero.logError(e);
			this.statusL10n('byok-msg-folder-failed', { detail: e.message || String(e) }, true);
		}
	},

	async clearLog() {
		await Zotero.BYOKTTS.Log.clear();
		this.statusL10n('byok-msg-log-cleared');
	},

	async tailLog() {
		let Log = Zotero.BYOKTTS.Log;
		await Log.flush();
		try {
			let text = await Zotero.File.getContentsAsync(Log.path);
			let lines = String(text).trim().split('\n');
			if (!lines[0]) {
				this.statusL10n('byok-msg-log-empty', null, true);
				return;
			}
			this.status(await this.msg('byok-msg-log-tail', { path: Log.path, entries: lines.length })
				+ '\n\n' + lines.slice(-40).join('\n'));
		}
		catch (e) {
			this.statusL10n('byok-msg-log-unreadable', { detail: e.message || String(e) }, true);
		}
	},

	// Shared with the playback path, which records the same detail as lastError
	_describe(e) {
		return Zotero.BYOKTTS.describeError(e);
	}
};

// Reachable from inline handlers in pane.xhtml (see note at the top of this file)
if (typeof Zotero !== 'undefined' && Zotero.BYOKTTS) {
	Zotero.BYOKTTS.pane = Zotero_BYOK_TTS;
}
