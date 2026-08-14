/*
	Read Aloud BYOK — every shipped script parses.  Run with:  node test/check-syntax.js

	v1.15.0 shipped a string literal containing real newlines. Nothing caught it: the unit tests
	load skip.js, cast.js and docprefs.js, the build only zips files, and CI ran both — so a file
	none of the tests happened to import went out broken, and a plugin whose main script does not
	parse does not load at all.

	This parses every script in the package, which is cheap and answers the only question that
	matters before shipping: can Zotero read it. Parsing is the whole check — an unterminated
	string is precisely what the parser is good at, and a hand-rolled quote counter mostly finds
	apostrophes in prose.
*/

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

let problems = 0;
let checked = 0;

/** Every .js under src/, whatever it is for — bootstrap, libraries, pane, defaults. */
function scripts(dir) {
	let found = [];
	for (let entry of fs.readdirSync(dir, { withFileTypes: true })) {
		let full = path.join(dir, entry.name);
		if (entry.isDirectory()) found.push(...scripts(full));
		else if (entry.name.endsWith('.js')) found.push(full);
	}
	return found;
}

for (let file of scripts(SRC)) {
	let name = path.relative(ROOT, file).replace(/\\/g, '/');
	let source = fs.readFileSync(file, 'utf8');
	checked++;
	try {
		new vm.Script(source, { filename: name });
		console.log(`  ok    ${name}`);
	}
	catch (e) {
		problems++;
		console.log(`  FAIL  ${name}\n        ${e.message}`);
	}
}

console.log(problems
	? `\n${problems} problem(s) across ${checked} script(s)`
	: `\nall ${checked} scripts parse`);
process.exit(problems ? 1 : 0);
