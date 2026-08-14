/* Read Aloud BYOK — bootstrap */

var BYOK;

function install() {}

function uninstall() {}

async function startup({ id, version, rootURI }) {
	Services.scriptloader.loadSubScript(rootURI + 'lib/byok-tts.js');
	// These attach to Zotero.BYOKTTS, so they load after it
	Services.scriptloader.loadSubScript(rootURI + 'lib/docprefs.js');
	Services.scriptloader.loadSubScript(rootURI + 'lib/skip.js');
	Services.scriptloader.loadSubScript(rootURI + 'lib/cast.js');
	Services.scriptloader.loadSubScript(rootURI + 'lib/log.js');
	Services.scriptloader.loadSubScript(rootURI + 'lib/readerUI.js');
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
