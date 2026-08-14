# Read Aloud BYOK — Einstellungen

byok-test-now =
    .label = Testsatz vorlesen

## Anbieter

byok-provider-heading = Anbieter
byok-enabled =
    .label = Eigenen Sprachausgabe-Anbieter für Vorlesen verwenden
byok-enabled-hint = Ihre Stimmen erscheinen in der Stimmenauswahl des Readers unter der unten gewählten Stufe, neben Zoteros eigenen Stimmen. Erfordert eine Anmeldung bei einem Zotero-Konto.
byok-provider = Anbieter
byok-provider-openai =
    .label = OpenAI-kompatibel (OpenAI, OpenRouter, Groq, Kokoro…)
byok-provider-elevenlabs =
    .label = ElevenLabs
byok-provider-speechify =
    .label = Speechify
byok-provider-azure =
    .label = Azure Speech
byok-provider-google =
    .label = Google Gemini TTS
byok-provider-custom =
    .label = Eigener Endpunkt
byok-base-url = Basis-URL
byok-base-url-azure = Region oder Endpunkt-URL
byok-api-key = API-Schlüssel
byok-api-key-hint = Wird im Klartext in der prefs.js Ihres Zotero-Profils gespeichert, wie andere Plugin-Einstellungen auch.
byok-model = Modell
byok-audio-format = Audioformat
byok-audio-format-pcm =
    .label = pcm (in WAV verpackt)
byok-pcm-rate = PCM-Abtastrate
byok-pcm-hint = Manche Modelle liefern PCM ohne Header und lehnen jedes andere Format ab — Googles Gemini TTS über OpenRouter gehört dazu. Wählen Sie dort pcm; ein WAV-Header wird für den Reader ergänzt. 24000 passt zu Gemini und OpenAI; klingt die Sprache zu schnell oder zu langsam, ist dies der Wert zum Ändern.

## Eigener Endpunkt

byok-custom-heading = Eigener Endpunkt
byok-custom-hint = Platzhalter: {"{{"}text{"}}"}, {"{{"}voice{"}}"}, {"{{"}model{"}}"}, {"{{"}lang{"}}"}, {"{{"}key{"}}"}.
byok-custom-method = Methode
byok-custom-url = Anfrage-URL
byok-custom-headers = Header (JSON)
byok-custom-body = Anfrage-Body (JSON)
byok-custom-audio-path = Audio-Pfad in der JSON-Antwort
byok-custom-audio-path-hint = Leer lassen, wenn der Endpunkt rohe Audiodaten liefert. Sonst einen Punktpfad zu einem Base64-String angeben, z. B. candidates.0.content.parts.0.inlineData.data
byok-custom-mime = MIME-Typ der Antwort
byok-custom-pcm = Abtastrate für rohes PCM
byok-custom-pcm-hint = 0, außer die Base64-Daten sind 16-Bit-Mono-PCM ohne Header — dann die Abtastrate angeben (z. B. 24000), damit ein WAV-Header ergänzt wird.

## Stimmen

byok-voices-heading = Stimmen
byok-voices-hint = Die ID ist der Name, den Ihr Anbieter der Stimme gibt; die Sprachen steuern, für welche Reader-Sprachen sie angeboten wird. Für mehrsprachige Stimmen einen reinen Sprachcode wie en oder de verwenden — eine Stimme mit Regionsangabe wird nur für genau diese Region angeboten.
byok-voices-view-list =
    .label = Liste
byok-voices-view-json =
    .label = JSON
byok-voices-add =
    .label = Stimme hinzufügen
byok-voices-load =
    .label = Vom Anbieter laden…
byok-voices-tidy =
    .label = JSON aufräumen
byok-voices-col-id = Stimmen-ID
byok-voices-col-label = Name
byok-voices-col-locales = Sprachen
byok-voices-remove =
    .tooltiptext = Diese Stimme entfernen
