/*
	Read Aloud BYOK — preferences pane logic.  Run with:  node test/check-pane.js

	Guards the bug where the voices view and the provider rows lagged one click behind. XUL
	compiles an inline oncommand attribute when the element is parsed, which happens before
	Zotero attaches the listener that writes the preference — so a handler that reads the
	preference sees the previous value. Reading the control itself is what fixes it, and this
	pins that down by deliberately leaving the preference stale.
*/

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');

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

/** Minimal stand-ins for the handful of DOM and Zotero surfaces the pane touches. */
function loadPane({ prefs, controls }) {
	const elements = new Map();
	const make = (id) => {
		let node = {
			id,
			hidden: false,
			disabled: false,
			classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
			children: [],
			_events: [],
			addEventListener() {},
			dispatchEvent(e) { this._events.push(e.type); return true; },
			setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
			append() {},
			replaceChildren() {},
			removeAttribute() {},
			querySelector() { return null; },
			closest() { return null; },
			setAttribute() {},
			scrollIntoView() {},
			focus() {}
		};
		if (id in controls) node.value = controls[id];
		if (id === 'byok-voices-view') {
			node.localName = 'radiogroup';
			// XUL reports the first radio until something is genuinely selected
			node.selectedItem = 'selected' in controls ? controls.selected : null;
		}
		return node;
	};
	const document = {
		createEvent: () => ({}),
		getElementById: (id) => {
			if (!elements.has(id)) elements.set(id, make(id));
			return elements.get(id);
		},
		// Rows are now a label and a control sharing a class; one stand-in per selector is
		// enough to observe which rows the code decides to hide.
		querySelectorAll: (selector) => [document.getElementById('sel:' + selector)],
		createElement: () => make('created'),
		createXULElement: () => make('created'),
		l10n: { setAttributes() {}, formatValue: async id => id, translateFragment: async () => {} }
	};
	const sandbox = {
		document,
		Event: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
		window: { MozXULElement: { insertFTLIfNeeded() {} } },
		setTimeout: () => {},
		Zotero: {
			version: '9.0.6',
			logError() {},
			Prefs: { get: k => prefs[k], set: (k, v) => (prefs[k] = v) },
			BYOKTTS: {
				version: '1.9.0',
				Log: { path: 'x' },
				getVoices: () => [{ id: 'Kore', label: 'Kore', locales: ['en'] }],
				EMOTIONS: [
					['byok-emotion-group-amusement', ['laughing', 'silly', 'hysterical']],
					['byok-emotion-group-joy', ['joyful', 'delighted', 'thrilled', 'ecstatic']],
					['byok-emotion-group-yearning', ['longing', 'lust']],
					['byok-emotion-group-surprise', ['surprised', 'startled', 'flabbergasted']],
					['byok-emotion-group-displeasure', ['annoyed', 'bitter', 'angry', 'hostile', 'disgusted']],
					['byok-emotion-group-delivery', ['whispering']]
				]
			}
		}
	};
	vm.createContext(sandbox);
	vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/prefs/pane.js'), 'utf8'), sandbox);
	return { pane: sandbox.Zotero.BYOKTTS.pane, document, prefs };
}

const P = 'extensions.zotero.byokTTS.';

/** Flatten the shipping emotion table so the tags themselves can be checked. */
function pane_EMOTION_TAGS() {
	let { pane } = loadPane({ prefs: {}, controls: {} });
	return pane.EMOTIONS.flatMap(([, tags]) => tags.map(t => `[${t}]`));
}

console.log('\nvoices view follows the control, not the stale preference');
{
	// The user just clicked "json"; the preference still says "list"
	let { pane, document } = loadPane({
		prefs: { [P + 'voicesView']: 'list', [P + 'provider']: 'openai' },
		controls: { 'byok-voices-view': 'json', selected: { value: 'json' }, 'byok-provider': 'openai' }
	});
	pane.updateVoicesView();
	check('json view shown', document.getElementById('byok-voices-json-view').hidden, false);
	check('list view hidden', document.getElementById('byok-voices-list-view').hidden, true);
}
{
	// ...and the other way round
	let { pane, document } = loadPane({
		prefs: { [P + 'voicesView']: 'json', [P + 'provider']: 'openai' },
		controls: { 'byok-voices-view': 'list', selected: { value: 'list' }, 'byok-provider': 'openai' }
	});
	pane.updateVoicesView();
	check('list view shown', document.getElementById('byok-voices-list-view').hidden, false);
	check('json view hidden', document.getElementById('byok-voices-json-view').hidden, true);
}
{
	// No control present (called before the markup exists): fall back to the preference
	let { pane, document } = loadPane({
		prefs: { [P + 'voicesView']: 'json', [P + 'provider']: 'openai' },
		controls: {}
	});
	pane.updateVoicesView();
	check('falls back to the preference', document.getElementById('byok-voices-json-view').hidden, false);
}
{
	// The saved view was not restored on reopening: Zotero populates preference-bound controls
	// from a later timer, and until then a radiogroup reports its FIRST radio rather than
	// nothing — so "list" looked like a real choice and overrode the stored "json".
	let { pane, document } = loadPane({
		prefs: { [P + 'voicesView']: 'json', [P + 'provider']: 'openai' },
		controls: { 'byok-voices-view': 'list', selected: null }
	});
	pane.updateVoicesView();
	check('an unselected radiogroup does not override the stored view',
		document.getElementById('byok-voices-json-view').hidden, false);
}
{
	// Once the user really has clicked, the control wins over the stale preference
	let { pane, document } = loadPane({
		prefs: { [P + 'voicesView']: 'json', [P + 'provider']: 'openai' },
		controls: { 'byok-voices-view': 'list', selected: { value: 'list' } }
	});
	pane.updateVoicesView();
	check('a real selection still wins',
		document.getElementById('byok-voices-list-view').hidden, false);
}

