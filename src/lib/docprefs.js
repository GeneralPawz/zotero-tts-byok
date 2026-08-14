/*
	Read Aloud BYOK — per-document settings.

	Everything about *who does the speaking* — provider, key, model, the voice catalogue — is an
	account-level choice and stays global. Everything about *how this document is read* is not: a
	standard wants its running heads dropped and a voice per clause, a novel wants neither, and
	re-setting all of it globally every time you switch between the two is the whole complaint.

	So the settings below can be overridden per attachment. Storage is sparse — only keys actually
	changed for a document are written, and a document with no overrides resolves to the global
	value, so changing a global default still moves every document that never disagreed with it.
*/

Zotero.BYOKTTS.DocPrefs = new function () {
	const PREF = 'extensions.zotero.byokTTS.perDocument';

	/*
		Overridable keys, as they appear in the preference namespace. Anything not listed here is
		global and stays global — resolve() returns undefined for it and the caller falls through
		to Zotero.Prefs, which is what makes this safe to put behind the ordinary getPref().
	*/
	this.KEYS = [
		'granularity',
		'stylePrompt',
		'speakers',
		'speakers.default',
		'cast.mode',
		'cast.voices',
		'skip.custom',
		'skip.smoothOrder',
		...['frontMatter', 'headersFooters', 'footnotes', 'tables', 'formulas',
			'citations', 'urls', 'parens', 'brackets', 'braces'].map(k => 'skip.' + k)
	];

	let _scope = null;

	this.overridable = function (key) {
		return this.KEYS.includes(key);
	};

	/* --------------------------------------------------------------- identity */

	/** @return {String|null} "libraryID/itemKey" for a reader's attachment */
	this.scopeFor = function (reader) {
		try {
			let itemID = reader?.itemID;
			if (!itemID) return null;
			let item = Zotero.Items.get(itemID);
			if (!item) return null;
			return `${item.libraryID}/${item.key}`;
		}
		catch (e) {
			return null;
		}
	};

	/**
	 * Which document's settings apply right now. Playback runs in the parent process and is not
	 * told which reader it belongs to, so the reader Skip is already measuring is the same one
	 * the audio is for.
	 */
	this.scope = function () {
		if (_scope) return _scope;
		return this.scopeFor(Zotero.BYOKTTS.Skip?._findReader?.());
	};

	/** Pin a scope explicitly — the preferences pane edits a document that is not "current". */
	this.setScope = function (scope) {
		_scope = scope || null;
	};

	this.titleFor = function (scope) {
		try {
			let [libraryID, key] = String(scope || '').split('/');
			let item = Zotero.Items.getByLibraryAndKey(Number(libraryID), key);
			if (!item) return null;
			// An attachment's own title is usually "PDF"; the parent is what people recognise
			let parent = item.parentItem;
			return (parent || item).getDisplayTitle?.() || item.getField?.('title') || null;
		}
		catch (e) {
			return null;
		}
	};

	/* ---------------------------------------------------------------- storage */

	this.all = function () {
		try {
			let raw = Zotero.Prefs.get(PREF, true);
			let parsed = raw ? JSON.parse(raw) : {};
			return (parsed && typeof parsed === 'object') ? parsed : {};
		}
		catch (e) {
			Zotero.logError(new Error('BYOK TTS: per-document settings are not valid JSON: ' + e.message));
			return {};
		}
	};

	this.forDoc = function (scope) {
		let key = scope || this.scope();
		if (!key) return {};
		return this.all()[key] || {};
	};

	this.overrideCount = function (scope) {
		return Object.keys(this.forDoc(scope)).length;
	};

	/**
	 * The value for a key in the current document, or undefined when the document has nothing to
	 * say about it and the global default should be used.
	 */
	this.resolve = function (key, scope) {
		if (!this.overridable(key)) return undefined;
		let doc = this.forDoc(scope);
		return Object.prototype.hasOwnProperty.call(doc, key) ? doc[key] : undefined;
	};

	this.set = function (key, value, scope) {
		if (!this.overridable(key)) {
			throw new Error(`BYOK TTS: "${key}" is a global setting and cannot be set per document`);
		}
		let target = scope || this.scope();
		if (!target) return false;
		let all = this.all();
		all[target] = Object.assign({}, all[target], { [key]: value });
		this._write(all);
		return true;
	};

	/** Drop one override, so the key follows the global default again. */
	this.unset = function (key, scope) {
		let target = scope || this.scope();
		if (!target) return false;
		let all = this.all();
		if (!all[target] || !Object.prototype.hasOwnProperty.call(all[target], key)) return false;
		delete all[target][key];
		if (!Object.keys(all[target]).length) delete all[target];
		this._write(all);
		return true;
	};

	/** Drop every override for a document. */
	this.clear = function (scope) {
		let target = scope || this.scope();
		if (!target) return false;
		let all = this.all();
		if (!all[target]) return false;
		delete all[target];
		this._write(all);
		return true;
	};

	this._write = function (all) {
		Zotero.Prefs.set(PREF, JSON.stringify(all), true);
		// The measurements and the voice rotation both depend on these, and both are cached per
		// document, so they have to be thrown away the moment one changes
		Zotero.BYOKTTS.Skip.stats = null;
		Zotero.BYOKTTS.Cast?.invalidate?.();
	};

	/** Forget documents that are no longer in the library, so the map cannot grow without end. */
	this.prune = function () {
		let all = this.all();
		let removed = 0;
		for (let scope of Object.keys(all)) {
			let [libraryID, key] = scope.split('/');
			let item = null;
			try {
				item = Zotero.Items.getByLibraryAndKey(Number(libraryID), key);
			}
			catch (e) {
				item = null;
			}
			if (!item) {
				delete all[scope];
				removed++;
			}
		}
		if (removed) this._write(all);
		return removed;
	};
};
