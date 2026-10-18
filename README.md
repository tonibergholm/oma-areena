# Oma Areena — Samsung Tizen proof of concept

An unofficial, GPL-3.0-or-later TV client for Yle Areena. Built for and tested on a Samsung QE55QN85AATXXH running Tizen 6.0, firmware T-NKM2DEUC-2301.1. This project is not affiliated with Yle.

Version 0.3.0 adds full season selection, complete episode lists, Continue Watching, favourites and a new launcher icon. Browse live categories or search Areena with a Finnish on-screen keyboard. Playback uses native Samsung AVPlay with local resume, subtitles, previous/next episode controls and automatic next episode. Your library is saved on the TV; no Yle account or companion server is required.

## Use on the TV

Open **Oma Areena** in Apps. No computer or companion server is needed for normal use.

- Home: left/right selects a programme; up/down moves between rows. OK resumes a Continue Watching item or opens a programme’s seasons and episodes.
- Up from the first row reaches **Katso**, **Aloita alusta**, **Kaudet ja jaksot**, favourites and removal from Continue Watching. Up again reaches **Etusivu**, **Selaa**, **Hae** and **Omat**.
- In **Selaa**, choose a category, then navigate cards and page buttons with the arrows. Series open their season view; individual programmes play directly.
- In **Hae**, use the Finnish keyboard and **Hae**, or type using a physical keyboard.
- Seasons: left/right changes season; Down enters the episode list; OK plays. Up from the season tabs reaches the favourite button. Long seasons have episode page buttons.
- During playback: OK pauses, left/right seeks 10 seconds, Down toggles subtitles, Up opens previous/next episode and series controls. Back returns to the episode list or search results.
- Completed episodes show a watched badge and leave Continue Watching. Existing saved positions migrate automatically. Favourites and progress persist across app launches, on this TV only.

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

### Version 0.3.0 validation

Seven catalogue tests cover complete season pagination (including a synthetic 205-episode season) and episode transitions across season boundaries. Six library tests cover persistence, completion, favourites, removal, legacy migration and season preferences. Run `node tests/catalogue.test.mjs` and `node tests/library.test.mjs`.

On-device acceptance covers six Pasila seasons, all 12 episodes in a season, remote season changes and favourites, saved-position playback, previous/next controls, automatic completion and returning to details. The episode panel fits 1920×1080. `verify-tv.mjs` runs the library acceptance checks; `verify-browse-tv.mjs` checks categories, paging, search, Finnish/numeric input and the search → series → playback → results return path. Test viewing state should be backed up and restored when using a personal TV.

The new icon’s high-resolution source is `assets/oma-areena-icon.png`; the installed launcher icon is `app/icon.png`. Its built-in imagegen prompt is recorded in `assets/icon-prompt.txt`.

### Version 0.3.1: Samsung Home Continue Watching

Highlight **Oma Areena** in Samsung's Home launcher to see **Jatka katsomista**. It shows up to 20 recent unfinished episodes from this TV’s local library. Selecting a card opens the episode at its current saved position. Completed and removed entries are excluded; an empty library supplies no tiles.

The bundled background service publishes personal preview data on the TV. No server or account is used. Samsung limits preview publication to once per ten minutes, so the launcher may lag behind the in-app library. The app sends its latest history on library changes and when hidden; the service retains it locally for subsequent scheduled updates. If an existing Home shortcut does not pick up the new preview registration, remove the shortcut from Home and add it again (do not uninstall the app).

Implementation follows Samsung’s [Personal Preview guide](https://developer.samsung.com/smarttv/develop/guides/smart-hub-preview/implementing-personal-preview.html) and [deep-link format](https://developer.samsung.com/smarttv/develop/guides/smart-hub-preview/implementing-public-preview.html). Run `node tests/preview.test.mjs` for preview filtering, safe deep links, empty history, service persistence, update throttling and failure handling. `node testing/verify-preview-tv.mjs` checks the real TV API publication and Samsung app-control resume path; it changes playback progress, so back up personal viewing state first. On the test TV, the service accepted three history cards and a real app-control request resumed the selected episode at its saved 30.9-second position. Launcher artwork rendering still needs a visual check on the TV.

### Version 0.3.2: watched seasons

Fully watched seasons use a muted gray tab with **✓ Katsottu**. Episode artwork is also muted when watched, and the season view shows the watched/total count. A season is complete only when every currently available episode in its full list is watched; newly discovered episodes make it incomplete again.

To mark a season, select it, press **Up**, then **Right** to **Merkitse kausi katsotuksi**, and press **OK**. This covers every episode, including episodes beyond the current page, and removes those episodes from Continue Watching. **Peru kauden merkintä** undoes the bulk action and restores previous viewing positions, while keeping playback progress changed afterward. Naturally completed seasons can be marked unwatched. These changes persist locally across app restarts.

On the Samsung TV, remote bulk marking and undo passed for all 12 Pasila episodes; the watched tab computed gray, and the new action and pager stayed within the screen.

`node tests/library.test.mjs` covers natural completion, newly added episodes, a 50-episode bulk action, persistent undo and preserving later playback. `node testing/verify-season-watched-tv.mjs` checks remote focus, full-season marking, undo, muted tabs and TV layout. As with the other on-TV checks, back up personal viewing state before running.
