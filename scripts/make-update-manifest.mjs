/*
	Regenerates update.json, the file Zotero polls to discover new versions.

	  node scripts/make-update-manifest.mjs v1.6.0 [outputPath]

	Version, add-on id and compatibility range all come from src/manifest.json so they cannot
	drift from what actually ships. The hash is taken from the built .xpi, which is why this
	runs after the build.

	Zotero's AddonUpdateChecker reads `applications.zotero` — not the `gecko` key Firefox uses —
	and skips any entry lacking it, so an update advertised under the wrong key is simply never
	offered.
*/

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'GeneralPawz/zotero-tts-byok';

const tagArg = process.argv[2];
const outPath = process.argv[3] || join(root, 'update.json');

const manifest = JSON.parse(readFileSync(join(root, 'src/manifest.json'), 'utf8'));
const zotero = manifest.applications?.zotero;
if (!zotero?.id) throw new Error('src/manifest.json has no applications.zotero.id');

const tag = tagArg || `v${manifest.version}`;
// Stable tags are v1.16.0, dev-channel tags dev-v1.16.0.1; both name the manifest version
if (tag.replace(/^(dev-)?v/, '') !== manifest.version) {
	throw new Error(`tag ${tag} does not match manifest version ${manifest.version}`);
}

const xpi = join(root, 'target/read-aloud-byok.xpi');
let update_hash;
try {
	update_hash = 'sha256:' + createHash('sha256').update(readFileSync(xpi)).digest('hex');
}
catch {
	throw new Error(`build the plugin first — ${xpi} not found`);
}

const doc = {
	addons: {
		[zotero.id]: {
			updates: [
				{
					version: manifest.version,
					update_link: `https://github.com/${REPO}/releases/download/${tag}/read-aloud-byok.xpi`,
					update_hash,
					update_info_url: `https://github.com/${REPO}/releases/tag/${tag}`,
					applications: {
						zotero: {
							strict_min_version: zotero.strict_min_version,
							strict_max_version: zotero.strict_max_version
						}
					}
				}
			]
		}
	}
};

writeFileSync(outPath, JSON.stringify(doc, null, '\t') + '\n');
console.log(`wrote ${outPath} for ${tag} (${update_hash.slice(0, 19)}…)`);
