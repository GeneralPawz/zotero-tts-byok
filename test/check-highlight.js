/*
	Read Aloud BYOK — JSON highlighter check.  Run with:  node test/check-highlight.js

	The highlighter paints a <pre> that sits exactly under the textarea, so the rendered text
	must round-trip to the original character for character — otherwise the caret drifts away
	from the glyphs. The tokeniser is lifted straight out of pane.js so this tests the shipping
	regex rather than a retyped copy of it.
*/

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src/prefs/pane.js'), 'utf8');
const line = /let token = (\/.*\/g);/.exec(source);
if (!line) throw new Error('could not find the tokeniser in pane.js');
// eslint-disable-next-line no-eval
const token = eval(line[1]);

const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlight(text) {
	let html = '';
	let last = 0;
	let match;
	token.lastIndex = 0;
	while ((match = token.exec(text)) !== null) {
		html += escape(text.slice(last, match.index));
		let cls = match[1] ? 'k' : match[2] ? 's' : match[3] ? 'n' : match[4] ? 'b' : 'p';
		html += `<span class="byok-t-${cls}">${escape(match[0])}</span>`;
		last = match.index + match[0].length;
	}
	return html + escape(text.slice(last));
}

let problems = 0;
const check = (label, actual, expected) => {
	let ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) {
		problems++;
		console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`);
	}
	else {
		console.log(`  ok    ${label}`);
	}
};

const sample = JSON.stringify(
	[{ id: 'Kore', label: 'Kore <em> & "quoted"', locales: ['en', 'de'], rate: 1.5, ok: true, x: null }],
	null, 2);
const out = highlight(sample);

// Stripping the markup must give back exactly what went in
const plain = out
	.replace(/<span class="byok-t-[a-z]">/g, '')
	.replace(/<\/span>/g, '')
	.replace(/&lt;/g, '<')
	.replace(/&gt;/g, '>')
	.replace(/&amp;/g, '&');
check('round-trips character for character', plain, sample);
check('HTML is escaped', out.includes('&lt;em&gt;') && out.includes('&amp;'), true);

const classOf = (text) => {
	token.lastIndex = 0;
	let m = token.exec(text);
	if (!m) return 'none';
	return m[1] ? 'key' : m[2] ? 'string' : m[3] ? 'number' : m[4] ? 'literal' : 'punct';
};
check('object key', classOf('"id":'), 'key');
check('string value', classOf('"Kore"'), 'string');
check('number', classOf('1.5'), 'number');
check('negative exponent', classOf('-2.5e-3'), 'number');
check('literal true', classOf('true'), 'literal');
check('literal null', classOf('null'), 'literal');
check('punctuation', classOf('['), 'punct');
check('escaped quote inside a string stays one token', classOf('"a\\"b"'), 'string');

const counts = {};
for (let m of out.matchAll(/byok-t-([a-z])/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
check('keys, strings, numbers and literals all present',
	['k', 's', 'n', 'b'].every(c => counts[c] > 0), true);

console.log(problems ? `\n${problems} problem(s)` : '\nhighlighter is faithful to the source text');
process.exit(problems ? 1 : 0);
