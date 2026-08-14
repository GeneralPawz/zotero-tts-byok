/*
	Read Aloud BYOK — diagnostic log.

	Appends one JSON object per line to byok-tts/byok-tts.jsonl under the Zotero data directory —
	a folder of its own, because a stray file in the profile root is neither findable when you
	want it nor obviously ours when you don't. Off by default.
	Records the running build, the effective settings, what the document measured as, what the
	reading-order rewrite did, every skip decision with the rule that made it, and every request
	sent to the provider with its outcome. The API key is never written — only whether one is set.
*/

Zotero.BYOKTTS.Log = new function () {
	const PREF = 'extensions.zotero.byokTTS.log.';
	const FILE = 'byok-tts.jsonl';
	const DIR = 'byok-tts';
	const MAX_TEXT = 400;
	const MAX_BYTES = 25 * 1024 * 1024;

	let _queue = Promise.resolve();
	let _bytes = null;
	let _warned = false;
	let _migrated = false;

	// The data directory is the folder people know and back up; the profile is the fallback for
	// a Zotero that does not expose it.
	const ROOT = (() => {
		try {
			if (Zotero.DataDirectory && Zotero.DataDirectory.dir) return Zotero.DataDirectory.dir;
		}
		catch (e) {
			// Fall through
		}
		return Zotero.Profile.dir;
	})();

	this.dir = PathUtils.join(ROOT, DIR);
	this.path = PathUtils.join(this.dir, FILE);
	// Where builds before 1.13.0 wrote, so an existing log is not stranded
	this.legacyPath = PathUtils.join(Zotero.Profile.dir, FILE);

	/**
	 * Make sure the folder exists, moving a log left by an earlier build into it. Cheap after the
	 * first call, and called before every write so the folder is always there to be opened.
	 */
	this.ensureDir = async function () {
		await IOUtils.makeDirectory(this.dir, { ignoreExisting: true, createAncestors: true });
		if (!_migrated) {
			_migrated = true;
			try {
				if (await IOUtils.exists(this.legacyPath)) {
					await IOUtils.move(this.legacyPath, this.path, { noOverwrite: true });
					Zotero.debug('BYOK TTS: moved the diagnostic log into ' + this.dir);
				}
			}
			catch (e) {
				// An existing log in the new place wins; the old one is left alone rather than lost
			}
		}
		return this.dir;
	};

	this.enabled = function () {
		return !!Zotero.Prefs.get(PREF + 'enabled', true);
	};

	this.clip = function (text) {
		let string = String(text ?? '');
		return string.length > MAX_TEXT ? string.slice(0, MAX_TEXT) + '…' : string;
	};

	/**
	 * Append one record. Never throws and never blocks the caller — logging must not be able
	 * to break playback.
	 */
	this.write = function (event, fields) {
		if (!this.enabled()) return;
		let record;
		try {
			record = JSON.stringify(Object.assign({ t: new Date().toISOString(), ev: event }, fields));
		}
		catch (e) {
			try {
				record = JSON.stringify({ t: new Date().toISOString(), ev: event, logError: String(e) });
			}
			catch (ignore) {
				return;
			}
		}
		let bytes = new TextEncoder().encode(record + '\n');
		_queue = _queue
			.then(async () => {
				if (_bytes === null) {
					try {
						let stat = await IOUtils.stat(this.path);
						_bytes = stat.size || 0;
					}
					catch (e) {
						_bytes = 0;
					}
				}
				if (_bytes > MAX_BYTES) {
					if (!_warned) {
						_warned = true;
						Zotero.debug('BYOK TTS: diagnostic log has hit its size cap; clear it to keep logging');
					}
					return;
				}
				await this.ensureDir();
				await IOUtils.write(this.path, bytes, { mode: 'append' });
				_bytes += bytes.length;
			})
			.catch((e) => {
				Zotero.debug('BYOK TTS: could not write diagnostic log — ' + (e.message || e));
			});
	};

	/** Settings snapshot, with the key reduced to a yes/no. */
	this.settings = function () {
		let get = key => Zotero.Prefs.get('extensions.zotero.byokTTS.' + key, true);
		let skip = {};
		for (let rule of Zotero.BYOKTTS.Skip.RULES) {
			skip[rule.key] = Zotero.BYOKTTS.Skip.isOn(rule.key);
		}
		skip.smoothOrder = Zotero.BYOKTTS.Skip.isOn('smoothOrder');
		skip.customCount = Zotero.BYOKTTS.Skip.customPatterns().length;
		return {
			enabled: !!get('enabled'),
			provider: get('provider'),
			baseUrl: get('baseUrl'),
			model: get('model'),
			format: get('format'),
			pcmSampleRate: get('pcmSampleRate'),
			tier: get('tier'),
			granularity: get('granularity'),
			hideZoteroVoices: !!get('hideZoteroVoices'),
			styleMode: get('styleMode'),
			stylePromptChars: String(get('stylePrompt') || '').length,
			apiKeySet: !!String(get('apiKey') || '').length,
			voices: (() => {
				try {
					return JSON.parse(get('voices') || '[]').map(v => v.id);
				}
				catch (e) {
					return 'unparseable';
				}
			})(),
			skip
		};
	};

	this.session = function (reason) {
		this.write('session', {
			reason,
			plugin: Zotero.BYOKTTS.version || 'unknown',
			zotero: Zotero.version,
			platform: Zotero.platform,
			settings: this.settings()
		});
	};

	this.clear = async function () {
		_queue = _queue.then(async () => {
			try {
				await IOUtils.remove(this.path);
			}
			catch (e) {
				// Nothing to remove
			}
			_bytes = 0;
			_warned = false;
		});
		await _queue;
	};

	this.size = async function () {
		try {
			let stat = await IOUtils.stat(this.path);
			return stat.size || 0;
		}
		catch (e) {
			return 0;
		}
	};

	/** Flush anything queued, so the file is complete before it is read or revealed. */
	this.flush = async function () {
		await _queue;
	};
};
