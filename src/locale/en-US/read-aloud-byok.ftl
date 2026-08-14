# Read Aloud BYOK — preferences pane

byok-test-now =
    .label = Speak a test phrase

## Provider

byok-provider-heading = Provider
byok-enabled =
    .label = Use my own text-to-speech provider in Read Aloud
byok-enabled-hint = Your voices appear in the reader's voice picker under the tier selected below, alongside Zotero's own voices. Requires being signed in to a Zotero account.
byok-provider = Provider
byok-provider-openai =
    .label = OpenAI-compatible (OpenAI, OpenRouter, Groq, Kokoro…)
byok-provider-elevenlabs =
    .label = ElevenLabs
byok-provider-speechify =
    .label = Speechify
byok-provider-azure =
    .label = Azure Speech
byok-provider-google =
    .label = Google Gemini TTS
byok-provider-custom =
    .label = Custom endpoint
byok-base-url = Base URL
byok-base-url-azure = Region or endpoint URL
byok-api-key = API key
byok-api-key-hint = Stored in plain text in your Zotero profile's prefs.js, like other plugin settings.
byok-model = Model
byok-audio-format = Audio format
byok-audio-format-pcm =
    .label = pcm (wrapped in WAV)
byok-pcm-rate = PCM sample rate
byok-pcm-hint = Some models return headerless PCM and reject every other format — Google's Gemini TTS on OpenRouter is one. Pick pcm there and a WAV header is added for the reader. 24000 suits Gemini and OpenAI; if speech sounds too fast or too slow, this is the number to change.

## Custom endpoint

byok-custom-heading = Custom endpoint
byok-custom-hint = Placeholders: {"{{"}text{"}}"}, {"{{"}voice{"}}"}, {"{{"}model{"}}"}, {"{{"}lang{"}}"}, {"{{"}key{"}}"}.
byok-custom-method = Method
byok-custom-url = Request URL
byok-custom-headers = Headers (JSON)
byok-custom-body = Request body (JSON)
byok-custom-audio-path = Audio path in JSON response
byok-custom-audio-path-hint = Leave empty if the endpoint returns raw audio bytes. Otherwise give a dotted path to a base64 string, e.g. candidates.0.content.parts.0.inlineData.data
byok-custom-mime = Response MIME type
byok-custom-pcm = Raw PCM sample rate
byok-custom-pcm-hint = 0 unless the base64 payload is headerless 16-bit mono PCM, in which case give its sample rate (e.g. 24000) and a WAV header will be added.

## Voices

byok-voices-heading = Voices
byok-voices-hint = The id is whatever your provider calls the voice; locales control which reader languages it is offered for. Use a bare language code such as en or de for multilingual voices — a region-tagged voice is only offered for that exact region.
byok-voices-view-list =
    .label = List
byok-voices-view-json =
    .label = JSON
byok-voices-add =
    .label = Add voice
byok-voices-load =
    .label = Load from provider…
byok-voices-tidy =
    .label = Tidy JSON
byok-voices-col-id = Voice ID
byok-voices-col-label = Name
byok-voices-col-locales = Languages
byok-voices-remove =
    .tooltiptext = Remove this voice
byok-voices-empty = No voices yet. Add one, or load them from your provider.

## Speaking style

byok-style-heading = Speaking style
byok-style-hint = Direction for how the text should be delivered — tone, pace, mood. Gemini also honours inline tags such as [whispers] or [excited] inside your own text.
byok-style-mode = Send it
byok-style-mode-prepend =
    .label = in front of each segment (Gemini, most models)
byok-style-mode-instructions =
    .label = as an instructions field (OpenAI)
byok-style-cache-hint = Zotero caches audio per voice and source text, so the style prompt is not part of the cache key — use Clear cached audio after changing it, or you will keep hearing the old delivery. Paragraph chunks follow direction more reliably than single sentences.
byok-extra-body = Extra request JSON (merged into the request body)
byok-extra-body-hint = For provider-specific controls, e.g. OpenRouter passes {"{"}"provider":{"{"}"options":{"{"}"style":"cheerful"{"}"}{"}"}{"}"} to Azure MAI-Voice-2.

