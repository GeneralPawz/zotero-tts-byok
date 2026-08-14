/* Read Aloud BYOK — bootstrap */

var BYOK;

function install() {}

function uninstall() {}

async function startup({ id, version, rootURI }) {
	Services.scriptloader.loadSubScript(rootURI + 'byok-tts.js');
	// These attach to Zotero.BYOKTTS, so they load after it
	Services.scriptloader.loadSubScript(rootURI + 'skip.js');
	Services.scriptloader.loadSubScript(rootURI + 'log.js');
	Services.scriptloader.loadSubScript(rootURI + 'readerUI.js');
	BYOK = Zotero.BYOKTTS;
	await BYOK.init({ id, version, rootURI });
	// Log.session() only writes when logging is switched on
	BYOK.Log?.write('prepare', { note: 'plugin started', plugin: version });
	Zotero.debug('Read Aloud BYOK ' + version + ' started');
}

function shutdown() {
	if (BYOK) {
		BYOK.uninit();
		BYOK = undefined;
	}
	delete Zotero.BYOKTTS;
	Zotero.debug('Read Aloud BYOK shut down');
}
