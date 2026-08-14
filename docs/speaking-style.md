# Speaking style

Directing how the text is delivered: style prompts, inline emotion tags, and a voice per character.

[← Read Aloud BYOK](../README.md)

![Speaking style](../media/settings-style.png)

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

![Speakers](../media/settings-speakers.png)

![The reader following the narration, a voice per character](../media/multi-speaker.gif)

This clip is silent. The [README](../README.md) plays the same half minute with sound, which is
rather the point; the recording is also in the repository as
[`media/multi-speaker.mp4`](../media/multi-speaker.mp4) if you would rather have the file.

#### Setting it up

Three things have to line up, and the second is the one people miss:

1. **The voices exist.** Each speaker points at a voice **id** from your Voices list, so add the
   voices first. A speaker naming a voice that is not configured is ignored rather than guessed at.
2. **The tag starts the line.** `matchSpeaker` looks at the beginning of a segment only — a tag in
   the middle of a sentence is left alone and read out as text.
3. **A voice for untagged text**, if you want a narrator. Left unset, narration simply keeps
   whichever voice is selected in the reader, which is also a perfectly good arrangement.

A worked example, matching the speaking test:

| Setting | Value |
| --- | --- |
| Voices | `Zephyr`, `Puck`, `Charon` (or any three from your provider) |
| Speaker `Mara` | `Kore` |
| Speaker `Theo` | `Puck` |
| Voice for untagged text | `Charon` |

```
[Mara] [angry] “Theo!” She lowered the rolling pin by perhaps two inches.
```

read as sentence chunks becomes two requests: `“Theo!”` in Mara's voice with the tags stripped,
then `She lowered the rolling pin…` in the narrator's. Switch to paragraph chunks and the whole
passage goes to Mara instead, because the speaker tag is decided per segment — sentences are what
give you the alternation.

#### What it does not do

Automatic speaker detection is not attempted. Attribution in prose is genuinely ambiguous —
consecutive lines by one character, unattributed replies, dialogue split by a beat of narration —
and guessing wrong is worse than not guessing, so the tags are explicit.

Tags also have to be in the document, and there is no way to tag a PDF you did not write. For
everything else there is the rotation below.

### Alternating voices

Most of what you read carries no speaker tags and never will. A standard, a paper, a report — you
cannot write a cast into a document somebody else published. **Alternating voices** hands one two
or more voices anyway, giving each a turn in rotation, so an hour of prose stops arriving as a
single unbroken block.

Pick how often the voice should change:

| Every | Reads as |
| --- | --- |
| **Sentence** | Two readers trading lines. Busy over long stretches, good for dense argument |
| **Paragraph** | The usual choice — a clear handover at each new thought |
| **Page** | A voice per page; the least intrusive |
| **Section** | A voice per numbered clause or heading, which suits standards |

Then list the voices in the order they should take their turns. Two is the minimum, because one
voice cannot alternate with itself; a third and fourth simply extend the cycle.

Three things are worth knowing:

1. **Speaker tags still win.** A document that has them keeps them; the rotation only picks up
   what no tag claimed, so a tagged story and an untagged standard both behave sensibly.
2. **Skipped passages do not use up a turn.** With running heads switched off in
   [Skip rules](skip.md), the footer between two pages is not counted, so the paragraph after it
   still alternates against the one before it rather than repeating that voice.
3. **The assignment is fixed, not counted as it goes.** Which voice a paragraph gets depends only
   on where it sits in the document, so seeking, re-reading, and Zotero's three-segment prefetch
   all produce the same reading — and the audio cache keeps working.

Section mode calls a line a heading when it is set larger than the body text, or when it is short
and numbered like a clause (`4.2 Conformance`) without closing punctuation. On a document with no
headings at all it will find no boundaries, and one voice reads the lot; paragraph mode is the
safer default when in doubt.

### Trying it

There is a document for trying all of this:
**[speaking-test.pdf](https://github.com/GeneralPawz/zotero-tts-byok/releases/latest/download/speaking-test.pdf)**,
attached to every release. Add it to Zotero and read it aloud to hear a voice handle the whole set
in context, rather than one tag at a time in the prompt box.

It is a two-page scene using every tag above at least once, with its dialogue tagged for two
characters — configure speakers named `Mara` and `Theo`, plus a voice for untagged text, and you
get a narrator and a cast. From a checkout, `node scripts/make-speaking-test.mjs` rebuilds it from
`test/fixtures/speaking-test.txt`.

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
