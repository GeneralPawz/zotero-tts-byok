/*
	Read Aloud BYOK — per-document settings.  Run with:  node test/check-docprefs.js

	The risk here is not that an override fails to save — it is that it leaks. A value set on one
	document must not be read while another is playing, and a document that has said nothing must
	still follow the global default rather than the last document's opinion.
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

const VOICES = [{ id: 'kore' }, { id: 'puck' }, { id: 'charon' }];

/* Two attachments in one library, plus the reader that is "current" */
const ITEMS = {
	11: { libraryID: 1, key: 'AAAA1111', getDisplayTitle: () => 'ISO 29481-2' },
	22: { libraryID: 1, key: 'BBBB2222', getDisplayTitle: () => 'The Pastry Inspector' }
};
let CURRENT = 11;

const sandbox = {
	console,
	Localization: undefined,
	Zotero: {
		Prefs: { get: k => PREFS[k], set: (k, v) => (PREFS[k] = v) },
		debug: () => {}, logError: () => {},
		Reader: { _readers: [] },
		Items: {
			get: id => ITEMS[id] || null,
			getByLibraryAndKey: (libraryID, key) =>
				Object.values(ITEMS).find(i => i.libraryID === libraryID && i.key === key) || null
		},
		BYOKTTS: {
			emotionTags: () => [], speakerTags: () => [],
			getVoices: () => VOICES,
			clearAudioCache: async () => {}
		}
	}
};
vm.createContext(sandbox);
for (let file of ['docprefs.js', 'skip.js', 'cast.js']) {
	vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'lib', file), 'utf8'), sandbox);
}
const { DocPrefs, Skip, Cast } = sandbox.Zotero.BYOKTTS;

// Playback asks Skip which reader it is measuring; here that is whichever item is "open"
Skip._findReader = () => ({ itemID: CURRENT, _instanceID: 'r' + CURRENT });

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

const ISO = '1/AAAA1111';
const STORY = '1/BBBB2222';

console.log('\nscoping\n');

DocPrefs.setScope(null);
CURRENT = 11;
check('the open document decides the scope', DocPrefs.scope(), ISO);
CURRENT = 22;
check('and follows when another is opened', DocPrefs.scope(), STORY);

console.log('\noverrides\n');

CURRENT = 11;
PREFS['extensions.zotero.byokTTS.skip.headersFooters'] = false;
check('a document with no opinion follows the global default', Skip.isOn('headersFooters'), false);

DocPrefs.set('skip.headersFooters', true);
check('and its own answer once it has one', Skip.isOn('headersFooters'), true);

CURRENT = 22;
check('the other document is unaffected', Skip.isOn('headersFooters'), false);

CURRENT = 11;
PREFS['extensions.zotero.byokTTS.skip.headersFooters'] = true;
DocPrefs.set('skip.headersFooters', false);
check('an override can also disagree by switching a rule off', Skip.isOn('headersFooters'), false);
CURRENT = 22;
check('while the other document takes the new global value', Skip.isOn('headersFooters'), true);

console.log('\nreverting\n');

CURRENT = 11;
check('the document is marked as disagreeing', DocPrefs.overrideCount(ISO), 1);
DocPrefs.unset('skip.headersFooters');
check('reverting restores the global value', Skip.isOn('headersFooters'), true);
check('and leaves nothing behind', DocPrefs.overrideCount(ISO), 0);
check('an emptied document is dropped from the map entirely',
	Object.prototype.hasOwnProperty.call(DocPrefs.all(), ISO), false);

console.log('\nthe cast and the rest\n');

CURRENT = 11;
PREFS['extensions.zotero.byokTTS.cast.mode'] = 'off';
DocPrefs.set('cast.mode', 'section');
DocPrefs.set('cast.voices', JSON.stringify(['kore', 'puck']));
check('this document alternates by section', Cast.mode(), 'section');
check('with its own rotation', Cast.voices(), ['kore', 'puck']);
CURRENT = 22;
check('the story does not alternate at all', Cast.mode(), 'off');
check('and has no rotation', Cast.voices(), []);

console.log('\nglobal settings stay global\n');

CURRENT = 11;
for (let key of ['apiKey', 'provider', 'model', 'baseUrl', 'voices', 'log.enabled']) {
	check(`"${key}" is not overridable`, DocPrefs.overridable(key), false);
}
check('and setting one is refused rather than silently ignored', (() => {
	try {
		DocPrefs.set('apiKey', 'sk-leak');
		return 'accepted';
	}
	catch (e) {
		return 'refused';
	}
})(), 'refused');
check('so it never lands in the per-document map',
	JSON.stringify(DocPrefs.all()).includes('sk-leak'), false);

console.log('\nhousekeeping\n');

DocPrefs.set('granularity', 'paragraph', '1/GONE9999');
check('a deleted document leaves an entry behind', DocPrefs.overrideCount('1/GONE9999'), 1);
check('which pruning removes', DocPrefs.prune(), 1);
check('leaving the live ones alone', DocPrefs.overrideCount(ISO) > 0, true);

console.log(failures ? `\n${failures} of ${checks} checks failed` : `\n${checks}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