## Reader integration

byok-reader-heading = Reader integration
byok-tier = Show voices under
byok-tier-premium =
    .label = Premium
byok-tier-standard =
    .label = Standard
byok-tier-local =
    .label = Local
byok-granularity = Send text in chunks of
byok-granularity-sentence =
    .label = one sentence
byok-granularity-paragraph =
    .label = one paragraph
byok-granularity-hint = Sentences start playing sooner and track highlighting precisely. Paragraphs sound more natural and cost fewer requests, but buffer longer.
byok-hide-zotero =
    .label = Hide Zotero's own Standard and Premium voices
byok-hide-zotero-hint = Prevents accidentally spending your remaining Zotero credits. Local system voices stay.

## Skip

byok-skip-heading = Skip
byok-skip-hint = The same toggles appear under Skip in the reader's Read Aloud popup. Skipped passages stay highlighted but are silent, and are never sent to your provider.
byok-skip-frontMatter =
    .label = Title and authors
byok-skip-headersFooters =
    .label = Running heads and footers
byok-skip-footnotes =
    .label = Footnotes
byok-skip-tables =
    .label = Tables
byok-skip-formulas =
    .label = Formulas
byok-skip-citations =
    .label = Citations
byok-skip-urls =
    .label = URLs and DOIs
byok-skip-parens =
    .label = Text in ( )
byok-skip-brackets =
    .label = Text in [ ]
byok-skip-braces =
    .label = Text in { "{" } { "}" }
byok-skip-kinds-hint = The first five read the page layout and are best-effort; the last five are exact text rules. Clear cached audio below after changing these, since Zotero caches by source text.
byok-skip-smooth =
    .label = Cut skipped passages out of the reading order and rejoin split sentences
byok-skip-smooth-hint = Rewrites the reader's own segment list when a document opens, so playback never stops on skipped passages and a sentence broken across a page break is read as one. Because it happens at open time, changing any skip setting takes effect the next time you open the document. Turn this off to have skipped passages silently played over instead.
byok-skip-custom = Always skip lines containing (one per line)
byok-skip-custom-hint = Plain text, case-insensitive, matched anywhere in a segment — for watermarks and library stamps that repeat unpredictably, e.g. Firmenname: or _ip_user_
byok-skip-diagnostics =
    .label = Skip diagnostics

## Logging

byok-log-heading = Logging
byok-log-hint = Records the running build, your settings, how each document measured, what the reading order rewrite did, every skip decision with the rule behind it, and every request sent to the provider. Your API key is never written — only whether one is set.
byok-log-enabled =
    .label = Write a diagnostic log (JSONL)
byok-log-open =
    .label = Open log folder
byok-log-tail =
    .label = Show last entries
byok-log-clear =
    .label = Clear log
byok-log-path = Log file: { $path }

## Maintenance

byok-maintenance-heading = Maintenance
byok-clear-cache =
    .label = Clear cached audio
byok-last-error =
    .label = Show last reader error
byok-copy-message =
    .label = Copy message
byok-copied = Copied

byok-about-heading = About
byok-about-license = Read Aloud BYOK — MIT licensed. github.com/GeneralPawz/zotero-tts-byok
byok-version-line = Plugin { $plugin } · Zotero { $zotero }

byok-jump-output =
    .label = Output ⤓
byok-emotion-label = Insert emotion tag
byok-emotion-placeholder =
    .label = Insert…
byok-emotion-hint = Inserted at the cursor. These read as performance direction rather than being spoken; they work in the prompt above and equally inside a document’s own text.
byok-emotion-group-amusement = Amusement
byok-emotion-group-joy = Joy
byok-emotion-group-yearning = Yearning
byok-emotion-group-surprise = Surprise
byok-emotion-group-displeasure = Displeasure
byok-emotion-group-delivery = Delivery

