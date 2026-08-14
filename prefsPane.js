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
		custom: {
			baseUrl: '',
			model: '',
			voices: []
		}
	},

	async init() {
		// Showing the running build makes "did the reinstall actually take?" answerable
		let stamp = document.getElementById('byok-version');
		if (stamp) {
			stamp.textContent = `Read Aloud BYOK ${Zotero.BYOKTTS.version || '?'} — `
				+ `Zotero ${Zotero.version}`;
		}
		this.onProviderChange(true);
	},

	async revealLog() {
		let Log = Zotero.BYOKTTS.Log;
		await Log.flush();
		let size = await Log.size();
		if (!size) {
			this.status('The log is empty. Switch logging on, reopen the PDF, and play a little.', true);
			return;
		}
		this.status(`${Log.path}\n${(size / 1024).toFixed(1)} KB`);
		try {
			await Zotero.File.reveal(Log.path);
		}
		catch (e) {
			Zotero.logError(e);
		}
	},

	async clearLog() {
		await Zotero.BYOKTTS.Log.clear();
		this.status('Log cleared. Reopen the PDF to capture a fresh run from the start.');
	},

	async tailLog() {
		let Log = Zotero.BYOKTTS.Log;
		await Log.flush();
		try {
			let text = await Zotero.File.getContentsAsync(Log.path);
			let lines = String(text).trim().split('\n');
			if (!lines[0]) {
				this.status('The log is empty.', true);
				return;
			}
			this.status(`${Log.path}\n${lines.length} entries, last 40:\n\n`
				+ lines.slice(-40).join('\n'));
		}
		catch (e) {
			this.status('Could not read the log: ' + (e.message || e), true);
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
			button.label = 'Copied';
			setTimeout(() => (button.label = 'Copy message'), 1500);
		}
	},

	async skipReport() {
		let Skip = Zotero.BYOKTTS.Skip;
		this.status('Measuring the open document…');
		try {
			await Skip.ensureStats();
		}
		catch (e) {
			Zotero.logError(e);
		}
		this.status(Skip.diagnostics(), !Skip.stats);
	},

	showLastError() {
		let last = Zotero.BYOKTTS.lastError;
		this.status(
			last || 'No playback errors recorded since Zotero started.',
			!!last
		);
	},

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
			baseLabel.value = provider === 'azure' ? 'Region or endpoint URL' : 'Base URL';
		}
		let loadButton = document.getElementById('byok-load-voices');
		if (loadButton) {
			loadButton.disabled = !['openai', 'elevenlabs', 'speechify'].includes(provider);
		}
	},

	async loadVoices() {
		this.status('Loading voices…');
		try {
			let voices = await Zotero.BYOKTTS.fetchRemoteVoices();
			if (!voices.length) {
				this.status('The provider returned no voices.', true);
				return;
			}
			this.setPref('voices', JSON.stringify(voices, null, 2));
			this.status(`Loaded ${voices.length} voice${voices.length === 1 ? '' : 's'}.`);
		}
		catch (e) {
			Zotero.logError(e);
			this.status('Could not load voices: ' + await this._describe(e), true);
		}
	},

	tidyVoices() {
		try {
			let parsed = JSON.parse(this.getPref('voices') || '[]');
			this.setPref('voices', JSON.stringify(parsed, null, 2));
			this.status(`${Array.isArray(parsed) ? parsed.length : 0} voice(s) configured.`);
		}
		catch (e) {
			this.status('Voice list is not valid JSON: ' + e.message, true);
		}
	},

	async test() {
		let voices = Zotero.BYOKTTS.getVoices();
		if (!voices.length) {
			this.status('Configure at least one voice first.', true);
			return;
		}
		let voice = voices[0];
		this.status(`Requesting a sample from ${voice.label}…`);
		try {
			let blob = await Zotero.BYOKTTS.synthesize(
				Zotero.BYOKTTS.sampleTextFor(voice.locales[0]),
				voice,
				voice.locales[0]
			);
			if (!blob || !blob.size) {
				this.status('The provider returned no audio.', true);
				return;
			}
			// Rebuild the blob in this window so createObjectURL/Audio accept it
			let buffer = await blob.arrayBuffer();
			let local = new Blob([buffer], { type: blob.type || 'audio/mpeg' });
			let url = URL.createObjectURL(local);
			let audio = new Audio(url);
			audio.onended = audio.onerror = () => URL.revokeObjectURL(url);
			await audio.play();
			this.status(`Playing ${Math.round(blob.size / 1024)} KB of ${blob.type || 'audio'} from ${voice.label}.`);
		}
		catch (e) {
			Zotero.logError(e);
			this.status('Test failed: ' + await this._describe(e), true);
		}
	},

	async clearCache() {
		try {
			await Zotero.BYOKTTS.clearAudioCache();
			this.status('Cached Read Aloud audio cleared.');
		}
		catch (e) {
			Zotero.logError(e);
			this.status('Could not clear the cache: ' + await this._describe(e), true);
		}
	},

	// Shared with the playback path, which records the same detail as lastError
	_describe(e) {
		return Zotero.BYOKTTS.describeError(e);
	}
};

// Reachable from inline handlers in prefsPane.xhtml (see note at the top of this file)
if (typeof Zotero !== 'undefined' && Zotero.BYOKTTS) {
	Zotero.BYOKTTS.pane = Zotero_BYOK_TTS;
}
