/*
	Read Aloud BYOK — skip-rule tests.  Run with:  node test/run-tests.js

	skip.js is pure logic over segment objects, so it can be exercised outside Zotero with a
	small stub. Every case here came from a real misbehaviour; keep them passing.
*/

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PREFS = {};
// Normalised first: JavaScript's `.` does not match \r, so on a CRLF checkout every anchored
// pattern below would quietly match nothing and the defaults would come back empty.
for (let m of fs.readFileSync(path.join(ROOT, 'src', 'prefs.js'), 'utf8').replace(/\r\n/g, '\n')
	.matchAll(/^pref\("([^"]+)",\s*(.+)\);$/gm)) {
	PREFS[m[1]] = JSON.parse(m[2]);
}

const sandbox = {
	console,
	Zotero: {
		Prefs: { get: k => PREFS[k], set: (k, v) => (PREFS[k] = v) },
		debug: () => {}, logError: () => {},
		Reader: { _readers: [] },
		// skip.js asks the plugin which [tags] must survive the bracket rules
		BYOKTTS: {
			emotionTags: () => ['laughing', 'silly', 'hysterical', 'joyful', 'delighted',
				'thrilled', 'ecstatic', 'longing', 'lust', 'surprised', 'startled',
				'flabbergasted', 'annoyed', 'bitter', 'angry', 'hostile', 'disgusted',
				'whispering'],
			speakerTags: () => ['mara', 'theo']
		}
	}
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'lib', 'skip.js'), 'utf8'), sandbox);
const Skip = sandbox.Zotero.BYOKTTS.Skip;

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

function rules(on = [], custom = '') {
	for (let rule of Skip.RULES) PREFS['extensions.zotero.byokTTS.skip.' + rule.key] = on.includes(rule.key);
	PREFS['extensions.zotero.byokTTS.skip.custom'] = custom;
	PREFS['extensions.zotero.byokTTS.skip.smoothOrder'] = true;
	Skip.stats = null;
}

let offset = 0;
const seg = (text, page, y, h) => ({
	text, position: { pageIndex: page, rects: [[50, y, 400, y + h]] },
	offsetStart: offset++, offsetEnd: offset++
});

/* ---------------------------------------------------------------- text rules */
console.log('\ntext rules');
rules(['parens']);
check('nested parens removed', Skip.filterText('Growth was rapid (see Fig. 2 (right)) in all trials.'),
	'Growth was rapid in all trials.');
rules(['brackets']);
check('numeric refs removed', Skip.filterText('Prior work [12] and studies [3, 4] agree.'),
	'Prior work and studies agree.');
rules(['citations']);
check('author-year removed', Skip.filterText('Earlier work (Doe & Roe 1999; Lee 2001) disagreed.'),
	'Earlier work disagreed.');
rules(['urls']);
check('url and doi removed', Skip.filterText('See https://example.org/x and doi:10.1234/abcd here.'),
	'See and here.');

/* --------------------------------------------------- performance tags survive */
console.log('\nemotion and speaker tags survive the bracket rules');
rules(['brackets', 'citations', 'parens']);
check('emotion tag kept', Skip.filterText('[whispering] "I have a rolling pin."'),
	'[whispering] "I have a rolling pin."');
check('speaker tag kept', Skip.filterText('[Mara] [angry] "THEO?!"'), '[Mara] [angry] "THEO?!"');
check('unknown bracket still dropped', Skip.filterText('[startled] "Oh." [aside] gone'),
	'[startled] "Oh." gone');
check('citations still dropped beside a tag',
	Skip.filterText('[joyful] Prior work [12] and [3, 4] agree.'),
	'[joyful] Prior work and agree.');
check('tags survive with every text rule on',
	(() => { rules(['brackets', 'citations', 'parens', 'urls', 'braces']);
		return Skip.filterText('[thrilled] See https://x.org (Smith et al., 2020) now.'); })(),
	'[thrilled] See now.');

/* ------------------------------------------------------- formulas and tables */
console.log('\nshape rules (must not eat prose)');
rules(['formulas', 'tables']);
const shape = (t) => Skip.apply({ text: t, position: { pageIndex: 3, rects: [[0, 700, 300, 711]] } }).skipped;
check('formula caught', shape('E = mc^2 + ∑ x_i ≤ β'), true);
check('ascii formula caught', shape('x = (a + b) / (c − d)'), true);
check('table row caught', shape('Group A 12.4 15.2 (3.1) 0.02'), true);
check('hyphenated prose kept', shape('The cost-benefit analysis of input/output systems was performed.'), false);
check('percentage prose kept', shape('Results improved by 40% relative to the baseline condition.'), false);
check('german prose kept', shape('Die Ergebnisse zeigen einen deutlichen Anstieg der Werte.'), false);

/* -------------------------------------------------------------- merge policy */
console.log('\nsentence stitching');
const cont = (a, b) => Skip._continues({ text: a }, { text: b });
check('runs on -> merge', cont('may be thought of as', 'a discovery process using those'), true);
check('full stop -> keep', cont('This sentence is complete.', 'The next one starts here.'), false);
check('colon -> keep', cont('The list follows:', 'item one and two'), false);
check('capital start -> keep', cont('no terminator here', 'Uppercase starts a sentence'), false);