console.log('\nprovider rows follow the control too');
{
	// Switching to custom: the preference still says openai
	let { pane, document } = loadPane({
		prefs: { [P + 'provider']: 'openai', [P + 'format']: 'mp3' },
		controls: { 'byok-provider': 'custom', 'byok-format': 'mp3', 'byok-voices-view': 'list' }
	});
	pane.updateVisibility();
	check('custom endpoint section shown', document.getElementById('byok-custom-group').hidden, false);
	check('base URL row hidden', document.getElementById('sel:.byok-row-baseurl').hidden, true);
	check('audio format row hidden', document.getElementById('sel:.byok-row-format').hidden, true);
}
{
	// PCM rows appear from the format control, again ahead of the preference
	let { pane, document } = loadPane({
		prefs: { [P + 'provider']: 'openai', [P + 'format']: 'mp3' },
		controls: { 'byok-provider': 'openai', 'byok-format': 'pcm', 'byok-voices-view': 'list' }
	});
	pane.updateVisibility();
	check('PCM sample rate row shown', document.getElementById('sel:.byok-row-pcm').hidden, false);
	check('PCM hint shown', document.getElementById('byok-pcm-hint').hidden, false);
}
{
	// OpenRouter is its own menu entry but must be given the OpenAI-shaped fields
	let { pane, document } = loadPane({
		prefs: { [P + 'provider']: 'openai', [P + 'format']: 'pcm' },
		controls: { 'byok-provider': 'openrouter', 'byok-format': 'pcm', 'byok-voices-view': 'list' }
	});
	pane.updateVisibility();
	check('openrouter keeps the audio format row', document.getElementById('sel:.byok-row-format').hidden, false);
	check('openrouter keeps the PCM row', document.getElementById('sel:.byok-row-pcm').hidden, false);
	check('openrouter keeps the base URL row', document.getElementById('sel:.byok-row-baseurl').hidden, false);
	check('openrouter can load voices', document.getElementById('byok-load-voices').disabled, false);
	check('openrouter can load models', document.getElementById('byok-load-models').disabled, false);
}
{
	let { pane, document } = loadPane({
		prefs: {}, controls: { 'byok-provider': 'azure', 'byok-voices-view': 'list' }
	});
	pane.updateVisibility();
	check('azure hides the model row', document.getElementById('sel:.byok-row-model').hidden, true);
	check('azure cannot load models', document.getElementById('byok-load-models').disabled, true);
}

console.log('\nsticky button reflects the last outcome');
{
	let { pane, document } = loadPane({ prefs: {}, controls: {} });
	let button = document.getElementById('byok-test-sticky');
	pane.setState('idle');
	check('starts idle', button.classList.contains('byok-state-idle'), true);
	pane.status('Playing 42 KB…', false);
	check('green after success', button.classList.contains('byok-state-ok'), true);
	check('idle class cleared', button.classList.contains('byok-state-idle'), false);
	pane.status('HTTP 400 — bad model', true);
	check('red after failure', button.classList.contains('byok-state-error'), true);
	check('ok class cleared', button.classList.contains('byok-state-ok'), false);
	pane.status('');
	check('clearing the text leaves the state alone',
		button.classList.contains('byok-state-error'), true);
	check('output panel hidden when empty',
		document.getElementById('byok-status-box').hidden, true);
}

console.log('\nemotion tags insert at the cursor');
{
	let { pane, document } = loadPane({ prefs: {}, controls: {} });
	let area = document.getElementById('byok-style-prompt');

	area.value = '';
	area.selectionStart = area.selectionEnd = 0;
	pane.insertStyleTag('[joyful]');
	check('into an empty prompt', area.value, '[joyful]');

	area.value = 'Read this calmly.';
	area.selectionStart = area.selectionEnd = area.value.length;
	pane.insertStyleTag('[whispering]');
	check('appended with one space', area.value, 'Read this calmly. [whispering]');

	area.value = 'Read this calmly.';
	area.selectionStart = area.selectionEnd = 5;
	pane.insertStyleTag('[angry]');
	check('mid-sentence, spaced on both sides', area.value, 'Read [angry] this calmly.');

	area.value = 'Read  calmly.';
	area.selectionStart = area.selectionEnd = 5;
	pane.insertStyleTag('[bitter]');
	check('no double spacing where one already exists', area.value, 'Read [bitter] calmly.');

	area.value = 'Replace me';
	area.selectionStart = 0;
	area.selectionEnd = area.value.length;
	pane.insertStyleTag('[silly]');
	check('a selection is replaced', area.value, '[silly]');

	check('the preference binding is notified', area._events.includes('input'), true);
}

{
	let { pane } = loadPane({ prefs: {}, controls: {} });
	let tags = pane.EMOTIONS.flatMap(([, group]) => group.map(t => `[${t}]`));
	check('every tag is bracketed and lowercase', tags.every(t => /^\[[a-z]+\]$/.test(t)), true);
	check('no duplicates across groups', new Set(tags).size, tags.length);
	check('groups are named by an l10n id',
		pane.EMOTIONS.every(([id]) => id.startsWith('byok-emotion-group-')), true);
}

console.log(problems ? `\n${problems} problem(s)` : '\npane logic behaves');
process.exit(problems ? 1 : 0);
