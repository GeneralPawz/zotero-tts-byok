/*
	Read Aloud BYOK — documentation links.  Run with:  node test/check-docs.js

	Splitting the README across docs/ made every relative path one directory deeper, which is
	exactly the sort of thing that rots silently. This resolves every local link and image in
	the README and under docs/, and reports anything unreachable — plus any image in the
	repository that nothing references.
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let problems = 0;
const fail = (msg) => { problems++; console.log('  ' + msg); };

const pages = ['README.md', ...fs.readdirSync(path.join(ROOT, 'docs'))
	.filter(name => name.endsWith('.md'))
	.map(name => path.join('docs', name))];

const referenced = new Set();

for (const page of pages) {
	const text = fs.readFileSync(path.join(ROOT, page), 'utf8');
	const dir = path.dirname(path.join(ROOT, page));
	let links = 0;

	for (const m of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
		const target = m[1].split('#')[0].trim();
		if (!target || /^(https?:|mailto:)/.test(target)) continue;
		links++;
		const resolved = path.resolve(dir, target);
		if (!fs.existsSync(resolved)) {
			fail(`${page}: ${target} does not exist`);
			continue;
		}
		if (/\.(png|jpg|svg|gif|mp4)$/i.test(target)) {
			referenced.add(path.relative(ROOT, resolved).replace(/\\/g, '/'));
		}
	}
	console.log(`  ${page.padEnd(24)} ${links} local link(s)`);
}

/* An unreferenced asset is either a leftover or a page that forgot to include it */
const assets = fs.readdirSync(path.join(ROOT, 'media'))
	.filter(name => /\.(png|jpg|svg|gif|mp4)$/i.test(name))
	.map(name => `media/${name}`);
for (const asset of assets) {
	if (!referenced.has(asset)) console.log(`  note: ${asset} is not referenced anywhere`);
}

/*
	GitHub turns a bare user-attachments URL into a video player, but only when the URL is alone
	on its own line. Wrapped in a link, in angle brackets, or reflowed onto a line with prose, it
	silently degrades to an ordinary link — the player just quietly stops being a player.
*/
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const attachments = readme.match(/https:\/\/github\.com\/user-attachments\/assets\/[\w-]+/g) || [];
if (!attachments.length) fail('README.md: the embedded video URL is gone');
for (const url of attachments) {
	const bare = readme.split(/\r?\n/).some(line => line.trim() === url);
	if (bare) console.log(`  video embed             ${url.split('/').pop()} renders as a player`);
	else fail(`README.md: ${url} is not alone on its line, so it renders as a link, not a player`);
}

/* Every docs page should lead back, or the split leaves dead ends */
for (const page of pages.filter(p => p.startsWith('docs'))) {
	const text = fs.readFileSync(path.join(ROOT, page), 'utf8');
	if (!text.includes('../README.md')) fail(`${page}: no link back to the README`);
}

console.log(problems ? `\n${problems} broken link(s)` : '\nevery documentation link resolves');
process.exit(problems ? 1 : 0);
