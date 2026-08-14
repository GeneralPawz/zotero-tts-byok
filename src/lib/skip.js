/*
	Read Aloud BYOK — skip rules.

	Zotero hands us each segment as { text, position: { pageIndex, rects }, granularity, … }
	before it is sent for synthesis. Two kinds of rule act on that:

	  - text rules rewrite the string (drop bracketed asides, citations, URLs)
	  - structure rules drop the whole segment based on where it sits on the page

	Structure rules need to know what "normal" looks like in this document, so the reader's full
	segment list is measured once per attachment. Rect height stands in for font size, which is
	what separates a title or a footnote from body text.
*/

Zotero.BYOKTTS.Skip = new function () {
	const PREF = 'extensions.zotero.byokTTS.skip.';
	const REPEAT_MAX_LENGTH = 200;
	const REPEAT_MIN_PAGES = 2;
	const FRONT_MATTER_MAX = 20;
	const SHORT_LINE = 60;
	const FRONT_MATTER_PROSE = 100;
	const MERGE_MAX_LENGTH = 1200;

	// Order here is the order shown in the reader panel
	this.RULES = [
		{ key: 'frontMatter', label: 'Title and authors', kind: 'structure' },
		{ key: 'headersFooters', label: 'Running heads and footers', kind: 'structure' },
		{ key: 'footnotes', label: 'Footnotes', kind: 'structure' },
		{ key: 'tables', label: 'Tables', kind: 'structure' },
		{ key: 'formulas', label: 'Formulas', kind: 'structure' },
		{ key: 'citations', label: 'Citations', kind: 'text' },
		{ key: 'urls', label: 'URLs and DOIs', kind: 'text' },
		{ key: 'parens', label: 'Text in ( )', kind: 'text' },
		{ key: 'brackets', label: 'Text in [ ]', kind: 'text' },
		{ key: 'braces', label: 'Text in { }', kind: 'text' }
	];

	// Measurements of the document currently being read, or null before one is analysed
	this.stats = null;
	this.lastAnalyzeError = null;

	let _reader = null;
	let _sourceID = null;
	let _analyzing = null;

	/** Remember which reader to measure; a different document invalidates the measurements. */
	this.setSource = function (reader) {
		if (!reader) return;
		_reader = reader;
		if (_sourceID && reader._instanceID && reader._instanceID !== _sourceID) {
			this.stats = null;
			_sourceID = null;
		}
	};

	this._findReader = function () {
		if (_reader) return _reader;
		// Fall back to any open reader, so measuring works even if the popup was never opened
		let readers = Zotero.Reader?._readers || [];
		for (let i = readers.length - 1; i >= 0; i--) {
			if (readers[i]?._internalReader?._primaryView) return readers[i];
		}
		return null;
	};

	/**
	 * Measure the document if it has not been measured yet. Safe to call on every segment —
	 * the work happens once and concurrent callers share the same promise.
	 */
	this.ensureStats = async function () {
		if (this.stats) return this.stats;
		if (_analyzing) return _analyzing;
		let run = (async () => {
			try {
				let reader = this._findReader();
				if (!reader) throw new Error('No open reader to measure');
				let view = reader._internalReader?._primaryView;
				if (!view) throw new Error('Reader has no primary view yet');
				if (typeof view._initReadAloudSegments === 'function') {
					await view._initReadAloudSegments();
				}
				let segments = view._readAloudSegments;
				let list = segments?.sentences?.length ? segments.sentences : segments?.paragraphs;
				if (!list || !list.length) throw new Error('Reader reported no segments');
				let result = this.analyze(Array.from(list));
				_sourceID = reader._instanceID || null;
				this.lastAnalyzeError = null;
				return result;
			}
			catch (e) {
				this.lastAnalyzeError = e.message || String(e);
				Zotero.debug('BYOK TTS: could not measure document — ' + this.lastAnalyzeError);
				return null;
			}
		})();
		_analyzing = run;
		/*
			Cleared here rather than in a finally inside the run: a body that reaches its end without
			suspending settles before the assignment above, so the finally would null a variable that
			is then immediately set again — leaving a resolved promise in place for good, after which
			every later call short-circuits on it and no document is ever measured a second time. The
			identity check keeps a newer run from being cleared by an older one.
		*/
		run.finally(() => {
			if (_analyzing === run) _analyzing = null;
		});
		return run;
	};

	// Fallbacks for when prefs.js defaults were not registered — reinstalling over the same
	// version number does not always re-register them, which would leave smoothOrder undefined
	// and the reading-order rewrite silently switched off.
	const DEFAULTS = { smoothOrder: true };

	this.isOn = function (key) {
		let value = Zotero.BYOKTTS.DocPrefs?.resolve('skip.' + key);
		if (value === undefined) value = Zotero.Prefs.get(PREF + key, true);
		if (value === undefined || value === null) return !!DEFAULTS[key];
		return !!value;
	};

	this.setOn = function (key, value) {
		Zotero.Prefs.set(PREF + key, !!value, true);
	};

	this.anyOn = function () {
		return this.RULES.some(rule => this.isOn(rule.key)) || this.customPatterns().length > 0;
	};

	/* ------------------------------------------------------------ text rules */

	/**
	 * Tags the reader must keep even when bracketed text is being dropped: the performance
	 * tags a document uses, and any speaker names in use. Without this, turning on "Text in [ ]"
	 * quietly removes every [whispering] before it ever reaches the provider.
	 */
	this._protectedTags = function () {
		let api = Zotero.BYOKTTS;
		let tags = new Set((api.emotionTags ? api.emotionTags() : []).map(t => t.toLowerCase()));
		for (let tag of api.speakerTags ? api.speakerTags() : []) tags.add(tag);
		return tags;
	};

	this.isProtectedTag = function (inner) {
		return this._protectedTags().has(String(inner).trim().toLowerCase());
	};

	/**
	 * Remove balanced delimiter pairs, including nested ones — a regex cannot do this, and
	 * "(see Fig. 2 (right))" is common enough to matter.
	 */
	this._stripPairs = function (text, open, close) {
		let out = '';
		let depth = 0;
		for (let char of text) {
			if (char === open) {
				depth++;
			}
			else if (char === close) {
				if (depth > 0) depth--;
				else out += char; // unmatched closer: keep it rather than eat the rest
			}
			else if (!depth) {
				out += char;
			}
		}
		return out;
	};

	this._stripCitations = function (text) {
		return text
			// [12], [3, 4], [5–7]
			.replace(/\[\s*\d+(?:\s*[,;–—-]\s*\d+)*\s*\]/g, '')
			// (Smith et al., 2020), (Smith & Jones 1999; Doe 2001), (ibid.)
			.replace(/\(([^()]*(?:et al\.|ibid\.|\b(?:1[6-9]|20)\d{2}[a-z]?\b)[^()]*)\)/gi, '')
			// Trailing superscript-style markers: "…as shown.12"
			.replace(/(?<=[a-z.,])\d{1,3}(?=\s|$)/g, '');
	};

	this._stripURLs = function (text) {
		return text
			.replace(/\bhttps?:\/\/\S+/gi, '')
			.replace(/\bwww\.\S+/gi, '')
			.replace(/\bdoi:\s*\S+/gi, '')
			.replace(/\b10\.\d{4,9}\/\S+/gi, '')
			.replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '');
	};

	/** Tidy the punctuation and spacing left behind once spans have been cut out. */
	this._tidy = function (text) {
		return text
			.replace(/[ \t ]+/g, ' ')
			.replace(/\s+([,.;:!?)\]}])/g, '$1')
			.replace(/([([{])\s+/g, '$1')
			.replace(/(^|\s)[,;:]\s*/g, '$1')
			.replace(/\s*\.\s*\./g, '.')
			.trim();
	};

	/**
	 * Take the recognised [tags] out of harm's way, run the bracket rules, then put them back.
	 * The placeholder carries no brackets, so nothing downstream can match it.
	 */
	this._withTagsPreserved = function (text, work) {
		let protectedTags = this._protectedTags();
		if (!protectedTags.size) return work(text);
		let stash = [];
		// A private-use character delimits the placeholder: not whitespace, not a letter and
		// not punctuation, so no rule and no spacing tidy-up can see or disturb it. Written as
		// an escape sequence so this file stays plain text.
		let masked = String(text).replace(/\[([^\]]+)\]/g, (whole, inner) => {
			if (!protectedTags.has(inner.trim().toLowerCase())) return whole;
			stash.push(whole);
			return `\uE000${stash.length - 1}\uE000`;
		});
		if (!stash.length) return work(text);
		return work(masked).replace(/\uE000(\d+)\uE000/g, (_, i) => stash[Number(i)]);
	};

	this.filterText = function (text) {
		return this._withTagsPreserved(text, (input) => {
			let out = String(input);
			if (this.isOn('urls')) out = this._stripURLs(out);
			if (this.isOn('citations')) out = this._stripCitations(out);
			if (this.isOn('parens')) out = this._stripPairs(out, '(', ')');
			if (this.isOn('brackets')) out = this._stripPairs(out, '[', ']');
			if (this.isOn('braces')) out = this._stripPairs(out, '{', '}');
			return this._tidy(out);
		});
	};

	/* ------------------------------------------------- content-shape rules */

	// Includes the plain ASCII operators, which only tip the balance because a formula must
	// also be short on real words — "input/output systems" stays prose.
	const MATH_CHARS = /[=<>≤≥≈≠±∑∏∫√∞∂∇×÷·∈∉⊂⊆∀∃→←↔⇒⇔αβγδεθλμπρσφψωΔΩ^_|+\-−*/]/g;

	/** A formula reads as noise: mostly operators, digits and single letters. */
	this._looksLikeFormula = function (text) {
		let compact = text.replace(/\s/g, '');
		if (compact.length < 3) return false;
		let math = (compact.match(MATH_CHARS) || []).length;
		let letters = (compact.match(/[a-zA-Z]/g) || []).length;
		let words = text.split(/\s+/).filter(w => /^[a-zA-Z]{3,}$/.test(w)).length;
		// Dense in operators, and not enough real words to be a sentence about a formula
		return math / compact.length > 0.08 && words <= 3 && letters / compact.length < 0.6;
	};

	/** A table row is mostly numbers and short cells, with little connective prose. */
	this._looksLikeTable = function (text, segment) {
		let tokens = text.split(/\s+/).filter(Boolean);
		if (tokens.length < 3) return false;
		let numeric = tokens.filter(t => /^[-+]?[\d.,%()±]+$/.test(t)).length;
		let words = tokens.filter(t => /^[a-zA-Z]{4,}$/.test(t)).length;
		if (numeric / tokens.length >= 0.4 && words <= tokens.length / 3) return true;

		// Cells laid out in columns show up as rects separated by wide horizontal gaps
		let rects = segment?.position?.rects;
		if (rects && rects.length >= 3 && numeric >= 2) {
			let gaps = 0;
			let sorted = [...rects].sort((a, b) => a[0] - b[0]);
			for (let i = 1; i < sorted.length; i++) {
				if (sorted[i][0] - sorted[i - 1][2] > 20) gaps++;
			}
			if (gaps >= 2) return true;
		}
		return false;
	};

	/* -------------------------------------------------------- document stats */

	this._height = function (segment) {
		let rects = segment?.position?.rects;
		if (!rects || !rects.length) return null;
		let heights = rects.map(r => Math.abs(r[3] - r[1])).filter(h => h > 0);
		if (!heights.length) return null;
		// Median is steadier than mean when a segment spans two lines
		heights.sort((a, b) => a - b);
		return heights[Math.floor(heights.length / 2)];
	};

	this._yCenter = function (segment) {
		let rects = segment?.position?.rects;
		if (!rects || !rects.length) return null;
		return (rects[0][1] + rects[0][3]) / 2;
	};

	/**
	 * Is this segment sitting in the outer margin band, top or bottom? Taking both extremes of
	 * the observed range means this works whether the page coordinates run up or down.
	 */
	this._atPageEdge = function (segment) {
		let stats = this.stats;
		if (!stats || stats.band === null) return false;
		let y = this._yCenter(segment);
		if (y === null) return false;
		return y <= stats.yMin + stats.band || y >= stats.yMax - stats.band;
	};

	/** Normalise so "Page 3 of 12" and "Page 4 of 12" count as the same running foot. */
	this._normalize = function (text) {
		return String(text).toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
	};

	/**
	 * Measure a document once, from the reader's complete segment list.
	 * @param {Array} segments
	 */
	this.analyze = function (segments) {
		if (!Array.isArray(segments) || !segments.length) {
			this.stats = null;
			return null;
		}

		// Body type size, weighted by how much text is set in it. Counting segments instead
		// would let a standard's seven footer lines per page outvote its prose and report the
		// footer size as "normal" — after which nothing looks small enough to be furniture.
		let weighted = [];
		let total = 0;
		for (let segment of segments) {
			let height = this._height(segment);
			if (!height) continue;
			let weight = String(segment.text || '').length || 1;
			weighted.push([height, weight]);
			total += weight;
		}
		weighted.sort((a, b) => a[0] - b[0]);
		let median = 0;
		let seen = 0;
		for (let [height, weight] of weighted) {
			seen += weight;
			if (seen >= total / 2) {
				median = height;
				break;
			}
		}

		// Text appearing on more than one page in the same form is a running head or foot.
		// The length cap is generous: standards boilerplate such as "Nachfolgedokument: DIN EN
		// ISO 29481-2 (in Vorbereitung/in preparation/en préparation) (DE30108662)" runs to
		// nearly 100 characters and still belongs here.
		let pagesByText = new Map();
		for (let segment of segments) {
			let text = String(segment.text || '').trim();
			if (text.length > REPEAT_MAX_LENGTH) continue;
			// Digits are normalised so "Page 3 of 12" and "Page 4 of 12" count as one line, but
			// that also collapses prose differing only by a number — "Clause 3 sets out…" and
			// "Clause 7 sets out…" become identical. Body sentences close with sentence-ending
			// punctuation and furniture almost never does, so that is the discriminator.
			if (/[.!?]$/.test(text) && text.length > SHORT_LINE) continue;
			let key = this._normalize(text);
			if (!key) continue;
			if (!pagesByText.has(key)) pagesByText.set(key, new Set());
			pagesByText.get(key).add(segment.position?.pageIndex);
		}
		let repeated = new Set();
		for (let [key, pages] of pagesByText) {
			if (pages.size >= REPEAT_MIN_PAGES) repeated.add(key);
		}

		// Front matter runs until the first long run of prose on page one. Length alone decides
		// it: titles, authors and affiliations are short, and judging by type size as well went
		// wrong on documents where boilerplate outnumbers body text and so sets the median.
		// Capped, because wrongly skipping real content is far worse than reading a title.
		// Only when page one actually opens with a title — larger type than the body. Without
		// that guard the rule fires on any document whose first page is plain continuation
		// text, and eats real sentences.
		let hasTitle = false;
		for (let i = 0; i < segments.length && i < FRONT_MATTER_MAX; i++) {
			if (segments[i].position?.pageIndex !== 0) break;
			let height = this._height(segments[i]);
			if (median && height && height >= median * 1.25) {
				hasTitle = true;
				break;
			}
		}

		let bodyStart = 0;
		if (hasTitle) {
			for (let i = 0; i < segments.length; i++) {
				let segment = segments[i];
				if (segment.position?.pageIndex !== 0 || i >= FRONT_MATTER_MAX) {
					bodyStart = i;
					break;
				}
				if (String(segment.text || '').length >= FRONT_MATTER_PROSE) {
					bodyStart = i;
					break;
				}
			}
		}

		// Margin band, for furniture whose text is mangled differently on each page and so never
		// matches itself. Kept narrow, since body text does reach the edges on dense pages.
		let centers = segments.map(s => this._yCenter(s)).filter(y => y !== null);
		let yMin = centers.length ? Math.min(...centers) : null;
		let yMax = centers.length ? Math.max(...centers) : null;
		let band = (yMin === null || yMax === yMin) ? null : (yMax - yMin) * 0.03;

		this.stats = {
			count: segments.length,
			median,
			repeated,
			bodyStart,
			yMin,
			yMax,
			band,
			// Index lookup so a segment can be located without scanning every time
			indexByKey: new Map(segments.map((s, i) => [this._segmentKey(s), i]))
		};
		Zotero.debug(`BYOK TTS: analysed ${segments.length} segments, median height ${median.toFixed(2)}, `
			+ `${repeated.size} repeated lines, body starts at ${bodyStart}`);
		Zotero.BYOKTTS.Log?.write('analyze', {
			segments: segments.length,
			median,
			hasTitle,
			bodyStart,
			yMin,
			yMax,
			band,
			repeated: [...repeated].slice(0, 60),
			repeatedTotal: repeated.size
		});
		return this.stats;
	};

	this._segmentKey = function (segment) {
		let position = segment?.position;
		return `${position?.pageIndex}:${segment?.offsetStart}:${segment?.offsetEnd}`;
	};

	/* ------------------------------------------------------- custom matches */

	/** User-supplied literals, one per line — the escape hatch for odd watermarks. */
	this.customPatterns = function () {
		let raw = Zotero.BYOKTTS.DocPrefs?.resolve('skip.custom');
		if (raw === undefined) raw = Zotero.Prefs.get(PREF + 'custom', true);
		if (!raw) return [];
		return String(raw).split(/\r?\n/).map(line => line.trim().toLowerCase()).filter(Boolean);
	};

	this._matchesCustom = function (text) {
		let patterns = this.customPatterns();
		if (!patterns.length) return false;
		let haystack = String(text).toLowerCase();
		return patterns.some(pattern => haystack.includes(pattern));
	};

	/* ------------------------------------------------------ structure rules */

	/**
	 * @return {String|null} the rule that drops this segment, or null to keep it
	 */
	this.structuralSkipReason = function (segment) {
		if (!segment || typeof segment !== 'object') return null;
		let text = String(segment.text || '');
		let stats = this.stats;

		if (this._matchesCustom(text)) return 'custom';

		// Page furniture is not merely text that repeats — a recurring caption or a boilerplate
		// sentence repeats too. It also sits in the margin, or is set smaller than the body, or
		// is very short. Requiring one of those keeps repeated prose readable.
		if (this.isOn('headersFooters') && stats && text.length <= REPEAT_MAX_LENGTH) {
			let height = this._height(segment);
			let repeats = stats.repeated.has(this._normalize(text));
			let edge = this._atPageEdge(segment);
			let smaller = !!(height && stats.median && height < stats.median * 0.95);

			if (repeats && (edge || smaller || text.length <= SHORT_LINE)) {
				return 'headersFooters';
			}
			// Watermarks and print stamps whose extraction differs per page never match
			// themselves, so position and type size have to carry it alone
			if (edge && smaller) {
				return 'headersFooters';
			}
		}

		if (this.isOn('frontMatter') && segment.position?.pageIndex === 0 && stats) {
			let index = stats.indexByKey.get(this._segmentKey(segment));
			if (index !== undefined && index < stats.bodyStart) return 'frontMatter';
		}

		if (this.isOn('footnotes') && stats && stats.median) {
			let height = this._height(segment);
			// Distinctly smaller type than the body, which is what a footnote is
			if (height && height < stats.median * 0.82) return 'footnotes';
		}

		if (this.isOn('formulas') && this._looksLikeFormula(text)) return 'formulas';
		if (this.isOn('tables') && this._looksLikeTable(text, segment)) return 'tables';

		return null;
	};

	/* -------------------------------------------------- reading-order rewrite */

	/** A segment that runs on into the next one: no closing punctuation, next starts lowercase. */
	this._continues = function (current, next) {
		let a = String(current?.text || '').trim();
		let b = String(next?.text || '').trim();
		if (!a || !b) return false;
		if (a.length + b.length > MERGE_MAX_LENGTH) return false;
		if (/[.!?:;»"'”’)\]]$/.test(a)) return false;
		return /^[a-zà-ÿ(“‘]/.test(b);
	};

	/**
	 * Prune skipped segments out of the reader's own list and stitch sentences that were split
	 * across a page break back together, before playback ever reaches them. Done in place so the
	 * arrays the reader already holds stay the same objects.
	 *
	 * @param {Object} view - the reader's primary view
	 * @return {{removed: Number, merged: Number}|null}
	 */
	this.rewrite = function (view) {
		let container = view?._readAloudSegments;
		if (!container) return null;

		// Measure the untouched document first — the layout rules depend on it
		let source = container.sentences?.length ? container.sentences : container.paragraphs;
		if (!source || !source.length) return null;
		this.analyze(Array.from(source));

		let removed = 0;
		let merged = 0;
		let before = { sentences: container.sentences?.length || 0, paragraphs: container.paragraphs?.length || 0 };

		for (let key of ['sentences', 'paragraphs']) {
			let list = container[key];
			if (!list || !list.length) continue;

			for (let i = list.length - 1; i >= 0; i--) {
				let segment = list[i];
				let result = this.apply(segment, key === 'sentences' ? 'rewrite' : null);
				if (result.skipped) {
					list.splice(i, 1);
					removed++;
				}
				else if (result.text && result.text !== segment.text) {
					segment.text = result.text;
				}
			}

			// Only sentences get stitched; paragraphs already end where they mean to
			if (key === 'sentences' && this.isOn('smoothOrder')) {
				for (let i = list.length - 2; i >= 0; i--) {
					if (this._continues(list[i], list[i + 1])) {
						list[i].text = String(list[i].text).trim() + ' ' + String(list[i + 1].text).trim();
						list.splice(i + 1, 1);
						merged++;
					}
				}
			}
		}

		// Re-measure against the pruned list so the rules stay consistent with what remains
		let pruned = container.sentences?.length ? container.sentences : container.paragraphs;
		if (pruned && pruned.length) this.analyze(Array.from(pruned));

		// Confirm the splices actually landed on the reader's arrays rather than on a wrapper
		// that quietly discarded them — a silent no-op here looks exactly like "skip is broken"
		let after = { sentences: container.sentences?.length || 0, paragraphs: container.paragraphs?.length || 0 };
		let expected = removed + merged;
		let actual = (before.sentences - after.sentences) + (before.paragraphs - after.paragraphs);
		let applied = !expected || actual > 0;

		this.lastRewrite = { removed, merged, applied, before: before.sentences, after: after.sentences };
		Zotero.debug(`BYOK TTS: reading order rewrite — ${removed} removed, ${merged} stitched, `
			+ `sentences ${before.sentences} → ${after.sentences}, applied=${applied}`);
		Zotero.BYOKTTS.Log?.write('rewrite', this.lastRewrite);
		return this.lastRewrite;
	};

	this.lastRewrite = null;

	/** Human-readable account of what was measured, for the preferences pane. */
	this.diagnostics = function () {
		let lines = [];
		let on = this.RULES.filter(rule => this.isOn(rule.key)).map(rule => rule.key);
		lines.push('Rules on: ' + (on.join(', ') || 'none'));

		if (!this.stats) {
			lines.push('');
			lines.push('This document has NOT been measured, so the layout rules — title and');
			lines.push('authors, running heads and footers, footnotes — cannot fire. The text');
			lines.push('rules are unaffected.');
			if (this.lastAnalyzeError) {
				lines.push('');
				lines.push('Reason: ' + this.lastAnalyzeError);
			}
			lines.push('');
			lines.push('Open the PDF and start Read Aloud once, then check again.');
			return lines.join('\n');
		}

		lines.push('');
		lines.push(`Measured ${this.stats.count} segments; median line height `
			+ `${this.stats.median.toFixed(2)}.`);
		lines.push(`Front matter: the first ${this.stats.bodyStart} segment(s) of page 1.`);
		lines.push(`Footnotes: anything below height ${(this.stats.median * 0.82).toFixed(2)}.`);
		if (this.stats.band !== null) {
			lines.push(`Margin band: y ≤ ${(this.stats.yMin + this.stats.band).toFixed(1)} `
				+ `or y ≥ ${(this.stats.yMax - this.stats.band).toFixed(1)} `
				+ `(range ${this.stats.yMin.toFixed(1)}–${this.stats.yMax.toFixed(1)}).`);
		}
		lines.push(`Custom patterns: ${this.customPatterns().length}.`);

		let rewrite = this.lastRewrite;
		lines.push('');
		if (!rewrite) {
			lines.push('Reading order was NOT rewritten — skipped passages are played over as');
			lines.push('silence instead. Reopen the document, or switch the setting off.');
		}
		else if (!rewrite.applied) {
			lines.push('Reading order rewrite ran but did NOT take effect on the reader\'s list.');
			lines.push(`It wanted to drop ${rewrite.removed} and stitch ${rewrite.merged}, but the`);
			lines.push(`sentence count stayed at ${rewrite.after}.`);
		}
		else {
			lines.push(`Reading order rewritten: ${rewrite.removed} segments dropped, `
				+ `${rewrite.merged} sentences stitched,`);
			lines.push(`sentences ${rewrite.before} → ${rewrite.after}.`);
		}
		lines.push('');
		lines.push(`Repeated lines treated as heads/footers (${this.stats.repeated.size}), `
			+ 'digits shown as #:');
		let list = [...this.stats.repeated];
		for (let key of list.slice(0, 30)) lines.push('  ' + key);
		if (list.length > 30) lines.push(`  …and ${list.length - 30} more`);
		if (!list.length) {
			lines.push('  (none — nothing repeated on 2 or more pages)');
		}
		return lines.join('\n');
	};

	/**
	 * Decide what should actually be spoken for a segment.
	 * @return {{text: String, skipped: Boolean, reason: String|null}}
	 */
	this.apply = function (segment, phase) {
		let original = typeof segment === 'string' ? segment : String(segment?.text ?? '');
		if (!this.anyOn()) {
			return { text: original, skipped: false, reason: null };
		}

		let reason = this.structuralSkipReason(segment);
		let result;
		if (reason) {
			result = { text: '', skipped: true, reason };
		}
		else {
			let filtered = this.filterText(original);
			// Nothing but punctuation left means the segment was entirely an aside
			result = /[a-zA-Z0-9À-ɏ]/.test(filtered)
				? { text: filtered, skipped: false, reason: null }
				: { text: '', skipped: true, reason: 'text' };
		}

		// Record the measurements behind the verdict, so a passage that should have been
		// dropped but was not can be diagnosed without guessing
		if (phase && Zotero.BYOKTTS.Log?.enabled()) {
			let Log = Zotero.BYOKTTS.Log;
			Zotero.BYOKTTS.Log.write('segment', {
				phase,
				action: result.skipped ? 'skip' : 'speak',
				reason: result.reason,
				page: segment?.position?.pageIndex,
				chars: original.length,
				h: this._height(segment),
				yc: this._yCenter(segment),
				edge: this._atPageEdge(segment),
				repeats: !!this.stats?.repeated?.has(this._normalize(original)),
				median: this.stats?.median ?? null,
				text: Log.clip(original),
				spoken: result.skipped ? null : Log.clip(result.text)
			});
		}
		return result;
	};
};