byok-provider-openrouter =
    .label = OpenRouter
byok-models-load =
    .label = Load models…
byok-test-menu-voice =
    .label = Voice
byok-test-menu-first = First configured voice
byok-test-menu-language =
    .label = Language
byok-test-menu-voice-default = Voice’s own language
byok-test-menu-text =
    .label = Test phrase…
byok-msg-loading-models = Loading models…
byok-msg-models-loaded = Loaded { $count } model(s).
byok-msg-models-none = The provider listed no models — type the id instead.
byok-msg-models-failed = Could not load models: { $detail }

byok-speakers-heading = Speakers
byok-speakers-hint = Give a character its own voice: a line beginning with the tag, e.g. [Mara], is spoken by that voice and the tag is not read out. Works alongside the emotion tags.
byok-speakers-col-tag = Tag
byok-speakers-col-voice = Voice
byok-speakers-add =
    .label = Add speaker
byok-speakers-empty = No speakers configured.

byok-speakers-default = Voice for untagged text
byok-speakers-default-hint = Narration, headings, anything no tag claims. Leave unset to keep the voice chosen in the reader.
byok-speakers-default-none = Reader’s chosen voice

## Alternating voices

byok-cast-heading = Alternating voices
byok-cast-hint = Most documents carry no speaker tags and never will. This gives one to two or more voices anyway, handing each a turn in rotation so a long stretch of prose stops sounding like one unbroken block.
byok-cast-mode = Change voice every
byok-cast-mode-off =
    .label = Off — one voice
byok-cast-mode-sentence =
    .label = Sentence
byok-cast-mode-paragraph =
    .label = Paragraph
byok-cast-mode-page =
    .label = Page
byok-cast-mode-section =
    .label = Section (at each heading)
byok-cast-add =
    .label = Add voice to rotation
byok-cast-empty = No voices in the rotation.
byok-cast-needs-two = Add a second voice — one voice cannot alternate with itself.
byok-cast-tags-hint = Speaker tags still win where a document has them, and skipped passages do not use up a turn. The order below is the order the voices take.

## Status messages

byok-msg-loading-voices = Loading voices…
byok-msg-voices-loaded = Loaded { $count } voice(s).
byok-msg-voices-none = The provider returned no voices.
byok-msg-voices-failed = Could not load voices: { $detail }
byok-msg-json-invalid = The voice list is not valid JSON.
byok-msg-json-fix-first = Fix the JSON before adding voices from the list view.
byok-msg-json-invalid-list = The voice list is not valid JSON. Switch to the JSON view to fix it.
byok-msg-voices-configured = { $count } voice(s) configured.
byok-msg-need-voice = Configure at least one voice first.
byok-msg-requesting = Requesting a sample from { $voice }…
byok-msg-no-audio = The provider returned no audio.
byok-msg-playing = Playing { $kb } KB of { $type } from { $voice }.
byok-msg-test-failed = Test failed: { $detail }
byok-msg-cache-cleared = Cached Read Aloud audio cleared.
byok-msg-cache-failed = Could not clear the cache: { $detail }
byok-msg-no-errors = No playback errors recorded since Zotero started.
byok-msg-log-empty = The log is empty.
byok-msg-log-none-yet = No log yet — switch logging on, reopen the PDF, and play a little.
byok-msg-log-opening = Opening the log folder…
byok-msg-log-opened = Opened { $path }
byok-msg-log-off = Logging is switched off, so there is nothing to show. Switch it on above, reopen the PDF, and play a little.
byok-msg-log-cleared = Log cleared. Reopen the PDF to capture a fresh run from the start.
byok-msg-log-tail = { $path }
    { $entries } entries, last 40:
byok-msg-log-unreadable = Could not read the log: { $detail }
byok-msg-folder-failed = Could not open the folder: { $detail }
