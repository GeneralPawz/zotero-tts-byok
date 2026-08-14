# Development

Repository layout, building, localisation, tests, releasing, and how the screenshots are made.

[← Read Aloud BYOK](../README.md)

## How it works

Zotero's reader gets its voice catalog and its audio from the parent process through two methods on
`Zotero.Sync.APIClient.prototype`:

| Method | Called for |
| --- | --- |
| `getReadAloudVoices()` | Populating the voice picker (`GET /tts/voices`) |
| `getReadAloudAudio(segment, voiceID)` | Every sentence or paragraph (`POST /tts/speak`) |

This plugin wraps both. Voices you configure are merged into the catalog under a namespaced
`byok:` ID, and any audio request for one of those IDs is answered by your provider rather than
`api.zotero.org`. Everything else stays stock Zotero: sentence segmentation, the three-segment
prefetch, the parent-process audio cache, playback speed, sentence highlighting, annotation from
the reading position, and resume-where-you-left-off.

Because `creditsPerMinute` is reported as `0`, the reader shows no quota bar and never offers to
sell you more minutes for these voices.

## Project layout

```
docs/           the pages this one belongs to
src/            everything that ships inside the .xpi
  manifest.json, bootstrap.js, prefs.js, icon.png
  lib/          byok-tts.js, skip.js, log.js, readerUI.js
  prefs/        pane.xhtml, pane.js, pane.css
  locale/       en-US, de — picked up automatically by Zotero
test/           node checks, not packaged
  fixtures/     speaking-test.txt, the emotion tag scene
scripts/        make-update-manifest.mjs, make-speaking-test.mjs
.github/        CI on every push, release on every v* tag
media/          screenshots and recordings
target/         build output, gitignored
```

`build.ps1` stages `src/` and writes `target/read-aloud-byok.xpi`. It adds ZIP entries one at a
time rather than using `CreateFromDirectory`, which on Windows writes subdirectory entries with a
backslash — not a valid ZIP path separator, and Zotero rejects such a package with a generic "may
be incompatible" message. The script fails the build if a backslash or a missing root
`manifest.json` slips through.

## Localisation

Strings live in `src/locale/<locale>/read-aloud-byok.ftl`. Zotero scans every plugin's `locale/`
directory and registers the files with the L10n registry itself, so no wiring is needed; the pane
pulls them in with `MozXULElement.insertFTLIfNeeded` and uses `data-l10n-id`. Locales Zotero has
but the plugin does not fall back to the closest match, then to `en-US`.

To add a language, copy `en-US/read-aloud-byok.ftl` to `src/locale/<locale>/` and translate the
values. `node test/check-l10n.js` reports any string that is missing, untranslated, or left over.

## Tests

```
node test/run-tests.js       skip rules, against fixtures from real documents
node test/check-l10n.js      every string resolves in every locale; handlers exist
node test/check-highlight.js the JSON highlighter round-trips exactly
node test/check-pane.js      pane logic: view toggles, row visibility, status state
node test/check-docs.js      every documentation link and image resolves
```

The skip fixtures are an academic paper and a furniture-heavy standards page with a library
watermark whose text extraction mangles differently on every page. Every case came from a bug;
they should stay passing.

## Media

Screenshots and recordings live in `media/`. Screenshots are rendered rather than captured — see
below — and a screen recording is reduced with ffmpeg before it is committed:

```bash
# 1674x900 source down to a committable size, audio kept
ffmpeg -i raw.mp4 -vf scale=1280:-2 -c:v libx264 -crf 28 -preset slow   -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart media/multi-speaker.mp4

# a short silent excerpt, for the inline embed a README can actually show
ffmpeg -ss 9 -t 12 -i media/multi-speaker.mp4   -vf "fps=10,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4"   -loop 0 media/multi-speaker.gif
```

That took the recording from 6.3 MB to 824 KB with the audio intact, and the excerpt to 576 KB.
GitHub strips `<video>` from markdown and does not embed repository `.mp4` files, so anything
shown inline has to be a GIF, with the video linked beside it for the sound.

## Screenshots

