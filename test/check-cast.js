/*
	Read Aloud BYOK — alternating voices.  Run with:  node test/check-cast.js

	The rotation has to be a pure function of the segment. Zotero prefetches three segments ahead
	and caches audio keyed on voice and text, so an assignment that depended on call order would
	hand the same paragraph different voices on a re-read and poison that cache. Most of what is
	below exists to hold that property down.
*/

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PREFS = {};
for (let m of fs.readFileSync(path.join(ROOT, 'src', 'prefs.js'), 'utf8').replace(/\r\n/g, '\n')
	.matchAll(/^pref\("([^"]+)",\s*(.+)\);$/gm)) {
	PREFS[m[1]] = JSON.parse(m[2]);
}

const VOICES = [
	{ id: 'kore', label: 'Kore', locales: ['en'] },
	{ id: 'puck', label: 'Puck', locales: ['en'] },
	{ id: 'charon', label: 'Charon', locales: ['en'] }
];

const sandbox = {
	console,
	Zotero: {
		Prefs: { get: k => PREFS[k], set: (k, v) => (PREFS[k] = v) },
		debug: () => {}, logError: () => {},
		Reader: { _readers: [] },
		BYOKTTS: {
			emotionTags: () => [],
			speakerTags: () => [],
			getVoices: () => VOICES
		}
	}
};
vm.createContext(sandbox);
for (let file of ['skip.js', 'cast.js']) {
	vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'lib', file), 'utf8'), sandbox);
}
const Skip = sandbox.Zotero.BYOKTTS.Skip;
const Cast = sandbox.Zotero.BYOKTTS.Cast;

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
	checks++;
	let ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) {
		failures++;
		console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`);
	}
	else {
		console.log(`  ok    ${label}`);
	}
}

/* ------------------------------------------------------------------ fixture */

const BODY = 12;
let offset = 0;
/** One sentence. `size` drives the rect height, which is what stands in for font size. */
function sentence(text, pageIndex, paragraphIndex, { size = BODY, y = 300 } = {}) {
	let start = offset;
	offset += text.length;
	return {
		text,
		position: { pageIndex, rects: [[70, y, 500, y + size]] },
		paragraphIndex,
		granularity: 'sentence',
		offsetStart: start,
		offsetEnd: offset
	};
}

/*
	Two pages of a standard: a numbered heading, body paragraphs of two sentences each, and a
	running footer repeated on both pages so the skip interaction can be exercised.
*/
function document_() {
	offset = 0;
	let sentences = [
		sentence('4 Information delivery manual', 0, 0, { size: 17, y: 100 }),
		sentence('The manual describes the process.', 0, 1, { y: 140 }),
		sentence('It is intended for practitioners.', 0, 1, { y: 155 }),
		sentence('Each exchange requirement is specified.', 0, 2, { y: 200 }),
		sentence('Conformance is assessed against it.', 0, 2, { y: 215 }),
		sentence('© ISO 2024 – All rights reserved', 0, 3, { size: 8, y: 780 }),
		sentence('5 Conformance', 1, 4, { size: 17, y: 100 }),
		sentence('A tool conforms when it satisfies 5.2.', 1, 5, { y: 140 }),
		sentence('Partial conformance is not permitted.', 1, 5, { y: 155 }),
		sentence('© ISO 2024 – All rights reserved', 1, 6, { size: 8, y: 780 })
	];
	// One paragraph segment per paragraph index, spanning its sentences
	let paragraphs = [];
	for (let index of [...new Set(sentences.map(s => s.paragraphIndex))]) {
		let group = sentences.filter(s => s.paragraphIndex === index);
		paragraphs.push({
			text: group.map(s => s.text).join(' '),
			position: group[0].position,
			granularity: 'paragraph',
			offsetStart: group[0].offsetStart,
			offsetEnd: group[group.length - 1].offsetEnd
		});
	}
	return { sentences, paragraphs };
}

let DOC = document_();
sandbox.Zotero.Reader._readers = [{
	_instanceID: 'doc-1',
	_internalReader: { _primaryView: { _readAloudSegments: DOC } }
}];

/** Configure the rotation and renumber the document. */
async function cast(mode, ids, skipRules = []) {
	PREFS['extensions.zotero.byokTTS.cast.mode'] = mode;
	PREFS['extensions.zotero.byokTTS.cast.voices'] = JSON.stringify(ids);
	for (let rule of Skip.RULES) {
		PREFS['extensions.zotero.byokTTS.skip.' + rule.key] = skipRules.includes(rule.key);
	}
	Skip.stats = null;
	Cast.invalidate();
	await Cast.ensureIndex();
}

/** Which voice each sentence is read in, as ids. */
function reading() {
	return DOC.sentences.map(s => Cast.voiceFor(s)?.id ?? null);
}

/* -------------------------------------------------------------------- tests */

(async () => {
	console.log('\nrotation units\n');

	await cast('paragraph', ['kore', 'puck']);
	check('paragraph: a voice per paragraph, sentences within one agree',
		reading(),
		['kore', 'puck', 'puck', 'kore', 'kore', 'puck', 'kore', 'puck', 'puck', 'kore']);

	await cast('sentence', ['kore', 'puck']);
	check('sentence: alternates every sentence',
		reading(),
		['kore', 'puck', 'kore', 'puck', 'kore', 'puck', 'kore', 'puck', 'kore', 'puck']);

	await cast('page', ['kore', 'puck']);
	check('page: one voice per page',
		reading(),
		['kore', 'kore', 'kore', 'kore', 'kore', 'kore', 'puck', 'puck', 'puck', 'puck']);

	await cast('section', ['kore', 'puck']);
	check('section: changes at each numbered heading, not between paragraphs',
		reading(),
		['kore', 'kore', 'kore', 'kore', 'kore', 'kore', 'puck', 'puck', 'puck', 'puck']);

	await cast('paragraph', ['kore', 'puck', 'charon']);
	check('three voices rotate in the configured order',
		reading().filter((v, i) => DOC.sentences[i].paragraphIndex !== DOC.sentences[i - 1]?.paragraphIndex),
		['kore', 'puck', 'charon', 'kore', 'puck', 'charon', 'kore']);

	console.log('\ndeterminism\n');

	await cast('paragraph', ['kore', 'puck']);
	let inOrder = reading();
	// Zotero prefetches ahead and seeks backwards; asking in a different order must not matter
	let shuffled = [...DOC.sentences.keys()].reverse().map(i => Cast.voiceFor(DOC.sentences[i])?.id);
	check('reading the document backwards gives the same voices',
		shuffled.reverse(), inOrder);

	await cast('paragraph', ['kore', 'puck']);
	check('renumbering the same document reproduces the assignment', reading(), inOrder);

	console.log('\nskipped passages\n');

	/*
		The footer sits alone in its own paragraph. Counting raw paragraph indices lets it consume
		a turn, and the heading after it then lands on the same voice as the paragraph before it —
		alternation that audibly stops alternating at every page break.
	*/
	await cast('paragraph', ['kore', 'puck']);
	check('without the skip rule the footer takes a turn of its own',
		reading()[5], 'puck');
	check('and the next heading repeats the voice before the footer',
		reading()[6], reading()[3]);

	await cast('paragraph', ['kore', 'puck'], ['headersFooters']);
	check('a skipped footer does not use up a turn',
		reading(),
		['kore', 'puck', 'puck', 'kore', 'kore', 'kore', 'puck', 'kore', 'kore', 'kore']);
	check('so the heading after it alternates against the paragraph before it',
		reading()[6] !== reading()[3], true);

	console.log('\nswitched off\n');

	await cast('off', ['kore', 'puck']);
	check('off: no voice is imposed', reading(), Array(10).fill(null));

	await cast('paragraph', ['kore']);
	check('a single voice is not a rotation', Cast.enabled(), false);
	check('and imposes nothing', reading(), Array(10).fill(null));

	await cast('paragraph', ['kore', 'nonexistent']);
	check('a voice that is no longer configured yields rather than guessing',
		reading().includes(null), true);

	console.log('\nre-measuring\n');

	/*
		ensureStats guards against two concurrent measurements with an in-flight promise. Clearing
		that guard from a finally inside the run is wrong when the body reaches its end without
		suspending: the finally settles first and the assignment then puts a resolved promise back,
		after which every later call short-circuits on it and no document is ever measured again.
		The visible symptom was skip rules appearing to do nothing on the second document read.
	*/
	Skip.stats = null;
	await Skip.ensureStats();
	check('a document can be measured', !!Skip.stats, true);
	Skip.stats = null;
	await Skip.ensureStats();
	check('and measured again after the first measurement is dropped', !!Skip.stats, true);

	console.log('\nparagraph granularity\n');

	await cast('paragraph', ['kore', 'puck']);
	check('paragraph segments are cast too, not just sentences',
		DOC.paragraphs.map(p => Cast.voiceFor(p)?.id ?? null),
		['kore', 'puck', 'kore', 'puck', 'kore', 'puck', 'kore']);

	console.log(failures ? `\n${failures} of ${checks} checks failed` : `\n${checks}/${checks} checks passed`);
	process.exit(failures ? 1 : 0);
})();
