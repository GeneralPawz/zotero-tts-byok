/*
	Read Aloud BYOK — every workflow runs every test.  Run with:  node test/check-workflows.js

	The release workflow listed its test files by hand and was written before three of the suites
	existed, so a build could fail check-syntax on a pull request and still be released. That is
	not hypothetical: v1.15.0 went out unable to parse.

	A test file that no workflow runs is a test that does not defend anything, so this compares
	what is in test/ against what each workflow invokes.
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');

// This file counts itself: a guard the workflows do not run is a guard that never fires
const suites = fs.readdirSync(__dirname)
	.filter(name => name.endsWith('.js'))
	.sort();

let problems = 0;

for (let file of fs.readdirSync(WORKFLOWS).filter(n => n.endsWith('.yml')).sort()) {
	let text = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8');
	let invoked = new Set(
		[...text.matchAll(/node\s+test\/(\S+\.js)/g)].map(m => m[1])
	);
	let missing = suites.filter(s => !invoked.has(s));
	let unknown = [...invoked].filter(s => !suites.includes(s));

	if (missing.length) {
		problems++;
		console.log(`  FAIL  ${file} does not run: ${missing.join(', ')}`);
	}
	if (unknown.length) {
		problems++;
		console.log(`  FAIL  ${file} runs a test that does not exist: ${unknown.join(', ')}`);
	}
	if (!missing.length && !unknown.length) {
		console.log(`  ok    ${file.padEnd(16)} runs all ${suites.length} suites`);
	}
}

console.log(problems
	? `\n${problems} workflow problem(s)`
	: `\nevery workflow runs every suite`);
process.exit(problems ? 1 : 0);
