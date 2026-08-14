// Default preferences, registered by Zotero on plugin install.

pref("extensions.zotero.byokTTS.enabled", false);
pref("extensions.zotero.byokTTS.provider", "openai");
pref("extensions.zotero.byokTTS.baseUrl", "https://api.openai.com/v1");
pref("extensions.zotero.byokTTS.apiKey", "");
pref("extensions.zotero.byokTTS.model", "gpt-4o-mini-tts");
pref("extensions.zotero.byokTTS.format", "mp3");
pref("extensions.zotero.byokTTS.pcmSampleRate", "24000");
pref("extensions.zotero.byokTTS.tier", "premium");
pref("extensions.zotero.byokTTS.granularity", "sentence");
pref("extensions.zotero.byokTTS.hideZoteroVoices", false);
pref("extensions.zotero.byokTTS.stylePrompt", "");
pref("extensions.zotero.byokTTS.styleMode", "prepend");
pref("extensions.zotero.byokTTS.extraBody", "");
pref("extensions.zotero.byokTTS.voices", "[{\"id\":\"alloy\",\"label\":\"Alloy\",\"locales\":[\"en\",\"de\"]},{\"id\":\"nova\",\"label\":\"Nova\",\"locales\":[\"en\",\"de\"]},{\"id\":\"onyx\",\"label\":\"Onyx\",\"locales\":[\"en\",\"de\"]}]");

// Skip rules, all off so nothing is silently dropped until asked for
pref("extensions.zotero.byokTTS.skip.frontMatter", false);
pref("extensions.zotero.byokTTS.skip.headersFooters", false);
pref("extensions.zotero.byokTTS.skip.footnotes", false);
pref("extensions.zotero.byokTTS.skip.tables", false);
pref("extensions.zotero.byokTTS.skip.formulas", false);
pref("extensions.zotero.byokTTS.skip.citations", false);
pref("extensions.zotero.byokTTS.skip.urls", false);
pref("extensions.zotero.byokTTS.skip.parens", false);
pref("extensions.zotero.byokTTS.skip.brackets", false);
pref("extensions.zotero.byokTTS.skip.braces", false);
pref("extensions.zotero.byokTTS.skip.smoothOrder", true);
pref("extensions.zotero.byokTTS.skip.custom", "");

pref("extensions.zotero.byokTTS.log.enabled", false);

// "list" (rendered editor) or "json" (raw, syntax-highlighted)
pref("extensions.zotero.byokTTS.voicesView", "list");

// "custom" provider only
pref("extensions.zotero.byokTTS.custom.url", "");
pref("extensions.zotero.byokTTS.custom.method", "POST");
pref("extensions.zotero.byokTTS.custom.headers", "{\"Content-Type\":\"application/json\"}");
pref("extensions.zotero.byokTTS.custom.body", "{\"text\":\"{{text}}\",\"voice\":\"{{voice}}\"}");
pref("extensions.zotero.byokTTS.custom.audioPath", "");
pref("extensions.zotero.byokTTS.custom.mimeType", "audio/mpeg");
pref("extensions.zotero.byokTTS.custom.pcmSampleRate", "0");
