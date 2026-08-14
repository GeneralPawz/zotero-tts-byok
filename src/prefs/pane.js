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
		openrouter: {
			baseUrl: 'https://openrouter.ai/api/v1',
			model: 'google/gemini-3.1-flash-tts-preview',
			voices: []
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
			document.l10n.setAttributes(stamp, 'byok-version-line', {
				plugin: Zotero.BYOKTTS.version || '?',
				zotero: Zotero.version
			});
		}

		this.bindVoiceEditor();
		this.bindControls();
		this.renderSpeakerRows();
		await this.buildEmotionPicker();
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
		if (message) this.setState(isError ? 'error' : 'ok', message);
	},

	/**
	 * Colour the sticky button by the last outcome and put the gist beside it, so a run started
	 * from up here reports back without dragging the reader down to the output panel.
	 */
	setState(state, message) {
		let button = document.getElementById('byok-test-sticky');
		let summary = document.getElementById('byok-sticky-summary');
		if (button) {
			button.classList.remove('byok-state-idle', 'byok-state-ok', 'byok-state-error');
			button.classList.add('byok-state-' + state);
		}
		if (!summary) return;
		let firstLine = String(message || '').split('\n')[0];
		summary.textContent = firstLine.length > 110 ? firstLine.slice(0, 110) + '…' : firstLine;
		summary.classList.toggle('byok-error', state === 'error');
	},

	/** Scroll to the test controls and leave focus there. */
	jumpToTest() {
		let section = document.getElementById('byok-maintenance');
		if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
		let button = document.getElementById('byok-test');
		if (button) setTimeout(() => button.focus(), 250);
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

	/* -------------------------------------------------------------- models */

	// Offered before anything has been fetched, so the dropdown is useful without a key
	KNOWN_MODELS: {
		openai: ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd'],
		openrouter: [
			'google/gemini-3.1-flash-tts-preview',
			'deepgram/aura-2',
			'microsoft/mai-voice-2-flash',
			'mistralai/voxtral-mini-tts-2603',
			'x-ai/grok-voice-tts-1.0',
			'hexgrad/kokoro-82m'
		],
		elevenlabs: ['eleven_turbo_v2_5', 'eleven_multilingual_v2', 'eleven_flash_v2_5'],
		speechify: ['simba-3.0', 'simba-3.2', 'simba-english', 'simba-multilingual'],
		google: ['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'],
		azure: [],
		custom: []
	},

	/** Fill the Model combobox, keeping whatever is typed as the current value. */
	fillModelList(models) {
		let popup = document.getElementById('byok-model-popup');
		let list = document.getElementById('byok-model');
		if (!popup || !list) return;
		let current = list.value;
		popup.replaceChildren();
		for (let model of models) {
			let item = document.createXULElement('menuitem');
			item.setAttribute('value', model.id);
			item.setAttribute('label', model.label || model.id);
			popup.append(item);
		}
		// An editable menulist clears itself when its items change
		list.value = current;
	},

	resetModelList() {
		let provider = this.controlValue('byok-provider', 'provider') || 'openai';
		let known = this.KNOWN_MODELS[provider] || [];
		this.fillModelList(known.map(id => ({ id, label: id })));
	},

	async loadModels() {
		this.statusL10n('byok-msg-loading-models');
		try {
			let models = await Zotero.BYOKTTS.fetchRemoteModels();
			if (!models.length) {
				this.resetModelList();
				this.statusL10n('byok-msg-models-none', null, true);
				return;
			}
			this.fillModelList(models);
			this.statusL10n('byok-msg-models-loaded', { count: models.length });
		}
		catch (e) {
			Zotero.logError(e);
			this.resetModelList();
			this.statusL10n('byok-msg-models-failed', { detail: await this._describe(e) }, true);
		}
	},

	/* ---------------------------------------------------------- test menu */

	/**
	 * Right-click menu on the test buttons: which voice, which language, and optionally a
	 * phrase of your own instead of the built-in sample.
	 */
	async buildTestMenu(popup) {
		popup.replaceChildren();
		let voices = Zotero.BYOKTTS.getVoices();
		let chosenVoice = this.getPref('test.voice') || '';
		let chosenLocale = this.getPref('test.locale') || '';

		let submenu = (id) => {
			let menu = document.createXULElement('menu');
			document.l10n.setAttributes(menu, id);
			let child = document.createXULElement('menupopup');
			menu.append(child);
			popup.append(menu);
			return child;
		};
		let option = (label, checked, onCommand, parent) => {
			let item = document.createXULElement('menuitem');
			item.setAttribute('type', 'radio');
			item.setAttribute('label', label);
			if (checked) item.setAttribute('checked', 'true');
			item.addEventListener('command', onCommand);
			(parent || popup).append(item);
			return item;
		};

		// Voices and languages go into submenus — a provider list can run to ninety entries,
		// which as one flat menu is taller than the screen
		let voiceMenu = submenu('byok-test-menu-voice');
		option(await this.msg('byok-test-menu-first'), !chosenVoice,
			() => this.setPref('test.voice', ''), voiceMenu);
		for (let voice of voices) {
			option(voice.label || voice.id, chosenVoice === voice.id,
				() => this.setPref('test.voice', voice.id), voiceMenu);
		}

		let languageMenu = submenu('byok-test-menu-language');
		let locales = [...new Set(voices.flatMap(v => v.locales || []))];
		option(await this.msg('byok-test-menu-voice-default'), !chosenLocale,
			() => this.setPref('test.locale', ''), languageMenu);
		for (let locale of locales) {
			option(locale, chosenLocale === locale,
				() => this.setPref('test.locale', locale), languageMenu);
		}

		popup.append(document.createXULElement('menuseparator'));
		let custom = document.createXULElement('menuitem');
		document.l10n.setAttributes(custom, 'byok-test-menu-text');
		custom.addEventListener('command', () => this.promptTestText());
		popup.append(custom);
	},

	promptTestText() {
		let current = this.getPref('test.text') || '';
		let result = { value: current };
		let title = 'Read Aloud BYOK';
		let prompts = typeof Services !== "undefined" && Services.prompt;
		if (!prompts) return;
		let ok = prompts.prompt(window, title,
			// Fluent cannot be awaited from a prompt callback, so this one string is inline
			'Text to speak when testing (leave empty for the built-in sample):', result, null, {});
		if (ok) this.setPref('test.text', result.value.trim());
	},

	/* ------------------------------------------------------- speaking style */

	/**
	 * Tags that have been tried and behave, taken from the plugin so the skip rules and this
	 * picker cannot drift apart. They are English words the model reads as direction rather
	 * than speaking, so the text is never translated — only the group headings are.
	 */
	get EMOTIONS() {
		return Zotero.BYOKTTS.EMOTIONS || [];
	},

	/**
	 * A XUL menulist, not an html:select — the HTML control renders as a flat grey box in the
	 * preferences window and looks nothing like the menus beside it. XUL has no optgroup, so
	 * disabled items stand in as group headings.
	 */
	async buildEmotionPicker() {
		let popup = document.getElementById('byok-emotion-popup');
		let list = document.getElementById('byok-emotion-picker');
		if (!popup || !list) return;
		popup.replaceChildren();

		let placeholder = document.createXULElement('menuitem');
		placeholder.setAttribute('value', '');
		placeholder.setAttribute('label', await this.msg('byok-emotion-placeholder'));
		popup.append(placeholder);

		for (let [groupId, tags] of this.EMOTIONS) {
			popup.append(document.createXULElement('menuseparator'));
			let heading = document.createXULElement('menuitem');
			heading.setAttribute('label', await this.msg(groupId));
			heading.setAttribute('disabled', 'true');
			heading.classList.add('byok-menu-heading');
			popup.append(heading);
			for (let tag of tags) {
				let item = document.createXULElement('menuitem');
				item.setAttribute('value', `[${tag}]`);
				item.setAttribute('label', `[${tag}]`);
				popup.append(item);
			}
		}

		list.selectedIndex = 0;
		list.addEventListener('command', () => {
			let chosen = list.value;
			if (chosen) this.insertStyleTag(chosen);
			list.selectedIndex = 0;
		});
	},

	/** Drop a tag in at the cursor and let the preference binding pick the change up. */
	insertStyleTag(tag) {
		let area = document.getElementById('byok-style-prompt');
		if (!area) return;
		let text = area.value || '';
		let start = area.selectionStart ?? text.length;
		let end = area.selectionEnd ?? text.length;
		// Keep words apart without piling up spaces when inserting mid-sentence
		let before = text.slice(0, start);
		let after = text.slice(end);
		let lead = before && !/\s$/.test(before) ? ' ' : '';
		let trail = after && !/^\s/.test(after) ? ' ' : '';
		area.value = before + lead + tag + trail + after;
		let caret = (before + lead + tag).length;
		area.setSelectionRange?.(caret, caret);
		// 'input' is what Zotero listens for to write the preference
		area.dispatchEvent(new Event('input', { bubbles: true }));
		area.focus();
	},

	/* ----------------------------------------------------------- speakers */

	readSpeakers() {
		try {
			let parsed = JSON.parse(this.getPref('speakers') || '[]');
			return Array.isArray(parsed) ? parsed : [];
		}
		catch (e) {
			return [];
		}
	},

	writeSpeakers(speakers) {
		this.setPref('speakers', JSON.stringify(speakers));
		this.renderSpeakerRows();
	},

	renderSpeakerRows() {
		let host = document.getElementById('byok-speakers-rows');
		let empty = document.getElementById('byok-speakers-empty');
		if (!host) return;
		let speakers = this.readSpeakers();
		let voices = Zotero.BYOKTTS.getVoices();
		host.replaceChildren();
		if (empty) empty.hidden = speakers.length > 0;

		speakers.forEach((speaker, index) => {
			let row = document.createElement('div');
			row.className = 'byok-speaker-row';

			let tag = document.createElement('input');
			tag.type = 'text';
			tag.value = speaker.tag || '';
			tag.placeholder = 'Mara';
			tag.addEventListener('change', () => {
				let all = this.readSpeakers();
				all[index] = Object.assign({}, all[index], { tag: tag.value.trim() });
				this.writeSpeakers(all);
			});

			// A menulist rather than free text: the voice has to exist to be usable
			let picker = document.createXULElement('menulist');
			picker.setAttribute('native', 'true');
			let popup = document.createXULElement('menupopup');
			for (let voice of voices) {
				let item = document.createXULElement('menuitem');
				item.setAttribute('value', voice.id);
				item.setAttribute('label', voice.label || voice.id);
				popup.append(item);
			}
			picker.append(popup);
			picker.addEventListener('command', () => {
				let all = this.readSpeakers();
				all[index] = Object.assign({}, all[index], { voice: picker.value });
				this.writeSpeakers(all);
			});

			let remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'byok-voice-remove';
			remove.textContent = '✕';
			document.l10n.setAttributes(remove, 'byok-voices-remove');
			remove.addEventListener('click', () => {
				let all = this.readSpeakers();
				all.splice(index, 1);
				this.writeSpeakers(all);
			});

			row.append(tag, picker, remove);
			host.append(row);
			// Set after insertion, or the menulist has no items to match against yet
			picker.value = speaker.voice || (voices[0] && voices[0].id) || '';
		});
	},

	addSpeaker() {
		let voices = Zotero.BYOKTTS.getVoices();
		let speakers = this.readSpeakers();
		speakers.push({ tag: '', voice: (voices[0] && voices[0].id) || '' });
		this.writeSpeakers(speakers);
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
		// The speaker rows pick their voice from this list
		this.renderSpeakerRows();
	},

	/**
	 * Listen for the controls that change what is shown.
	 *
	 * These were inline oncommand attributes, which XUL compiles when the element is parsed —
	 * before Zotero attaches the listener that writes the preference. Registering here, during
	 * load, puts us behind Zotero's listener, so the preference is already written by the time
	 * we look. controlValue() still reads the element as a belt to this braces.
	 */
	bindControls() {
		let on = (id, handler) => {
			let elem = document.getElementById(id);
			if (elem) elem.addEventListener('command', handler);
		};
		on('byok-provider', () => this.onProviderChange());
		on('byok-format', () => this.updateVisibility());
		on('byok-voices-view', () => this.updateVoicesView());

		// Zotero populates preference-bound controls from a timer that runs after this, and an
		// unset radiogroup reports its first radio in the meantime — which is why the JSON view
		// was never restored. Re-read once the real value lands.
		let view = document.getElementById('byok-voices-view');
		if (view) view.addEventListener('syncfrompreference', () => this.updateVoicesView());
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

	/**
	 * Read a control's own value rather than its preference.
	 *
	 * XUL compiles an inline oncommand attribute when the element is parsed, which is before
	 * Zotero attaches the listener that writes the preference — so a handler reading the pref
	 * sees the previous value and the UI lags one click behind. The element itself is always
	 * current.
	 */
	controlValue(id, fallbackPref) {
		let elem = document.getElementById(id);
		// A radiogroup that has not been populated yet reports its first radio rather than
		// nothing, so only trust it once something is actually selected.
		if (elem && elem.localName === 'radiogroup' && !elem.selectedItem) {
			return this.getPref(fallbackPref);
		}
		let value = elem && elem.value;
		return (value === undefined || value === null || value === '')
			? this.getPref(fallbackPref)
			: value;
	},

	updateVoicesView() {
		let view = this.controlValue('byok-voices-view', 'voicesView') === 'json' ? 'json' : 'list';
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

		// The textarea can be value-less for a tick before the preference binding populates it
		let source = area.value || '';
		let pieces = [];
		// key | string | number | literal | punctuation, in that order
		let token = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|\b(true|false|null)\b|([{}\[\],:])/g;
		let last = 0;
		let match;
		while ((match = token.exec(source)) !== null) {
			pieces.push([null, source.slice(last, match.index)]);
			let cls = match[1] ? 'k' : match[2] ? 's' : match[3] ? 'n' : match[4] ? 'b' : 'p';
			pieces.push([cls, match[0]]);
			last = match.index + match[0].length;
		}
		// A trailing newline keeps the last line visible when the textarea scrolls to the end
		pieces.push([null, source.slice(last) + '\n']);

		// Built as nodes rather than assigned as innerHTML: markup parsing is the sort of thing
		// a chrome document can refuse, and a silent failure here shows as an empty editor.
		let container = pre.closest ? pre.closest('.byok-code') : pre.parentNode;
		try {
			let fragment = document.createDocumentFragment();
			for (let [cls, text] of pieces) {
				if (!text) continue;
				if (!cls) {
					fragment.append(document.createTextNode(text));
					continue;
				}
				let span = document.createElement('span');
				span.className = 'byok-t-' + cls;
				span.textContent = text;
				fragment.append(span);
			}
			pre.replaceChildren(fragment);
			// The textarea's own text is only hidden once something is definitely painted
			// underneath it — otherwise a failed render leaves the editor looking empty.
			container?.classList.add('byok-highlighted');
		}
		catch (e) {
			Zotero.logError(e);
			container?.classList.remove('byok-highlighted');
			return;
		}
		pre.scrollTop = area.scrollTop;
		pre.scrollLeft = area.scrollLeft;
	},

	/* ------------------------------------------------------------ provider */

	/**
	 * Swap in sensible defaults for the newly selected provider, but never overwrite a value
	 * the user typed themselves — only empties and other providers' defaults.
	 */
	onProviderChange(initialLoad) {
		let provider = this.controlValue('byok-provider', 'provider') || 'openai';
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
		let provider = this.controlValue('byok-provider', 'provider') || 'openai';
		let isPCM = this.controlValue('byok-format', 'format') === 'pcm';

		// OpenRouter is a separate entry in the menu but takes the OpenAI-shaped fields
		let openaiLike = provider === 'openai' || provider === 'openrouter';

		let show = (id, visible) => {
			let elem = document.getElementById(id);
			if (elem) elem.hidden = !visible;
		};
		// A grid row is a label and a control side by side, so both cells move together
		let showRow = (name, visible) => {
			for (let elem of document.querySelectorAll('.' + name)) elem.hidden = !visible;
		};
		showRow('byok-row-baseurl', provider !== 'custom');
		showRow('byok-row-model', provider !== 'azure');
		showRow('byok-row-format', openaiLike);
		showRow('byok-row-pcm', openaiLike && isPCM);
		show('byok-pcm-hint', openaiLike && isPCM);
		show('byok-custom-group', provider === 'custom');

		let baseLabel = document.getElementById('byok-baseurl-label');
		if (baseLabel) {
			document.l10n.setAttributes(baseLabel,
				provider === 'azure' ? 'byok-base-url-azure' : 'byok-base-url');
		}
		let loadButton = document.getElementById('byok-load-voices');
		if (loadButton) {
			loadButton.disabled = !['openai', 'openrouter', 'elevenlabs', 'speechify'].includes(provider);
		}
		let modelsButton = document.getElementById('byok-load-models');
		if (modelsButton) {
			modelsButton.disabled = ['azure', 'custom'].includes(provider);
		}
		this.resetModelList();
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
		// Right-click on the button overrides any of these
		let wantedVoice = this.getPref('test.voice');
		let voice = voices.find(v => v.id === wantedVoice) || voices[0];
		let locale = this.getPref('test.locale') || voice.locales[0];
		let text = this.getPref('test.text') || Zotero.BYOKTTS.sampleTextFor(locale);

		this.statusL10n('byok-msg-requesting', { voice: voice.label });
		try {
			let blob = await Zotero.BYOKTTS.synthesize(text, voice, locale);
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
