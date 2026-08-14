/*
	Read Aloud BYOK — casting untagged documents.

	Speaker tags give each character a voice, but you cannot tag a standard you did not write.
	This hands a document two or more voices anyway, rotating them over a chosen unit: every
	sentence, every paragraph, every page, or every section.

	The rotation has to be a pure function of the segment, never a counter. Zotero prefetches
	three segments ahead, caches audio keyed on voice and text, and lets you seek anywhere in the
	document. A counter would hand the same paragraph a different voice depending on the route
	taken to reach it, which both sounds wrong on a re-read and quietly poisons the cache. So the
	document is walked once and every segment is assigned its rotation number up front.

	Units are counted over what is actually spoken. Skipped furniture still occupies a paragraph
	index of its own, so counting raw indices makes two body paragraphs either side of a running
	head land on the same voice — alternation that visibly stops alternating.
*/

Zotero.BYOKTTS.Cast = new function () {
	const PREF = 'extensions.zotero.byokTTS.cast.';

	// Rotating over a unit the reader never emits would leave one voice reading everything, so
	// 'sentence' falls back to paragraphs when the document is read a paragraph at a time.
	this.MODES = ['off', 'sentence', 'paragraph', 'page', 'section'];

	// A heading is set larger than the body, or numbered like a clause. Standards use both, and
	// either alone is weak: 4.2 in running text is not a heading, and neither is one large line
	// of a pull quote.
	const HEADING_SCALE = 1.15;
	const HEADING_MAX_CHARS = 120;
	const CLAUSE_NUMBER = /^\d+(\.\d+)*\s+\S/;

	// Segment key → rotation number, for the document currently loaded
	this.index = null;
	this.lastError = null;

	let _sourceID = null;
	let _building = null;

	this.mode = function () {
		let mode = Zotero.BYOKTTS.DocPrefs?.resolve('cast.mode');
		if (mode === undefined) mode = Zotero.Prefs.get(PREF + 'mode', true);
		return this.MODES.includes(mode) ? mode : 'off';
	};

	/** @return {String[]} ids of the voices to rotate, in order */
	this.voices = function () {
		let raw = Zotero.BYOKTTS.DocPrefs?.resolve('cast.voices');
		if (raw === undefined) raw = Zotero.Prefs.get(PREF + 'voices', true);
		if (!raw) return [];
		try {
			let parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string' && id) : [];
		}
		catch (e) {
			Zotero.logError(new Error('BYOK TTS: cast voice list is not valid JSON: ' + e.message));
			return [];
		}
	};

	/** One voice is not a rotation, so two is the minimum for the feature to do anything. */
	this.enabled = function () {
		// Only podcast mode rotates; narrator and audiobook decide the voice another way, and a
		// rotation left configured from a previous mode must not leak into them
		if (Zotero.BYOKTTS.mode() !== 'podcast') return false;
		return this.mode() !== 'off' && this.voices().length >= 2;
	};

	this.invalidate = function () {
		this.index = null;
		_sourceID = null;
	};

	/**
	 * Walk the document once and assign every segment its rotation number.
	 * Safe to call per segment: the work happens once and concurrent callers share the promise.
	 */
	this.ensureIndex = async function () {
		if (!this.enabled()) return null;
		let Skip = Zotero.BYOKTTS.Skip;
		let reader = Skip?._findReader?.();
		// A different attachment is a different document; its numbering starts again
		if (reader?._instanceID && _sourceID && reader._instanceID !== _sourceID) this.invalidate();
		if (this.index) return this.index;
		if (_building) return _building;

		let run = (async () => {
			try {
				// Section mode needs the body type size, and every mode needs to know which
				// segments the skip rules drop, so the measurements come first either way
				await Skip?.ensureStats?.();
				let view = reader?._internalReader?._primaryView;
				let segments = view?._readAloudSegments;
				if (!segments) throw new Error('Reader has no segments to cast');

				let index = new Map();
				this._units = 0;
				// Both lists are built, so the assignment survives switching between reading by
				// sentence and by paragraph without a reload
				this._assign(segments.sentences, 'sentence', index);
				this._assign(segments.paragraphs, 'paragraph', index);
				if (!index.size) throw new Error('Reader reported no segments');

				_sourceID = reader?._instanceID || null;
				this.lastError = null;
				this.index = index;
				Zotero.debug(`BYOK TTS: cast ${index.size} segments over `
					+ `${this.voices().length} voices by ${this.mode()}`);
				Zotero.BYOKTTS.Log?.write('cast', {
					mode: this.mode(),
					voices: this.voices(),
					segments: index.size,
					units: this._units
				});
				return index;
			}
			catch (e) {
				this.lastError = e.message || String(e);
				Zotero.debug('BYOK TTS: could not cast document — ' + this.lastError);
				return null;
			}
		})();
		_building = run;
		// Cleared once settled rather than in a finally inside the run: a body that finishes without
		// suspending would clear the guard before it is even assigned. See ensureStats in skip.js.
		run.finally(() => {
			if (_building === run) _building = null;
		});
		return run;
	};

	/**
	 * Number one granularity's segments in document order and record each against its key.
	 * Only spoken segments advance the rotation; skipped ones inherit whatever is current, so a
	 * running head between two paragraphs does not cost a voice its turn.
	 */
	this._assign = function (list, granularity, index) {
		if (!Array.isArray(list) || !list.length) return;
		let mode = this.mode();
		let Skip = Zotero.BYOKTTS.Skip;
		let median = Skip?.stats?.median || 0;

		let unit = 0;
		let previous = null;
		for (let i = 0; i < list.length; i++) {
			let segment = list[i];
			let spoken = !this._isSkipped(segment);

			if (spoken) {
				let boundary = this._boundary(segment, previous, mode, granularity, median, i);
				// The first spoken segment opens the rotation rather than advancing it, or the
				// document would always start on the second voice
				if (boundary && previous !== null) unit++;
				previous = segment;
			}
			index.set(this._key(segment, granularity), unit);
		}
		// Both granularities are numbered separately; the count reported is the longer of them
		this._units = Math.max(this._units || 0, unit + 1);
	};

	/** Does this segment start a new turn? */
	this._boundary = function (segment, previous, mode, granularity, median, position) {
		if (previous === null) return false;
		switch (mode) {
			case 'page':
				return segment.position?.pageIndex !== previous.position?.pageIndex;
			case 'section':
				return this._isHeading(segment, median);
			case 'paragraph':
				// Sentences carry a document-global paragraph index; paragraph segments are one
				// paragraph each, so every one of them is a boundary
				return granularity === 'paragraph'
					|| segment.paragraphIndex !== previous.paragraphIndex;
			case 'sentence':
			default:
				return true;
		}
	};

	/**
	 * Larger than the body text, or numbered like a clause and short enough to be a title rather
	 * than a sentence that happens to open with a figure.
	 */
	this._isHeading = function (segment, median) {
		let text = String(segment?.text || '').trim();
		if (!text || text.length > HEADING_MAX_CHARS) return false;
		let height = Zotero.BYOKTTS.Skip?._height?.(segment) || 0;
		if (median && height && height >= median * HEADING_SCALE) return true;
		// A clause number alone is only a heading when the line does not read as prose
		return CLAUSE_NUMBER.test(text) && !/[.!?]$/.test(text);
	};

	/**
	 * Would the skip rules drop this segment outright? Only the structural verdict is asked for:
	 * it is the one that removes whole segments, and running the text rules over every segment in
	 * the document to reach the same answer would cost a great deal more.
	 */
	this._isSkipped = function (segment) {
		let Skip = Zotero.BYOKTTS.Skip;
		if (!Skip?.anyOn?.()) return false;
		try {
			return !!Skip.structuralSkipReason(segment);
		}
		catch (e) {
			return false;
		}
	};

	// Granularity is part of the key: a single-sentence paragraph has the same page and offsets
	// as the sentence inside it, and the two lists would otherwise overwrite each other
	this._key = function (segment, granularity) {
		let position = segment?.position;
		return `${granularity}|${position?.pageIndex}:${segment?.offsetStart}:${segment?.offsetEnd}`;
	};

	/**
	 * The voice this segment should be read in.
	 * @return {Object|null} a configured voice, or null to leave the choice alone
	 */
	this.voiceFor = function (segment) {
		if (!this.enabled() || !this.index || !segment || typeof segment === 'string') return null;
		let ids = this.voices();
		let granularity = segment.granularity === 'paragraph' ? 'paragraph' : 'sentence';
		let unit = this.index.get(this._key(segment, granularity));
		if (unit === undefined) return null;
		let id = ids[unit % ids.length];
		return Zotero.BYOKTTS.getVoices().find(v => v.id === id) || null;
	};

	/** Human-readable state, for the diagnostics panel. */
	this.describe = function () {
		if (this.mode() === 'off') return 'Alternating voices: off.';
		let ids = this.voices();
		if (ids.length < 2) return 'Alternating voices: needs at least two voices.';
		if (this.lastError) return `Alternating voices: ${this.lastError}.`;
		if (!this.index) return `Alternating voices: ${ids.length} voices, document not yet cast.`;
		return `Alternating voices: ${ids.length} voices by ${this.mode()}, `
			+ `${this._units} turn(s) across ${this.index.size} segments.`;
	};
};
