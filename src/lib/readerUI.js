/*
	Read Aloud BYOK — Skip controls inside the reader's Read Aloud popup.

	Zotero's plugin API exposes eight reader events, none of which covers the Read Aloud popup.
	'renderToolbar' does hand us the reader and its iframe document though, and that is enough:
	from there a MutationObserver waits for .read-aloud-popup to be mounted and appends a Skip
	row to it. The popup is React-rendered, so the observer re-appends whenever it is remounted.
*/

Zotero.BYOKTTS.ReaderUI = new function () {
	const PLUGIN_ID = 'byok-tts@local';
	const POPUP = '.read-aloud-popup';
	const MARKER = 'byok-skip-row';

	let _observers = new WeakMap();
	let _prepared = new WeakSet();
	let _handler = null;

	const STYLE = `
		.byok-skip-row { padding-top: 8px; }
		.byok-skip-row button {
			flex: 1; display: flex; align-items: center; justify-content: space-between;
			gap: 6px; padding: 4px 6px; background: none; border: none; border-radius: 4px;
			color: inherit; font: inherit; cursor: default;
		}
		.byok-skip-row button:hover { background: var(--fill-quinary, rgba(128,128,128,.15)); }
		.byok-skip-row .byok-count {
			font-size: .85em; opacity: .65; font-variant: tabular-nums;
		}
		.byok-skip-panel {
			display: flex; flex-direction: column; gap: 2px;
			max-height: 240px; overflow-y: auto; padding: 4px 6px 2px;
		}
		.byok-skip-panel label {
			display: flex; align-items: center; gap: 6px; padding: 2px 0; cursor: default;
		}
		.byok-skip-panel label input { margin: 0; flex-shrink: 0; }
		.byok-skip-panel .byok-note { opacity: .6; font-size: .85em; padding-top: 4px; }
	`;

	/* ------------------------------------------------------------- injection */

	this._injectStyle = function (doc) {
		if (doc.getElementById('byok-skip-style')) return;
		let style = doc.createElement('style');
		style.id = 'byok-skip-style';
		style.textContent = STYLE;
		(doc.head || doc.documentElement).append(style);
	};

	this._buildPanel = function (doc, reader) {
		let Skip = Zotero.BYOKTTS.Skip;

		let row = doc.createElement('div');
		row.className = 'row ' + MARKER;

		let button = doc.createElement('button');
		let label = doc.createElement('span');
		label.textContent = 'Skip';
		let count = doc.createElement('span');
		count.className = 'byok-count';
		button.append(label, count);
		row.append(button);

		let panel = doc.createElement('div');
		panel.className = 'byok-skip-panel';
		panel.hidden = true;

		let refreshCount = () => {
			let on = Skip.RULES.filter(rule => Skip.isOn(rule.key)).length;
			count.textContent = on ? `${on} on` : 'none';
		};

		for (let rule of Skip.RULES) {
			let item = doc.createElement('label');
			let box = doc.createElement('input');
			box.type = 'checkbox';
			box.checked = Skip.isOn(rule.key);
			box.addEventListener('change', () => {
				Skip.setOn(rule.key, box.checked);
				refreshCount();
				// Cached audio is keyed on the original text, so it would otherwise survive
				Zotero.BYOKTTS.clearAudioCache().catch(e => Zotero.logError(e));
			});
			let text = doc.createElement('span');
			text.textContent = rule.label;
			item.append(box, text);
			panel.append(item);
		}

		let note = doc.createElement('div');
		note.className = 'byok-note';
		note.textContent = 'Skipped passages stay highlighted, but are silent and cost nothing.';
		panel.append(note);

		button.addEventListener('click', () => {
			panel.hidden = !panel.hidden;
			if (!panel.hidden) this._analyze(reader);
		});

		refreshCount();
		return [row, panel];
	};

	this._inject = function (popup, doc, reader) {
		// Backstop: if preparing at open time failed, the document is certainly loaded by now
		this._prepare(reader).catch(e => Zotero.logError(e));
		this._analyze(reader);
		if (popup.querySelector('.' + MARKER)) return;
		this._injectStyle(doc);
		let [row, panel] = this._buildPanel(doc, reader);
		popup.append(row, panel);
	};

	/* ------------------------------------------------------ document measuring */

	/**
	 * Read the reader's own segment list so the structural rules know what body text looks
	 * like in this document. Everything here is reader internals, so failure is non-fatal —
	 * the text rules keep working without it.
	 */
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

	this._watch = function (reader, doc) {
		if (!doc || !doc.body || _observers.has(doc)) return;

		let attach = () => {
			for (let popup of doc.querySelectorAll(POPUP)) {
				try {
					this._inject(popup, doc, reader);
				}
				catch (e) {
					Zotero.logError(e);
				}
			}
		};

		let observer = new doc.defaultView.MutationObserver(attach);
		observer.observe(doc.body, { childList: true, subtree: true });
		_observers.set(doc, observer);
		attach();

		// Rewrite the reading order now, long before playback can reach it
		this._prepare(reader).catch(e => Zotero.logError(e));
	};

	this.init = function () {
		_handler = (event) => {
			try {
				this._watch(event.reader, event.doc);
			}
			catch (e) {
				Zotero.logError(e);
			}
		};
		// Fires once the reader iframe is live; we only use it as a ready signal
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
				_observers.get(doc)?.disconnect();
				doc?.getElementById('byok-skip-style')?.remove();
				for (let node of doc?.querySelectorAll('.' + MARKER + ', .byok-skip-panel') || []) {
					node.remove();
				}
			}
			catch (e) {
				// Reader may already be gone
			}
		}
		_observers = new WeakMap();
	};
};