byok-voices-empty = Noch keine Stimmen. Fügen Sie eine hinzu oder laden Sie sie vom Anbieter.

## Sprechstil

byok-style-heading = Sprechstil
byok-style-hint = Anweisung, wie der Text vorgetragen werden soll — Ton, Tempo, Stimmung. Gemini beachtet außerdem Inline-Tags wie [whispers] oder [excited] in Ihrem eigenen Text.
byok-style-mode = Senden
byok-style-mode-prepend =
    .label = vor jedem Abschnitt (Gemini, die meisten Modelle)
byok-style-mode-instructions =
    .label = als instructions-Feld (OpenAI)
byok-style-cache-hint = Zotero speichert Audio je Stimme und Quelltext zwischen; der Stilprompt gehört nicht zum Cache-Schlüssel. Nach einer Änderung „Zwischengespeichertes Audio löschen“ verwenden, sonst hören Sie weiter den alten Vortrag. Absätze folgen der Anweisung zuverlässiger als einzelne Sätze.
byok-extra-body = Zusätzliches Anfrage-JSON (wird in den Body eingefügt)
byok-extra-body-hint = Für anbieterspezifische Optionen, z. B. reicht OpenRouter {"{"}"provider":{"{"}"options":{"{"}"style":"cheerful"{"}"}{"}"}{"}"} an Azure MAI-Voice-2 weiter.

## Reader-Integration

byok-reader-heading = Reader-Integration
byok-tier = Stimmen anzeigen unter
byok-tier-premium =
    .label = Premium
byok-tier-standard =
    .label = Standard
byok-tier-local =
    .label = Lokal
byok-granularity = Text senden in Abschnitten von
byok-granularity-sentence =
    .label = einem Satz
byok-granularity-paragraph =
    .label = einem Absatz
byok-granularity-hint = Sätze beginnen früher zu spielen und markieren präzise mit. Absätze klingen natürlicher und verursachen weniger Anfragen, puffern aber länger.
byok-hide-zotero =
    .label = Zoteros eigene Standard- und Premium-Stimmen ausblenden
byok-hide-zotero-hint = Verhindert, dass Ihr verbleibendes Zotero-Guthaben versehentlich verbraucht wird. Lokale Systemstimmen bleiben erhalten.

## Überspringen

byok-skip-heading = Überspringen
byok-skip-hint = Dieselben Schalter erscheinen unter „Überspringen“ im Vorlesen-Fenster des Readers. Übersprungene Stellen bleiben markiert, bleiben aber stumm und werden nie an Ihren Anbieter gesendet.
byok-skip-frontMatter =
    .label = Titel und Autoren
byok-skip-headersFooters =
    .label = Kopf- und Fußzeilen
byok-skip-footnotes =
    .label = Fußnoten
byok-skip-tables =
    .label = Tabellen
byok-skip-formulas =
    .label = Formeln
byok-skip-citations =
    .label = Zitationen
byok-skip-urls =
    .label = URLs und DOIs
byok-skip-parens =
    .label = Text in ( )
byok-skip-brackets =
    .label = Text in [ ]
byok-skip-braces =
    .label = Text in { "{" } { "}" }
byok-skip-kinds-hint = Die ersten fünf werten das Seitenlayout aus und arbeiten heuristisch; die letzten fünf sind exakte Textregeln. Nach Änderungen unten das zwischengespeicherte Audio löschen, da Zotero nach Quelltext zwischenspeichert.
byok-skip-smooth =
    .label = Übersprungene Stellen aus der Lesereihenfolge entfernen und getrennte Sätze zusammenfügen