/* ------------------------------------------------------------ academic paper */
console.log('\nacademic paper');
rules(['frontMatter', 'headersFooters', 'footnotes']);
offset = 0;
const paper = [
	seg('Deep Learning Approaches to Semantic Segmentation of Historical Maps', 0, 700, 18),
	seg('Anna Müller, Jonas Weber, and Lisa Chen', 0, 670, 11),
	seg('University of Freiburg, Department of Computer Science', 0, 650, 10),
	seg('Abstract', 0, 620, 12),
	seg('We present a new method for segmenting historical cartographic material that improves on prior approaches across benchmarks.', 0, 590, 11),
	seg('The remainder of this paper is organised as follows, beginning with a review of the relevant prior literature and limits.', 0, 540, 11),
	seg('1 See the appendix for the full derivation of this bound.', 0, 90, 7),
	seg('Journal of Cartography, Vol. 12, No. 3', 0, 60, 8),
	seg('Our approach builds on encoder-decoder architectures that have proven effective for dense prediction tasks in many domains.', 1, 700, 11),
	seg('2 We thank the anonymous reviewers for their detailed comments.', 1, 90, 7),
	seg('Journal of Cartography, Vol. 12, No. 4', 1, 60, 8),
	seg('Results across all three datasets show consistent gains, with the largest improvement on the most degraded scans.', 2, 700, 11),
	seg('Journal of Cartography, Vol. 12, No. 5', 2, 60, 8)
];
Skip.analyze(paper);
const verdicts = paper.map(s => Skip.apply(s).reason);
check('title/authors/affiliation/heading dropped', verdicts.slice(0, 4),
	['frontMatter', 'frontMatter', 'frontMatter', 'frontMatter']);
check('abstract and body kept', [verdicts[4], verdicts[5], verdicts[8], verdicts[11]], [null, null, null, null]);
check('footnotes dropped', [verdicts[6], verdicts[9]], ['footnotes', 'footnotes']);
check('running feet dropped', [verdicts[7], verdicts[10], verdicts[12]],
	['headersFooters', 'headersFooters', 'headersFooters']);

/* --------------------------------------------------------- standards document */
console.log('\nstandards document (furniture-heavy, mangled watermark)');
rules(['frontMatter', 'headersFooters', 'footnotes', 'tables', 'formulas']);
offset = 0;
const furniture = [
	'© ISO 2024 – All rights reserved',
	'E DIN EN ISO 29481-2:2025-02',
	'ISO/DIS 29481-2:2024(en)',
	'– Entwurf',
	'Datum / Uhrzeit des Ausdrucks: 2026-08-05, 09:43:32',
	'Printed copies are uncontrolled',
	'Nachfolgedokument: DIN EN ISO 29481-2 (in Vorbereitung/in preparation/en préparation) (DE30108662)'
];
// Prose that differs only by a number — digit normalisation must not collapse these
const clause = i => `Clause ${i} sets out the requirements that apply to the exchange of information between the parties in this process.`;
const iso = [];
for (let p = 0; p < 3; p++) {
	furniture.forEach((f, i) => iso.push(seg(f, p, 770 - i * 9, 8)));
	// A library access watermark. Text extraction interleaves it differently on every page, so
	// no two copies normalise alike and the repeated-line rule cannot see it.
	iso.push(seg('Firmenname: Example University Universitätsbiblio' + 'B.'.repeat(p + 1)
		+ 'enutzername: _ip_user_00000000-0000-0000', p, 60, 7));
	for (let i = 0; i < 13; i++) iso.push(seg(clause(p * 13 + i), p, 690 - i * 14, 11));
}
// A sentence broken across the page break, in reading order
iso.push(seg('The analysis of the business context may be thought of as', 0, 500, 11));
iso.push(seg('a discovery process using those two mapping approaches since their purpose is clear.', 1, 500, 11));

const container = { sentences: [...iso], paragraphs: [] };
const result = Skip.rewrite({ _readAloudSegments: container });
const remaining = container.sentences.map(s => s.text);
check('body height measured, not furniture height', Skip.stats.median, 11);
check('no furniture survives', remaining.filter(t => furniture.some(f => t.includes(f.slice(0, 18)))).length, 0);
check('no watermark survives', remaining.filter(t => /Firmenname/.test(t)).length, 0);
check('every clause kept', remaining.filter(t => /^Clause \d+ sets out/.test(t)).length, 39);
check('rewrite reported as applied', result.applied, true);
check('page-break sentence stitched', remaining.some(t =>
	/may be thought of as a discovery process/.test(t)), true);

/* ------------------------------------------------------------- custom escape */
console.log('\ncustom pattern escape hatch');
rules([], 'Firmenname:\n_ip_user_');
check('custom match drops segment', Skip.apply({ text: 'Firmenname: Example University', position: { pageIndex: 1, rects: [[0, 60, 300, 67]] } }).reason, 'custom');
check('unrelated text kept', Skip.apply({ text: 'Ordinary body prose about the subject.', position: { pageIndex: 1, rects: [[0, 400, 300, 411]] } }).skipped, false);

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
