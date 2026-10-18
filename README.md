# Oma Areena — Samsung Tizen proof of concept

An unofficial, GPL-3.0-or-later TV client for Yle Areena. Built for and tested on a Samsung QE55QN85AATXXH running Tizen 6.0, firmware T-NKM2DEUC-2301.1. This project is not affiliated with Yle.

Version 0.2.0 adds live category browsing and programme search across Areena, including a Finnish on-screen keyboard with digits and paged results. The original Elämäni Biisi, Kovan viikon ilta and Pasila shortcuts remain on the home screen. Playback uses native Samsung AVPlay with local resume, subtitles and automatic next episode. There is no Yle account integration; series results open the default episode selected by Yle. Full season selection remains future work.

## Use on the TV

Open **Oma Areena** in Apps. No computer or companion server is needed for normal use.

- Left/right: choose a home programme. OK: play or resume.
- Press Up twice to reach the header, then choose **Selaa** or **Hae**.
- In **Selaa**, left/right selects a category; OK loads it. Navigate result cards with arrows and use the page buttons below the grid for more results.
- In **Hae**, use the on-screen Finnish keyboard, then select **Hae**. A physical keyboard also supports text entry and Enter to search.
- OK plays a search/category result. Back from playback restores the result list. Back again returns to category selection or editing the search.
- Up: focus Play / Start over; left/right selects the action, OK activates it.
- Down: browse available following episodes. Up/down selects; OK plays.
- During playback: OK toggles pause, left/right seeks 10 seconds, Down toggles subtitles, Back returns home.
- At the end of an episode, play the next episode when Yle provides a next-episode reference.

## Build and deploy

```sh
node --check app/app.js
node --check app/data.js
python build.py
python deploy.py --tv YOUR_TV_IP --cert-dir /path/to/certificates --cli "dotnet /path/to/TizenSdb.dll"
```

`build.py` creates `dist/OmaAreena.wgt` using Python's standard library. For deployment, install [TizenSdb](https://github.com/PatrickSt1991/tizen-sdb) and provide a signing certificate directory with `author.p12`, `distributor.p12`, and `password.txt`. Enable Developer Mode on the TV and set its developer host IP to your computer's IP. Read the TV's `sdk_toolpath` capability and override `--sdk-path` if needed.

Use your own signing identity. The initial Tizen 6.0 PoC was tested with the development certificates bundled by Apps2Samsung; no certificates or private keys are included here. The app installs separately from the official Yle app.

The native metadata adapter uses Samsung's Download and Filesystem APIs to retrieve small temporary JSON metadata files, reads them into memory, then deletes them. Video streams directly from Yle. Fresh stream URLs are requested when the memory cache expires after four minutes. No Yle login or DRM bypass is implemented. Region and availability restrictions still apply.

## Development dependencies and attribution

- Existing Node.js and Python 3.
- Microsoft .NET SDK 10 (ARM64 supported).
- Apps2Samsung v2.8.3 was used during development.
- TizenSdb sources and CLI: `tools/sdb-source`, `tools/sdb-cli` (MIT, PatrickSt1991).
- Metadata endpoint and field mapping follows [yle-dl](https://github.com/aajanki/yle-dl), Antti Ajanki and contributors (GPL-3.0-or-later).
- Artwork, programme metadata and video remain Yle's/licensors' content; they are fetched at runtime and not part of the software licence.

The abandoned companion-server experiment and reference tools are development material. `data/` contains local diagnostics and should not be published; it can include temporary signed media URLs. `dist/` is generated. This is a PoC built against undocumented service interfaces, so upstream changes can break it.

## Verified on the actual TV

Version 0.1.4 passed 16 on-device checks, recorded locally in an unpublished verification report: all three programmes play, Finnish subtitle cues render with line breaks, pause and seeking work, resume survives returning home, Pasila episode selection works, automatic next-episode playback works, temporary metadata files are deleted, and the home screen fits 1920×1080. Playback checks use the app's real remote-key handler through the TV developer inspector; a human remote/visual check is still useful. Samsung's initial reported stream resolution was 512×288 during short startup samples; sustained adaptive quality has not been established.

## Development inspector

`inspect.mjs`, `verify-tv.mjs` and `verify-browse-tv.mjs` expect the app's developer inspector forwarded to `127.0.0.1:9223`. They require a recent Node.js with built-in WebSocket support. `verify-tv.mjs` drives the actual installed app and writes local diagnostics under ignored `data/`.

## Catalogue data and tests

Category sources are discovered from the current Areena home page rather than storing expiring list tokens in the app. Search and category pages request 12 cards at a time, using the response count to determine whether a next page exists. Empty results and network failures have separate recovery messages. Native temporary files are cleaned after reading. The catalogue UI uses explicit overlay positions for the TV’s older Chromium engine.

Run the dependency-free data-layer tests with `node tests/catalogue.test.mjs`. The on-device browse verifier uses the actual remote-key handler and native Yle requests; run `node verify-browse-tv.mjs` after forwarding the developer inspector.

### Version 0.2.0 validation

Five data-adapter tests cover fresh category discovery, Finnish query encoding and paging, empty queries, network failures and series resolution. On the Samsung TV, acceptance checks cover live categories, result paging, keyboard input, Finnish characters and digits, search playback, returning to results and an empty-result recovery path. The existing playback, subtitles, seek/resume and automatic-next-episode regression checks also pass. Local reports remain excluded from Git.
