/*
	Read Aloud BYOK — localisation and wiring check.  Run with:  node test/check-l10n.js

	Verifies that every string the preferences pane asks for exists in every locale, that XUL
	elements which render a `label` attribute are given one, that no locale carries dead strings,
	and that every inline handler in the markup is actually implemented.
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const xhtml = fs.readFileSync(path.join(ROOT, 'src/prefs/pane.xhtml'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'src/prefs/pane.js'), 'utf8');
const localeDir = path.join(ROOT, 'src/locale');
const locales = fs.readdirSync(localeDir);

let problems = 0;
const fail = (msg) => { problems++; console.log('  ' + msg); };

/* Which ids are actually requested */
const used = new Set();
for (let m of xhtml.matchAll(/data-l10n-id="([^"]+)"/g)) used.add(m[1]);
for (let m of js.matchAll(/setAttributes\(\s*\w+\s*,\s*'([^']+)'/g)) used.add(m[1]);
for (let m of js.matchAll(/\b(?:msg|statusL10n)\('([^']+)'/g)) used.add(m[1]);
// setAttributes with a ternary: pick up both branches
for (let m of js.matchAll(/setAttributes\([^)]*\?\s*'([^']+)'\s*:\s*'([^']+)'/g)) {
	used.add(m[1]);
	used.add(m[2]);
}

/*
	Ids the script holds in a table and resolves through a variable — the emotion group
	headings, for instance — cannot be tied to a call site by pattern matching. Every byok-
	literal in the script counts as a reference for the dead-string check, but not as a demand
	that the string exist, since this set also sweeps up element ids and class names.
*/
const referenced = new Set(used);
const scripts = [js, ...fs.readdirSync(path.join(ROOT, 'src/lib'))
	.filter(name => name.endsWith('.js'))
	.map(name => fs.readFileSync(path.join(ROOT, 'src/lib', name), 'utf8'))];
for (let source of scripts) {
	for (let m of source.matchAll(/'(byok-[a-zA-Z0-9-]+)'/g)) referenced.add(m[1]);
}

/* Parse each locale */
function parseFtl(file) {
	const entries = new Map();
	let current = null;
	// Split on either ending: JavaScript's `.` does not match \r, so on a CRLF checkout every
	// anchored pattern below matches nothing and the check silently passes on an empty set.
	for (let line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		let head = /^([a-zA-Z][a-zA-Z0-9_-]*) =(.*)$/.exec(line);
		if (head) {
			current = head[1];
			entries.set(current, { attrs: new Set(), value: head[2].trim() !== '' });
			continue;
		}
		let attr = /^\s+\.([a-zA-Z-]+) =/.exec(line);
		if (attr && current) entries.get(current).attrs.add(attr[1]);
		if (/^\S/.test(line)) current = null;
	}
	return entries;
}

const parsed = new Map(locales.map(l => [l, parseFtl(path.join(localeDir, l, 'read-aloud-byok.ftl'))]));
const reference = parsed.get('en-US');
if (!reference) throw new Error('en-US locale is missing');
if (!reference.size) throw new Error('en-US locale parsed to nothing — check the file encoding');

console.log(`locales: ${locales.join(', ')}`);
console.log(`ids requested by the pane: ${used.size}`);

for (let id of [...used].sort()) {
	for (let [locale, entries] of parsed) {
		if (!entries.has(id)) fail(`${locale}: missing "${id}"`);
	}
}

/* XUL elements that render a label attribute need one supplied */
const needsLabel = new Set();
for (let m of xhtml.matchAll(/<(?:button|menuitem|checkbox|radio)\b[^>]*data-l10n-id="([^"]+)"/g)) {
	needsLabel.add(m[1]);
}
for (let id of needsLabel) {
	for (let [locale, entries] of parsed) {
		let entry = entries.get(id);
		if (entry && !entry.attrs.has('label')) fail(`${locale}: "${id}" needs a .label attribute`);
	}
}

/* Dead strings, and locales drifting apart */
for (let [locale, entries] of parsed) {
	for (let id of entries.keys()) {
		if (!referenced.has(id)) fail(`${locale}: "${id}" is defined but never used`);
	}
	if (locale === 'en-US') continue;
	for (let id of reference.keys()) {
		if (!entries.has(id)) fail(`${locale}: not translated — "${id}"`);
	}
}

/* Inline handlers must exist */
const calls = new Set([...xhtml.matchAll(/pane\.([a-zA-Z]+)\(/g)].map(m => m[1]));
for (let name of [...calls].sort()) {
	if (!new RegExp('^\\t(?:async )?' + name + '\\(', 'm').test(js)) {
		fail(`pane.${name}() is called from the markup but not defined`);
	}
}
console.log(`inline handlers: ${calls.size}`);

console.log(problems ? `\n${problems} problem(s)` : '\nall strings resolve and all handlers exist');
process.exit(problems ? 1 : 0);
