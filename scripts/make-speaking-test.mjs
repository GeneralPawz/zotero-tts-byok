/*
	Builds target/speaking-test.pdf from test/fixtures/speaking-test.txt.

	  node scripts/make-speaking-test.mjs

	A hand-written PDF rather than a dependency: what matters for Read Aloud is the text layer,
	and base-14 Helvetica with WinAnsiEncoding extracts cleanly everywhere. Widths come from the
	standard Helvetica metrics so wrapping is exact rather than guessed — a line that overran the
	page would silently lose text from the extraction.
*/

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Helvetica advance widths, characters 32–126, in 1/1000 em
const WIDTHS = [
	278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
	556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
	1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
	667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
	333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
	556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
if (WIDTHS.length !== 95) throw new Error(`width table is ${WIDTHS.length}, expected 95`);

// Typographic characters the source uses, mapped to their WinAnsi byte and width
const WINANSI = new Map([
	['‘', [0x91, 222]], ['’', [0x92, 222]],
	['“', [0x93, 333]], ['”', [0x94, 333]],
	['–', [0x96, 556]], ['—', [0x97, 1000]],
	['…', [0x85, 1000]], [' ', [0x20, 278]]
]);

function encodeChar(ch) {
	let code = ch.codePointAt(0);
	if (code >= 32 && code <= 126) return [code, WIDTHS[code - 32]];
	if (WINANSI.has(ch)) return WINANSI.get(ch);
	return [0x3F, WIDTHS[0x3F - 32]]; // '?' for anything outside the encoding
}

const widthOf = (text, size) =>
	[...text].reduce((sum, ch) => sum + encodeChar(ch)[1], 0) * size / 1000;

/** PDF literal string: escape the syntax characters, emit high bytes as octal. */
function pdfString(text) {
	let out = '';
	for (let ch of text) {
		let [code] = encodeChar(ch);
		if (code === 0x28 || code === 0x29 || code === 0x5C) out += '\\' + String.fromCharCode(code);
		else if (code < 32 || code > 126) out += '\\' + code.toString(8).padStart(3, '0');
		else out += String.fromCharCode(code);
	}
	return out;
}

function wrap(text, size, maxWidth) {
	let words = text.split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	let lines = [];
	let line = words[0];
	for (let word of words.slice(1)) {
		if (widthOf(line + ' ' + word, size) <= maxWidth) line += ' ' + word;
		else {
			lines.push(line);
			line = word;
		}
	}
	lines.push(line);
	return lines;
}

/* ------------------------------------------------------------------ layout */

const PAGE = { w: 595.28, h: 841.89 };   // A4
const MARGIN = { x: 64, top: 72, bottom: 64 };
const COLUMN = PAGE.w - MARGIN.x * 2;
const BODY = 11.5;
const LEADING = 16.5;

const source = readFileSync(join(root, 'test/fixtures/speaking-test.txt'), 'utf8');
const paragraphs = source.replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean);

// [{ text, size, gapBefore }]
const blocks = [
	{ text: 'Speaking Test', size: 19, gap: 0 },
	{ text: 'Emotion tag coverage for Read Aloud BYOK', size: 10, gap: 6 },
	...paragraphs.map(text => ({ text, size: BODY, gap: 8, indent: true }))
];

const pages = [];
let current = [];
let y = PAGE.h - MARGIN.top;

/*
	Zotero decides paragraph breaks from the first character's x position — a line starting more
	than 10pt right of the one before it begins a new paragraph — and then merges any resulting
	single-line paragraph into the previous one when the font matches. So the source text has to
	be genuinely multi-line per paragraph, and the first line has to be indented, or the whole
	page collapses into one Read Aloud unit.
*/
const INDENT = 18;

for (let block of blocks) {
	let leading = block.size * 1.45;
	let lines = wrap(block.text, block.size, COLUMN - (block.indent ? INDENT : 0));
	for (let [index, line] of lines.entries()) {
		let advance = index === 0 ? block.gap + leading : leading;
		let x = MARGIN.x + (block.indent && index === 0 ? INDENT : 0);
		if (y - advance < MARGIN.bottom) {
			pages.push(current);
			current = [];
			y = PAGE.h - MARGIN.top;
			advance = leading;
		}
		y -= advance;
		current.push({ text: line, size: block.size, x, y });
	}
}
if (current.length) pages.push(current);

/* -------------------------------------------------------------- PDF output */

const objects = [];
const add = (body) => objects.push(body) && objects.length;   // 1-based object number

const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
// Each page has to name its parent, so the page tree's id is reserved now and written later
const pagesId = add(null);

const pageIds = [];
for (let lines of pages) {
	let stream = 'BT\n' + lines.map(line =>
		`/F1 ${line.size} Tf 1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm (${pdfString(line.text)}) Tj`
	).join('\n') + '\nET\n';
	let contentId = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`);
	pageIds.push(add(
		`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] `
		+ `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`));
}
objects[pagesId - 1] =
	`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
const infoId = add('<< /Title (Speaking Test) /Creator (zotero-tts-byok) >>');

let pdf = '%PDF-1.4\n%âãÏÓ\n';
const offsets = [];
objects.forEach((body, index) => {
	offsets.push(Buffer.byteLength(pdf, 'latin1'));
	pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
	+ offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')
	+ `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`
	+ `startxref\n${xref}\n%%EOF\n`;

mkdirSync(join(root, 'target'), { recursive: true });
const out = join(root, 'target/speaking-test.pdf');
writeFileSync(out, Buffer.from(pdf, 'latin1'));
console.log(`wrote ${out} — ${pages.length} page(s), ${blocks.length} blocks, ${Buffer.byteLength(pdf, 'latin1')} bytes`);
