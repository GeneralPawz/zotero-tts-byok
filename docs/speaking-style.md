# Speaking style

Directing how the text is delivered: style prompts, inline emotion tags, and a voice per character.

[← Read Aloud BYOK](../README.md)

![Speaking style](../images/settings-style.png)

Expressive models take direction in natural language. Gemini's convention is to put it in the text
itself — `Say cheerfully: Have a wonderful day!` — and it also honours inline tags like
`[whispers]`, `[shouting]`, `[excited]` and `[sigh]`. OpenAI's expressive models instead read an
`instructions` field. The **Send it** dropdown picks which of the two the plugin uses.

In prepend mode the prompt is glued to the front of every segment, joined by a space if it ends in
a colon or dash and by a blank line otherwise, so both of these work:

```
Say the following calmly and clearly, at a measured pace:
```
```
You are reading an academic paper aloud to a colleague. Keep the tone even and unhurried.
```

Two things to know. Zotero's audio cache is keyed on the voice and the *source* text, not the style
prompt, so **Clear cached audio** after changing it or you'll keep hearing the previous delivery.
And direction lands more reliably on paragraphs than on single sentences — if a model starts
reading the instruction aloud, switch the chunk size to paragraphs.

**Extra request JSON** is merged over the request body for provider-specific controls, such as
`{"provider":{"options":{"style":"cheerful","styledegree":1.5}}}` for Azure MAI-Voice-2 via
OpenRouter.

### Inline emotion tags

Gemini reads bracketed tags as performance direction rather than speaking them. They work in the
style prompt and equally inside a document's own text. The **Insert emotion tag** picker under the
prompt offers the tested set, grouped as below, and drops the choice in at the cursor.

These have been tested and work; they are ordinary English words, so spelling matters more than
the brackets do.

| Register | Tags |
| --- | --- |
| Amusement | `[laughing]`, `[silly]`, `[hysterical]` |
| Joy | `[joyful]`, `[delighted]`, `[thrilled]`, `[ecstatic]` |
| Yearning | `[longing]`, `[lust]` |
| Surprise | `[surprised]`, `[startled]`, `[flabbergasted]` |
| Displeasure | `[annoyed]`, `[bitter]`, `[angry]`, `[hostile]`, `[disgusted]` |
| Delivery | `[whispering]` |

### Speakers

A line beginning with a configured speaker tag is spoken by that character's voice, and the tag
itself is not read out:

```
[Mara] [angry] “THEO?!”
[Theo] [silly] “Would you believe I’m a highly trained pastry inspector?”
```

![Speakers](../images/settings-speakers.png)

Set the tags under **Speakers** in the settings, each pointing at one of your voices — a female
voice for Mara, a male one for Theo. **Voice for untagged text** in the same section covers
everything no tag claims: narration, headings, ordinary prose. Leave it unset and that text keeps
the voice chosen in the reader; set it and a story reads as a narrator plus its characters.

Speaker and emotion tags combine, and the speaker tag has to come first. With sentence chunks the
split falls where you would want it — `[Mara] [angry] “Theo!”` is Mara, and the narration sentence
after it is the narrator.

Automatic speaker detection is not attempted. Attribution in prose is genuinely ambiguous —
consecutive lines by one character, unattributed replies — and guessing wrong is worse than not
guessing, so the tags are explicit.

There is a document for trying them. `test/fixtures/speaking-test.txt` is a short scene that uses
every tag above at least once, and

```
node scripts/make-speaking-test.mjs
```

turns it into `target/speaking-test.pdf`. Add that to Zotero and read it aloud to hear how a voice
handles the whole set in context, rather than one tag at a time in the prompt box. The scene is
also tagged for two speakers, so configuring `Mara` and `Theo` demonstrates the voice switching.

Note that the tags are bracketed, and the **Text in [ ]** skip rule would otherwise strip them
before synthesis — which is why recognised emotion and speaker tags are held back from that rule.
An unrecognised bracket is still dropped as before.

Tags apply from where they appear until the mood shifts, so they can be mixed inside one passage:

```
[whispering] The manuscript had been missing for eighty years. [thrilled] And there it was.
```

They combine with the style prompt — the prompt sets the baseline register for everything, the
tags move it locally. Since Zotero caches audio by voice and source text, tags placed in a
document's own text are cached like any other reading; a changed **style prompt** is not, so clear
the cached audio after editing it.