byok-skip-smooth-hint = Schreibt beim Öffnen eines Dokuments die Segmentliste des Readers um, sodass die Wiedergabe nie an übersprungenen Stellen stockt und ein über den Seitenumbruch getrennter Satz als einer gelesen wird. Da dies beim Öffnen geschieht, wirken Änderungen an den Überspringen-Einstellungen erst beim nächsten Öffnen des Dokuments. Ausschalten, um übersprungene Stellen stattdessen stumm zu überspielen.
byok-skip-custom = Zeilen immer überspringen, die Folgendes enthalten (eine pro Zeile)
byok-skip-custom-hint = Einfacher Text, Groß-/Kleinschreibung egal, überall im Abschnitt gesucht — für Wasserzeichen und Bibliotheksstempel, die sich unregelmäßig wiederholen, z. B. Firmenname: oder _ip_user_
byok-skip-diagnostics =
    .label = Diagnose zum Überspringen

## Protokollierung

byok-log-heading = Protokollierung
byok-log-hint = Zeichnet die laufende Version, Ihre Einstellungen, die Messwerte jedes Dokuments, das Ergebnis der Umschreibung der Lesereihenfolge, jede Überspringen-Entscheidung samt zugrunde liegender Regel und jede an den Anbieter gesendete Anfrage auf. Ihr API-Schlüssel wird nie geschrieben — nur, ob einer gesetzt ist.
byok-log-enabled =
    .label = Diagnoseprotokoll schreiben (JSONL)
byok-log-open =
    .label = Protokollordner öffnen
byok-log-tail =
    .label = Letzte Einträge anzeigen
byok-log-clear =
    .label = Protokoll leeren
byok-log-path = Protokolldatei: { $path }

## Wartung

byok-maintenance-heading = Wartung
byok-clear-cache =
    .label = Zwischengespeichertes Audio löschen
byok-last-error =
    .label = Letzten Reader-Fehler anzeigen
byok-copy-message =
    .label = Meldung kopieren
byok-copied = Kopiert

byok-about-heading = Über
byok-about-license = Read Aloud BYOK — MIT-Lizenz. github.com/GeneralPawz/zotero-tts-byok
byok-version-line = Plugin { $plugin } · Zotero { $zotero }
byok-channel-line = Update-Kanal: { $channel }
byok-channel-switch =
    .label = Kanal wechseln
byok-channel-to-dev =
    .label = Zu Dev-Builds wechseln
byok-channel-to-stable =
    .label = Zu stabilen Builds wechseln
byok-channel-switching = Der { $channel }-Download wird geöffnet. Einmal installieren — Zotero übernimmt die Update-Adresse aus dem installierten Plugin, danach folgen Updates diesem Kanal von selbst.


byok-jump-output =
    .label = Ausgabe ⤓
byok-emotion-label = Emotions-Tag einfügen
byok-emotion-placeholder =
    .label = Einfügen …
byok-emotion-hint = Wird an der Cursorposition eingefügt. Die Tags werden als Vortragsanweisung gelesen und nicht mitgesprochen; sie wirken im Prompt oben ebenso wie im Text eines Dokuments.
byok-emotion-group-amusement = Belustigung
byok-emotion-group-joy = Freude
byok-emotion-group-yearning = Sehnsucht
byok-emotion-group-surprise = Überraschung
byok-emotion-group-displeasure = Unmut
byok-emotion-group-delivery = Vortrag

byok-provider-openrouter =
    .label = OpenRouter
byok-models-load =
    .label = Modelle laden …
byok-test-menu-voice =
    .label = Stimme
byok-test-menu-first = Erste eingerichtete Stimme
byok-test-menu-language =
    .label = Sprache
byok-test-menu-voice-default = Eigene Sprache der Stimme
byok-test-menu-text =
    .label = Testsatz …
byok-msg-loading-models = Modelle werden geladen …
byok-msg-models-loaded = { $count } Modell(e) geladen.
byok-msg-models-none = Der Anbieter hat keine Modelle aufgelistet — ID bitte eintippen.
byok-msg-models-failed = Modelle konnten nicht geladen werden: { $detail }

