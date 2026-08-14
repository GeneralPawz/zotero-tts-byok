/*
	Read Aloud BYOK — the reading panel in the reader toolbar.

	Zotero's Read Aloud popup is a React component with no plugin hook, and the live playback
	controller is created inside it — so it cannot be replaced without reimplementing playback,
	and appending nodes to it only lasts until React next re-renders. An earlier build did exactly
	that and the Skip row kept vanishing.

	'renderToolbar' is a supported event and hands us the reader, its document and an append().
	So the transport controls stay Zotero's, and everything Zotero has no concept of — what to
	leave out, which voices take turns, who speaks which line — lives in a panel of our own next
	to them. Settings changed here apply to this document only; the preferences pane still sets
	the defaults every other document inherits.
*/

Zotero.BYOKTTS.ReaderUI = new function () {
	const PLUGIN_ID = 'byok-tts@local';
	const BUTTON_ID = 'byok-doc-button';
	const PANEL_ID = 'byok-doc-panel';

	let _prepared = new WeakSet();
	let _handler = null;
	let _l10n = null;

	// Sliders, not a speaker: this configures reading, it does not start it. Sized and coloured
	// like the reader's own toolbar icons so it sits with them rather than beside them.
	const ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">'
		+ '<path fill="currentColor" fill-rule="evenodd" d="M13 4.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5'
		+ 'm1.9-.125a2 2 0 0 1-3.8 0H2v-1.25h9.1a2 2 0 0 1 3.8 0H18v1.25zM7 10.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5'
		+ 'm1.9-.125a2 2 0 0 1-3.8 0H2v-1.25h3.1a2 2 0 0 1 3.8 0H18v1.25zM13 16.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5'
		+ 'm1.9-.125a2 2 0 0 1-3.8 0H2v-1.25h9.1a2 2 0 0 1 3.8 0H18v1.25z" clip-rule="evenodd"/></svg>';

	const STYLE = `
		#${PANEL_ID} {
			position: fixed; z-index: 10000; width: 320px; max-height: 70vh; overflow-y: auto;
			padding: 10px 12px 12px; border-radius: 6px;
			background: var(--material-toolbar, Field); color: var(--fill-primary, FieldText);
			border: 1px solid var(--fill-quinary, rgba(128,128,128,.3));
			box-shadow: 0 4px 18px rgba(0,0,0,.24);
			font: message-box; font-size: 12px;
		}
		#${PANEL_ID}[hidden] { display: none; }
		#${PANEL_ID} h3 {
			margin: 12px 0 4px; font-size: 11px; text-transform: uppercase;
			letter-spacing: .04em; opacity: .55; font-weight: 600;
		}
		#${PANEL_ID} h3:first-of-type { margin-top: 6px; }
		.byok-doc-head { display: flex; align-items: baseline; gap: 6px; }
		.byok-doc-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.byok-doc-scope { opacity: .6; font-size: 11px; }
		.byok-doc-reset {
			margin-left: auto; background: none; border: none; color: inherit; opacity: .7;
			cursor: default; font: inherit; text-decoration: underline; padding: 0; flex-shrink: 0;
		}
		.byok-doc-reset[hidden] { display: none; }
		.byok-field { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
		.byok-field label { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; cursor: default; }
		.byok-field input[type="checkbox"] { margin: 0; flex-shrink: 0; }
		.byok-field select, .byok-field input[type="text"] { flex: 1; min-width: 0; font: inherit; }
		.byok-field textarea { width: 100%; font: inherit; font-size: 11px; min-height: 46px; resize: vertical; }
		/* A dot marks a setting this document disagrees with the global default about */
		.byok-revert {
			background: none; border: none; padding: 0 2px; cursor: default; color: inherit;
			opacity: .75; flex-shrink: 0; width: 14px; text-align: center;
		}
		.byok-revert[hidden] { visibility: hidden; display: inline-block; }
		.byok-note { opacity: .6; font-size: 11px; padding-top: 6px; line-height: 1.35; }
		.byok-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 4px; padding: 1px 0; }
		.byok-row input, .byok-row select { min-width: 0; font: inherit; }
		.byok-add { background: none; border: 1px solid var(--fill-quinary, rgba(128,128,128,.4));
			border-radius: 4px; color: inherit; font: inherit; padding: 2px 8px; cursor: default; margin-top: 4px; }
	`;

	/* ------------------------------------------------------------- strings */

	// The reader iframe has no Fluent of its own; the parent can still resolve our bundle, and
	// falls back to English rather than rendering blank labels if it cannot.
	const EN = {
		'byok-doc-heading': 'This document',
		'byok-doc-reset': 'Use global settings',
		'byok-doc-none': 'Open a document to change its settings.',
		'byok-doc-section-reading': 'Reading',
		'byok-doc-section-skip': 'Skip',
		'byok-doc-section-cast': 'Alternating voices',
		'byok-doc-section-speakers': 'Speakers',
		'byok-doc-granularity': 'Read by',
		'byok-doc-smooth': 'Prune skipped text from the reading order',
		'byok-doc-custom': 'Also skip lines containing (one per line)',
		'byok-doc-cast-mode': 'Change voice every',
		'byok-doc-cast-add': 'Add voice to rotation',
		'byok-doc-speakers-add': 'Add speaker',
		'byok-doc-default-voice': 'Voice for untagged text',
		'byok-doc-revert': 'Back to the global default',
		'byok-doc-note': 'These apply to this document only. Newly skipped text goes silent at '
			+ 'once; text already pruned from the reading order comes back when the document is '
			+ 'reopened.'
	};

	this._string = function (id) {
		try {
			if (_l10n === null) _l10n = new Localization(['read-aloud-byok.ftl'], true);
			let value = _l10n.formatValueSync(id);
			if (value) return value;
		}
		catch (e) {
			_l10n = false;
		}
		return EN[id] || id;
	};

	/* --------------------------------------------------------------- values */

	const GLOBAL = 'extensions.zotero.byokTTS.';

	/** The value in force for this document: its own if it has one, otherwise the global. */
	this._value = function (key) {
		let scoped = Zotero.BYOKTTS.DocPrefs.resolve(key);
		return scoped === undefined ? Zotero.Prefs.get(GLOBAL + key, true) : scoped;
	};

	this._overridden = function (key) {
		return Zotero.BYOKTTS.DocPrefs.resolve(key) !== undefined;
	};

	/**
	 * Write a per-document value and throw away what depended on it. Zotero's audio cache is keyed
	 * on voice and text, so a change that alters either has to clear it or the previous reading
	 * simply plays again.
	 */
	this._set = function (key, value, refresh) {
		Zotero.BYOKTTS.DocPrefs.set(key, value);
		Zotero.BYOKTTS.clearAudioCache().catch(e => Zotero.logError(e));
		if (refresh) refresh();
	};

	this._unset = function (key, refresh) {
		Zotero.BYOKTTS.DocPrefs.unset(key);
		Zotero.BYOKTTS.clearAudioCache().catch(e => Zotero.logError(e));
		if (refresh) refresh();
	};

	/* ---------------------------------------------------------------- fields */

	/** Common wrapper: the control, plus the dot that reverts it to the global default. */
	this._field = function (doc, key, control, refresh) {
		let wrap = doc.createElement('div');
		wrap.className = 'byok-field';
		let revert = doc.createElement('button');
		revert.className = 'byok-revert';
		revert.textContent = '●';
		revert.title = this._string('byok-doc-revert');
		revert.hidden = !this._overridden(key);
		revert.addEventListener('click', () => this._unset(key, refresh));
		wrap.append(control, revert);
		return wrap;
	};

	this._checkbox = function (doc, key, label, refresh) {
		let holder = doc.createElement('label');
		let box = doc.createElement('input');
		box.type = 'checkbox';
		box.checked = !!this._value(key);
		box.addEventListener('change', () => this._set(key, box.checked, refresh));
		let text = doc.createElement('span');
		text.textContent = label;
		holder.append(box, text);
		return this._field(doc, key, holder, refresh);
	};

	this._select = function (doc, key, label, options, refresh) {
		let holder = doc.createElement('label');
		let text = doc.createElement('span');
		text.textContent = label;
		let select = doc.createElement('select');
		for (let [value, caption] of options) {
			let option = doc.createElement('option');
			option.value = value;
			option.textContent = caption;
			select.append(option);
		}
		select.value = String(this._value(key) ?? '');
		select.addEventListener('change', () => this._set(key, select.value, refresh));
		holder.append(text, select);
		return this._field(doc, key, holder, refresh);
	};

	this._textarea = function (doc, key, label, refresh) {
		let holder = doc.createElement('div');
		let caption = doc.createElement('div');
		caption.textContent = label;
		let area = doc.createElement('textarea');
		area.value = String(this._value(key) ?? '');
		// Committed on blur rather than per keystroke: every write clears the audio cache
		area.addEventListener('change', () => this._set(key, area.value, refresh));
		holder.append(caption, area);
		let wrap = this._field(doc, key, holder, refresh);
		wrap.style.display = 'block';
		return wrap;
	};

	/* ----------------------------------------------------------------- lists */

	this._voiceOptions = function () {
		return Zotero.BYOKTTS.getVoices().map(v => [v.id, v.label || v.id]);
	};

	/** Ordered rows of voice pickers, for the rotation. */
	this._castRotation = function (doc, refresh) {
		let key = 'cast.voices';
		let host = doc.createElement('div');
		let ids = [];
		try {
			ids = JSON.parse(this._value(key) || '[]');
		}
		catch (e) {
			ids = [];
		}
		let voices = this._voiceOptions();
		let write = list => this._set(key, JSON.stringify(list), refresh);

		ids.forEach((id, index) => {
			let row = doc.createElement('div');
			row.className = 'byok-row';
			let turn = doc.createElement('span');
			turn.textContent = String(index + 1);
			let select = doc.createElement('select');
			for (let [value, caption] of voices) {
				let option = doc.createElement('option');
				option.value = value;
				option.textContent = caption;
				select.append(option);
			}
			select.value = id;
			select.addEventListener('change', () => {
				let all = ids.slice();
				all[index] = select.value;
				write(all);
			});
			let remove = doc.createElement('button');
			remove.className = 'byok-revert';
			remove.textContent = '✕';
			remove.hidden = false;
			remove.addEventListener('click', () => write(ids.filter((v, i) => i !== index)));
			row.append(turn, select, remove);
			host.append(row);
		});

		let add = doc.createElement('button');
		add.className = 'byok-add';
		add.textContent = this._string('byok-doc-cast-add');
		add.addEventListener('click', () => {
			let next = voices.find(([id]) => !ids.includes(id)) || voices[0];
			if (next) write(ids.concat([next[0]]));
		});
		host.append(add);
		return host;
	};

	/** Tag → voice rows. */
	this._speakerRows = function (doc, refresh) {
		let key = 'speakers';
		let host = doc.createElement('div');
		let speakers = [];
		try {
			speakers = JSON.parse(this._value(key) || '[]');
			if (!Array.isArray(speakers)) speakers = [];
		}
		catch (e) {
			speakers = [];
		}
		let voices = this._voiceOptions();
		let write = list => this._set(key, JSON.stringify(list), refresh);

		speakers.forEach((speaker, index) => {
			let row = doc.createElement('div');
			row.className = 'byok-row';
			let tag = doc.createElement('input');
			tag.type = 'text';
			tag.placeholder = 'Mara';
			tag.value = speaker.tag || '';
			tag.addEventListener('change', () => {
				let all = speakers.map(s => Object.assign({}, s));
				all[index].tag = tag.value.trim();
				write(all);
			});
			let select = doc.createElement('select');
			for (let [value, caption] of voices) {
				let option = doc.createElement('option');
				option.value = value;
				option.textContent = caption;
				select.append(option);
			}
			select.value = speaker.voice || '';
			select.addEventListener('change', () => {
				let all = speakers.map(s => Object.assign({}, s));
				all[index].voice = select.value;
				write(all);
			});
			let remove = doc.createElement('button');
			remove.className = 'byok-revert';
			remove.textContent = '✕';
			remove.addEventListener('click', () => write(speakers.filter((s, i) => i !== index)));
			row.append(tag, select, remove);
			host.append(row);
		});

		let add = doc.createElement('button');
		add.className = 'byok-add';
		add.textContent = this._string('byok-doc-speakers-add');
		add.addEventListener('click', () => {
			write(speakers.concat([{ tag: '', voice: (voices[0] && voices[0][0]) || '' }]));
		});
		host.append(add);
		return host;
	};

	/* ----------------------------------------------------------------- panel */

	this._buildPanel = function (doc, reader) {
		let panel = doc.createElement('div');
		panel.id = PANEL_ID;
		panel.hidden = true;

		let refresh = () => {
			let open = !panel.hidden;
			this._fill(doc, panel, reader, refresh);
			panel.hidden = !open;
		};
		this._fill(doc, panel, reader, refresh);
		return panel;
	};

	this._fill = function (doc, panel, reader, refresh) {
		let DocPrefs = Zotero.BYOKTTS.DocPrefs;
		let Skip = Zotero.BYOKTTS.Skip;
		panel.replaceChildren();

		let scope = DocPrefs.scopeFor(reader);
		if (!scope) {
			let none = doc.createElement('div');
			none.className = 'byok-note';
			none.textContent = this._string('byok-doc-none');
			panel.append(none);
			return;
		}
		// Pin the scope so every read below resolves against this document, not whichever
		// reader happens to be frontmost
		DocPrefs.setScope(scope);

		let head = doc.createElement('div');
		head.className = 'byok-doc-head';
		let title = doc.createElement('span');
		title.className = 'byok-doc-title';
		title.textContent = DocPrefs.titleFor(scope) || this._string('byok-doc-heading');
		let reset = doc.createElement('button');
		reset.className = 'byok-doc-reset';
		reset.textContent = this._string('byok-doc-reset');
		reset.hidden = !DocPrefs.overrideCount(scope);
		reset.addEventListener('click', () => {
			DocPrefs.clear(scope);
			Zotero.BYOKTTS.clearAudioCache().catch(e => Zotero.logError(e));
			refresh();
		});
		head.append(title, reset);
		panel.append(head);

		let section = (id) => {
			let heading = doc.createElement('h3');
			heading.textContent = this._string(id);
			panel.append(heading);
		};

		section('byok-doc-section-reading');
		panel.append(this._select(doc, 'granularity', this._string('byok-doc-granularity'),
			[['sentence', 'Sentence'], ['paragraph', 'Paragraph']], refresh));

		section('byok-doc-section-skip');
		for (let rule of Skip.RULES) {
			panel.append(this._checkbox(doc, 'skip.' + rule.key, rule.label, refresh));
		}
		panel.append(this._checkbox(doc, 'skip.smoothOrder', this._string('byok-doc-smooth'), refresh));
		panel.append(this._textarea(doc, 'skip.custom', this._string('byok-doc-custom'), refresh));

		section('byok-doc-section-cast');
		panel.append(this._select(doc, 'cast.mode', this._string('byok-doc-cast-mode'), [
			['off', 'Off — one voice'], ['sentence', 'Sentence'], ['paragraph', 'Paragraph'],
			['page', 'Page'], ['section', 'Section']
		], refresh));
		if (this._value('cast.mode') !== 'off') {
			panel.append(this._field(doc, 'cast.voices', this._castRotation(doc, refresh), refresh));
		}

		section('byok-doc-section-speakers');
		panel.append(this._field(doc, 'speakers', this._speakerRows(doc, refresh), refresh));
		panel.append(this._select(doc, 'speakers.default', this._string('byok-doc-default-voice'),
			[['', '—']].concat(this._voiceOptions()), refresh));

		let note = doc.createElement('div');
		note.className = 'byok-note';
		note.textContent = this._string('byok-doc-note');
		panel.append(note);
	};

	/* ------------------------------------------------------------- injection */

	this._injectStyle = function (doc) {
		if (doc.getElementById('byok-doc-style')) return;
		let style = doc.createElement('style');
		style.id = 'byok-doc-style';
		style.textContent = STYLE;
		(doc.head || doc.documentElement).append(style);
	};

	this._addButton = function (event) {
		let { doc, reader, append } = event;
		if (!doc || doc.getElementById(BUTTON_ID)) return;
		this._injectStyle(doc);

		let button = doc.createElement('button');
		button.id = BUTTON_ID;
		// Zotero's own toolbar buttons carry this class; matching it inherits their sizing,
		// hover and active states rather than approximating them
		button.className = 'toolbar-button';
		button.title = this._string('byok-doc-heading');
		button.tabIndex = -1;
		button.innerHTML = ICON;

		let panel = this._buildPanel(doc, reader);
		doc.body.append(panel);

		let close = (e) => {
			if (panel.hidden) return;
			if (e && (panel.contains(e.target) || button.contains(e.target))) return;
			panel.hidden = true;
			button.classList.remove('active');
		};
		button.addEventListener('click', (e) => {
			e.stopPropagation();
			if (panel.hidden) {
				this._fill(doc, panel, reader, () => this._fill(doc, panel, reader, () => {}));
				let rect = button.getBoundingClientRect();
				panel.style.top = `${Math.round(rect.bottom + 4)}px`;
				// Kept inside the window when the button sits near the right edge
				let left = Math.min(rect.left, doc.documentElement.clientWidth - 332);
				panel.style.left = `${Math.round(Math.max(8, left))}px`;
				panel.hidden = false;
				button.classList.add('active');
				this._analyze(reader);
			}
			else {
				close();
			}
		});
		doc.addEventListener('click', close);
		doc.addEventListener('keydown', e => e.key === 'Escape' && close());

		append(button);
	};

	/* ------------------------------------------------------ document measuring */

	this._analyze = function (reader) {
		let Skip = Zotero.BYOKTTS.Skip;
		Skip.setSource(reader);
		return Skip.ensureStats();
	};

	/**
	 * Build the segment list ourselves as soon as the reader opens, then prune and stitch it
	 * before the reader ever asks for it. _initReadAloudSegments caches its promise, so the
	 * reader's own later call returns our already-rewritten arrays rather than rebuilding.
	 *
	 * Doing this at open time rather than at playback time is deliberate: splicing the array
	 * out from under a running controller would desync its position.
	 */
	this._prepare = async function (reader) {
		let Skip = Zotero.BYOKTTS.Skip;
		// Scope first, or the rules are read against whichever document was measured last
		Zotero.BYOKTTS.DocPrefs.setScope(Zotero.BYOKTTS.DocPrefs.scopeFor(reader));
		if (!Skip.anyOn() && !Skip.isOn('smoothOrder')) return;
		if (_prepared.has(reader)) return;
		_prepared.add(reader);
		try {
			let view = reader?._internalReader?._primaryView;
			if (!view || typeof view._initReadAloudSegments !== 'function') {
				throw new Error('primary view not ready');
			}
			// renderToolbar fires while the PDF is still loading; building segments before the
			// document exists yields an empty list, and _initReadAloudSegments caches its promise
			if (view.initializedPromise) await view.initializedPromise;
			await view._initReadAloudSegments();
			Skip.setSource(reader);
			Zotero.BYOKTTS.Log?.session('document opened');
			Zotero.BYOKTTS.Log?.write('prepare', {
				ok: true,
				scope: Zotero.BYOKTTS.DocPrefs.scopeFor(reader),
				overrides: Zotero.BYOKTTS.DocPrefs.overrideCount(),
				sentences: view._readAloudSegments?.sentences?.length ?? null,
				paragraphs: view._readAloudSegments?.paragraphs?.length ?? null
			});
			Skip.rewrite(view);
		}
		catch (e) {
			// Falls back to silencing segments one by one, which needs no reader internals
			Zotero.debug('BYOK TTS: could not rewrite the reading order — ' + (e.message || e));
			Zotero.BYOKTTS.Log?.write('prepare', { ok: false, error: e.message || String(e) });
			_prepared.delete(reader);
		}
	};

	/* ------------------------------------------------------------- lifecycle */

	this.init = function () {
		_handler = (event) => {
			try {
				this._addButton(event);
				this._prepare(event.reader).catch(e => Zotero.logError(e));
			}
			catch (e) {
				Zotero.logError(e);
			}
		};
		Zotero.Reader.registerEventListener('renderToolbar', _handler, PLUGIN_ID);
	};

	this.uninit = function () {
		if (_handler) {
			Zotero.Reader.unregisterEventListener('renderToolbar', _handler);
			_handler = null;
		}
		for (let reader of Zotero.Reader._readers || []) {
			try {
				let doc = reader._iframeWindow?.document;
				doc?.getElementById('byok-doc-style')?.remove();
				doc?.getElementById(BUTTON_ID)?.remove();
				doc?.getElementById(PANEL_ID)?.remove();
			}
			catch (e) {
				// Reader may already be gone
			}
		}
	};
};