The images in this README are rendered from the pane's own sources rather than captured from a
running Zotero, using [zotero-plugin-ui-sim](https://github.com/GeneralPawz/zotero-plugin-ui-sim):

```
node scripts/sync-plugin.mjs read-aloud-byok D:/projects/zotero-tts-byok
node scripts/capture.mjs read-aloud-byok --out D:/projects/zotero-tts-byok/media
```

It reads this plugin's real `pane.xhtml`, `pane.css` and `.ftl`, so a layout change shows up in
the documentation without anyone reopening the settings window. `--theme dark` and `--locale de`
render the other variants — the German pane is how you find a string that overflows its control.

Every image in this file was produced that way.

## Updates

Zotero updates the plugin itself. It polls the `update_url` in the manifest — `update.json` in
this repository — and offers whatever version that file advertises, so a new GitHub release
reaches existing installs without anyone downloading an `.xpi`. Tools → Plugins → gear icon →
**Check for Updates** forces a check.

Two details Zotero's `AddonUpdateChecker` insists on: the compatibility entry must be under
`applications.zotero` — an update advertised under Firefox's `gecko` key is silently skipped —
and `update_url` must be `https:`, or the add-on is marked broken rather than merely not updated.

`update.json` also carries a `sha256` of the release asset, so a truncated or tampered download
is rejected instead of installed.

### Cutting a release

Bump `version` in `src/manifest.json`, then:

```
git tag v1.7.0 && git push origin v1.7.0
```

`.github/workflows/release.yml` takes it from there: it refuses the tag if it disagrees with the
manifest, runs the test suites, builds, publishes the release with the `.xpi` and the speaking
test PDF attached,
regenerates `update.json` with the new version, link and hash, and commits it to `main` — which
is the moment existing installs start seeing the update.

To do it by hand, `.\build.ps1` then
`node scripts/make-update-manifest.mjs v1.7.0` produces the same `update.json`.

## Getting it listed

Zotero has no plugin directory yet. Its own
[plugins page](https://www.zotero.org/support/plugins) says so outright — "We don't currently
provide a list of available plugins" — and points at the forums, with an official directory
"planned". So there is nothing to submit to there, and no wiki entry to add.

What exists in the meantime:

| Where | What it is |
| --- | --- |
| [Zotero Forums](https://forums.zotero.org/) | Where plugins are actually announced and found |
| [syt2/zotero-addons-scraper](https://github.com/syt2/zotero-addons-scraper) | Feeds the Zotero Addons in-app browser; takes submissions |
| [zotero-plugin-dev/zotero-plugin-registry](https://github.com/zotero-plugin-dev/zotero-plugin-registry) | Work in progress; aggregates self-hosted `update.json` files |

Both registries read the same `update.json` this repository already publishes, so the plugin is
ready to be listed as soon as an entry is submitted. They are expected to fold into the official
directory when it arrives.

## Branches

Two branches, and the distinction is what reaches other people's installs.

| Branch | Role |
| --- | --- |
| `main` | Stable and the default. Every release is tagged here, and `update.json` on `main` is what Zotero polls — so anything merged here is on its way to every install |
| `dev` | Where work lands first, and is tested before it goes anywhere near `main` |

The cycle:

1. Work is committed to `dev`. CI runs there, so a broken build is caught without shipping.
2. A build from `dev` is installed and tried by hand. Nothing is released at this point.
3. Once it is confirmed working, `dev` is merged into `main` and the merge is tagged `vX.Y.Z`.
4. The release workflow builds the tag, publishes the release, and points `update.json` at it.

Step 4 refuses to run for a tag that is not an ancestor of `main`. Tagging `dev` by mistake would
otherwise publish a release and advertise it through `update.json` to everyone, which is precisely
the accident the split exists to prevent.

A dev build carries the version it will be released under, so installing it over the current
release is an upgrade and the eventual release does not try to reinstall it.

## Update channels

Zotero reads `update_url` from the installed manifest when the plugin is installed, and nothing
at runtime can redirect it — `XPIInstall` sets `addon.updateURL` from the package, and the
`extensions.update.url` preference is only consulted for add-ons that carry no update URL of
their own. A setting inside the plugin therefore cannot choose a channel; the channel is a
property of the build.

So there are two, and each build polls its own manifest:

| Channel | Manifest polled | Published by | Tag |
| --- | --- | --- | --- |
| stable | `main/update.json` | `release.yml`, from `main` only | `v1.16.0` |
| dev | `main/update-dev.json` | `release-dev.yml`, from `dev` | `dev-v1.16.0.1` |

```powershell
.uild.ps1              # stable
.uild.ps1 -Channel dev # dev
```

The dev build has its `update_url` rewritten on the way into the archive, so `src/manifest.json`
is never left pointing somewhere unexpected, and the workflow reads the packaged manifest back
out to confirm the channel before publishing.

Both manifests live on `main`. A per-branch `update.json` would work equally well for Zotero and
would conflict on every merge from `dev`, which it did twice before this arrangement.

**Switching channels means installing the other build once.** After that, updates follow that
channel by themselves. The About section of the preferences pane reports which channel an install
is on, read from the packaged manifest rather than a preference — a preference claiming a channel
the manifest disagrees with would simply be wrong.

Dev versions carry a fourth component (`1.16.0.1`), so they sort above the stable release they
lead up to and a dev install is never quietly pulled backwards.