byok-speakers-heading = Sprecher
byok-speakers-hint = Einer Figur eine eigene Stimme geben: Eine Zeile, die mit dem Tag beginnt, z. B. [Mara], wird von dieser Stimme gesprochen; das Tag selbst wird nicht vorgelesen. Funktioniert zusammen mit den Emotions-Tags.
byok-speakers-col-tag = Tag
byok-speakers-col-voice = Stimme
byok-speakers-add =
    .label = Sprecher hinzufügen
byok-speakers-empty = Keine Sprecher eingerichtet.

byok-speakers-default = Stimme für Text ohne Tag
byok-speakers-default-hint = Erzähltext, Überschriften, alles ohne Tag. Nicht gesetzt lassen, um die im Reader gewählte Stimme zu behalten.
byok-speakers-default-none = Im Reader gewählte Stimme

## Wechselnde Stimmen

byok-cast-heading = Wechselnde Stimmen
byok-cast-hint = Die meisten Dokumente enthalten keine Sprecher-Tags und werden es nie. Dies gibt ihnen trotzdem zwei oder mehr Stimmen, die sich abwechseln, damit ein langer Fließtext nicht wie ein einziger Block klingt.
byok-cast-mode = Stimme wechseln bei jedem/jeder
byok-cast-mode-off =
    .label = Aus — eine Stimme
byok-cast-mode-sentence =
    .label = Satz
byok-cast-mode-paragraph =
    .label = Absatz
byok-cast-mode-page =
    .label = Seite
byok-cast-mode-section =
    .label = Abschnitt (bei jeder Überschrift)
byok-cast-add =
    .label = Stimme zur Abfolge hinzufügen
byok-cast-empty = Keine Stimmen in der Abfolge.
byok-cast-needs-two = Eine zweite Stimme hinzufügen — eine Stimme allein kann sich nicht abwechseln.
byok-cast-tags-hint = Sprecher-Tags haben weiterhin Vorrang, wo ein Dokument sie enthält, und übersprungene Passagen verbrauchen keinen Zug. Die Reihenfolge unten ist die Reihenfolge der Stimmen.

## Reader-Panel

byok-doc-defaults-hint = Dies sind die Standardwerte. Ein Dokument kann von jedem davon abweichen — dazu das Dokument öffnen und die Schieberegler-Schaltfläche in der Reader-Symbolleiste verwenden.
byok-doc-heading = Dieses Dokument
byok-doc-section-mode = Modus
byok-doc-mode-narrator = Erzähler
byok-doc-mode-narrator-hint = Eine Stimme durchgehend, in einer Stimmung nach Wahl.
byok-doc-mode-podcast = Podcast
byok-doc-mode-podcast-hint = Stimmen wechseln sich ab — für Dokumente, die nie dafür geschrieben wurden: Aufsätze, Normen, Berichte.
byok-doc-mode-audiobook = Hörbuch
byok-doc-mode-audiobook-hint = [Theo] [whispering] im Text wählt Stimme und Stimmung. Setzt ein Dokument mit Tags voraus.
byok-doc-sentiment = Stimmung
byok-doc-sentiment-none = Neutral — keine Vorgabe
byok-doc-cast-needs-two = Eine zweite Stimme hinzufügen, sonst liest eine Stimme alles.
byok-doc-speakers-needed = Keine Sprecher gesetzt, daher nutzt jede Zeile die Stimme für Text ohne Tag.

