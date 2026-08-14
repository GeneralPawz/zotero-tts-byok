# Per-document settings

Reading a standard and reading a novel want opposite settings. This is how a document keeps its
own.

[← Read Aloud BYOK](../README.md)

## Three modes

A document is read in exactly one of three modes. They are one setting rather than three
toggles, so there is no state in which two are half-on, and the panel shows which is in force
before it shows anything else.

| Mode | For | What decides the voice |
| --- | --- | --- |
| **Narrator** | Anything you want read plainly | One voice throughout, in a **sentiment** you choose from the tested tags |
| **Podcast** (default) | Papers, standards, reports — documents never written to be performed | Voices take turns over a unit you pick: sentence, paragraph, page or section |
| **Audiobook** | Documents written with tags | `[Theo] [whispering]` in the text picks both the voice and the mood |

Choosing one puts the others aside. A rotation configured during a spell in Podcast does not go
on rotating underneath Narrator, and speaker tags are only read as speaker tags in Audiobook —
elsewhere they are ordinary brackets and the skip rules deal with them.

**Sentiment** is Narrator's alone. Audiobook documents carry their direction in the text already,
and overriding that from a setting would fight the tags rather than help them; Podcast gets its
variety from the voices. Where a provider takes direction as a field rather than inline, the
sentiment is spelled out as a sentence rather than passed as a bracketed tag, because a tag in an
instructions field is direction to some models and a literal string to read aloud to others.

Switching to Podcast with nothing to rotate would leave one voice reading everything, which looks
like the mode not working, so the rotation is seeded with your first two voices. It is an ordinary
override — the dot beside it reverts it.

## The sliders button

Open a PDF and look in the reader toolbar, next to Zotero's Read Aloud button. The **sliders**
icon opens a panel for the document you are reading.

Zotero's own popup keeps the transport controls — play, pause, speed, voice, skip. This panel
holds the things Zotero has no concept of:

| Section | What is in it |
| --- | --- |
| Mode | Narrator, Podcast or Audiobook, and whichever settings that mode uses |
| Reading | Sentence or paragraph chunks |
| Skip | The ten rules, the reading-order rewrite, and custom patterns |

## How a document disagrees

Every setting starts as whatever the preferences pane says. Change one here and **only this
document** changes; every other document carries on with the global default, including documents
you have not opened yet.

A setting the document has its own answer for shows a **dot** beside it. Click the dot to drop
that answer and follow the global default again. **Use global settings** at the top of the panel
drops all of them at once.

This works the other way round too, and it is the point of the design: because a document stores
only what it actually disagrees with, changing a global default still moves every document that
never had an opinion.

## What stays global

Anything about *who does the speaking* rather than *how this document is read*:

- Provider, base URL, API key
- Model, audio format, PCM sample rate
- The voice catalogue
- Tier, hiding Zotero's own voices
- Logging

These are account-level choices, and a per-document API key would be a way to leak one. The
per-document store refuses them outright rather than quietly ignoring them.

## Two things worth knowing

**Skip changes are not fully retroactive.** Furniture is pruned out of the reading order when the
document opens, so switching a rule *on* mid-session silences the text at once, but switching one
*off* cannot un-prune what has already gone — reopen the document to get it back. The panel says
so at the foot.

**Changing a setting clears the cached audio.** Zotero caches by voice and source text, so
without that you would keep hearing the previous reading. Expect the next few segments to be
fetched again.

## Where it is kept

One preference, `extensions.zotero.byokTTS.perDocument`, holding a JSON object keyed by
`libraryID/itemKey`. Sparse — a document with no overrides has no entry at all. Entries for items
that no longer exist are pruned, so the map cannot grow without end.

## Why not replace Zotero's popup entirely

It was considered. Zotero's Read Aloud popup is a React component with no plugin hook, and the
live playback controller is created *inside* it — hide the popup and nothing plays, because the
thing that plays is born there. Appending our own controls to it lasts only until React next
re-renders, which is how an earlier build's Skip row kept vanishing.

`renderToolbar` is a supported plugin event, so a button of our own beside Zotero's is both more
honest and considerably more durable than a replacement pretending to be the original.