byok-doc-reset = Globale Einstellungen verwenden
byok-doc-none = Ein Dokument öffnen, um dessen Einstellungen zu ändern.
byok-doc-section-reading = Lesen
byok-doc-section-skip = Überspringen
byok-doc-section-cast = Wechselnde Stimmen
byok-doc-section-speakers = Sprecher
byok-doc-granularity = Vorlesen nach
byok-doc-smooth = Übersprungenen Text aus der Lesereihenfolge entfernen
byok-doc-custom = Außerdem Zeilen überspringen, die Folgendes enthalten (eine pro Zeile)
byok-doc-cast-mode = Stimme wechseln bei jedem/jeder
byok-doc-cast-add = Stimme zur Abfolge hinzufügen
byok-doc-speakers-add = Sprecher hinzufügen
byok-doc-default-voice = Stimme für Text ohne Tag
byok-doc-revert = Zurück zum globalen Standard
byok-doc-note = Diese gelten nur für dieses Dokument. Neu übersprungener Text verstummt sofort; bereits aus der Lesereihenfolge entfernter Text kehrt zurück, wenn das Dokument erneut geöffnet wird.

## Lesemodus

byok-mode-heading = Lesemodus
byok-mode-hint = Wie ein Dokument vertont wird. Es ist immer genau einer aktiv; die Wahl eines Modus legt die anderen beiseite, statt sie zu überlagern.
byok-mode-narrator =
    .label = Erzähler — eine Stimme, in einer Stimmung nach Wahl
byok-mode-podcast =
    .label = Podcast — Stimmen wechseln sich ab, für Dokumente, die nie dafür gedacht waren
byok-mode-audiobook =
    .label = Hörbuch — [Theo] [whispering] im Text wählt Stimme und Stimmung
byok-sentiment = Stimmung
byok-sentiment-hint = Nur im Erzähler-Modus. Hörbuch-Dokumente tragen ihre Vorgaben im Text, und der Podcast-Modus bezieht seine Abwechslung aus den Stimmen.

## Statusmeldungen

byok-msg-loading-voices = Stimmen werden geladen …
byok-msg-voices-loaded = { $count } Stimme(n) geladen.
byok-msg-voices-none = Der Anbieter hat keine Stimmen zurückgegeben.
byok-msg-voices-failed = Stimmen konnten nicht geladen werden: { $detail }
byok-msg-json-invalid = Die Stimmenliste ist kein gültiges JSON.
byok-msg-json-fix-first = Beheben Sie das JSON, bevor Sie in der Listenansicht Stimmen hinzufügen.
byok-msg-json-invalid-list = Die Stimmenliste ist kein gültiges JSON. Wechseln Sie zur JSON-Ansicht, um sie zu korrigieren.
byok-msg-voices-configured = { $count } Stimme(n) eingerichtet.
byok-msg-need-voice = Richten Sie zuerst mindestens eine Stimme ein.
byok-msg-requesting = Hörprobe von { $voice } wird angefordert …
byok-msg-no-audio = Der Anbieter hat kein Audio zurückgegeben.
byok-msg-playing = { $kb } KB { $type } von { $voice } werden abgespielt.
byok-msg-test-failed = Test fehlgeschlagen: { $detail }
byok-msg-cache-cleared = Zwischengespeichertes Vorlese-Audio gelöscht.
byok-msg-cache-failed = Cache konnte nicht geleert werden: { $detail }
byok-msg-no-errors = Seit dem Start von Zotero wurden keine Wiedergabefehler aufgezeichnet.
byok-msg-log-empty = Das Protokoll ist leer.
byok-msg-log-none-yet = Noch kein Protokoll — Protokollierung einschalten, PDF erneut öffnen und kurz abspielen.
byok-msg-log-opening = Protokollordner wird geöffnet …
byok-msg-log-opened = { $path } geöffnet
byok-msg-log-off = Die Protokollierung ist ausgeschaltet, daher gibt es nichts anzuzeigen. Oben einschalten, das PDF erneut öffnen und ein wenig abspielen.
byok-msg-log-cleared = Protokoll geleert. Öffnen Sie das PDF erneut, um einen frischen Durchlauf aufzuzeichnen.
byok-msg-log-tail = { $path }
    { $entries } Einträge, letzte 40:
byok-msg-log-unreadable = Protokoll konnte nicht gelesen werden: { $detail }
byok-msg-folder-failed = Ordner konnte nicht geöffnet werden: { $detail }
