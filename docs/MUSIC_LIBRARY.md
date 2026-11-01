# Lyric persistent library and playback queue

Branch: feat/persistent-music-library-queue (stacked on the browser Spotify companion). This is **not yet merged or deployed**. All new assets retain the Lyric branding.

## Architecture

Lyric is a React/TypeScript/Vite application with Android Capacitor and Electron packaging. The original React player uses audio elements for authorized previews and user-provided local files; the Spotify browser companion and Android Spotify App Remote follow **external Spotify playback** and do not provide independent streams.

The new src/services/musicLibrary.ts provides a small, typed, centralized client-side library store using React's native useSyncExternalStore. It avoids additional dependencies and an unnecessary lockfile migration. Each subscriber receives a stable state snapshot, and state changes are not emitted for playback-clock interpolation. The underlying persistence is versioned browser localStorage. This is **not yet Zustand**, **not yet IndexedDB** and **not an authenticated cloud database**. Introducing Zustand later would be straightforward if multiple large UI surfaces need more granular selectors.

The store contains:
- Queue, chosen track, shuffle history and repeat off/all/one.
- Favorites and recently played tracks.
- Named user playlists with duplicate-track prevention and remove/rename.
- Version-1 backup and restore, with a merge-by-ID default.
- Sanitation and size/entry limits for imported JSON.

The new MusicLibraryDrawer component has tabs for queue, favorites, playlists, history and backups and is accessible from the **Library** control in both the original web player and Spotify browser companion. In the Spotify companion it is metadata-only: users can save external tracks to playlists, favorites or history without switching audio sources. It uses the same Lyric visual palette and does not replace other UI components.

## Data handling

Track metadata may contain public song ID, title, artist, album, duration, source, public HTTPS artwork and permitted Apple iTunes preview URLs. This store **never persists OAuth tokens, private keys, audio blobs or external streaming sources**.

- Spotify and external media records are metadata-only. They cannot become local audio sources merely by appearing in a queue or playlist.
- Local files can be replayed from the queue while their temporary object URL remains available **during the same app session**. Object URLs **do not survive reload**, so the library marks those files as needing re-import. The session URL is held only in memory, never in persistent storage or backup JSON; actual audio bytes are not backed up.
- Only HTTPS Apple iTunes preview URLs or built-in Lyric demo tracks are playable through the saved queue. Preview URLs can expire, and their availability is not guaranteed.
- The JSON backup includes **only library data**, not audio files, lyric text, Spotify credentials, or user accounts. No background cloud uploads.
- Imports require schema/version validation, duplicate removal, metadata sanitization and a 4MB maximum. The Import & merge UI does not discard existing local data.
- Playback progress is intentionally not persisted on every tick, preventing expensive storage writes and avoiding erroneous resume positions after external playback.

## Player interaction

The original App.tsx is connected to the library:
- The first local browser launch seeds the existing set of authorized demo previews once.
- Next/previous use the queue for Lyric-owned previews and respect repeat/shuffle; when repeat is off, reaching the end stops.
- Selecting a preview or local file updates queue metadata and recently played information.
- An external macOS Spotify/Apple Music player retains its existing remote command path and is not silently redirected to local queue audio.
- The player RAF updates are throttled to reduce React work and preserve local clock interpolation between updates.

The Web Media Session API supplies supported browsers with Lyric's actual playing metadata, headset play/pause, next/previous, seek and lock-screen progress. It explicitly does **not** claim Spotify's externally playing music. Unsupported browsers simply ignore these features.

## Limitations / next phases

- Browser Spotify companion now records current Spotify track metadata in Recent and exposes Favorite and Library controls. The Spotify connection remains read-only unless the user separately authorizes playback controls.
- AndroidApp.tsx has an existing independent *runtime* queue for local files. Consolidating its queue with the shared library needs careful physical-device testing so Spotify App Remote and Android MediaSession remain authoritative. This PR currently integrates the new library panel into the **original web player only**.
- Spotify playlists, recommendations and profile access require separate authorized scopes and Spotify developer access; this store does not fetch or scrape them.
- A persistent local-file library requires IndexedDB/File System Access API or a native Android content-URI/SQLite layer, with explicit file permissions and availability checks.
- Zustand/TanStack Query could be adopted after measuring state ownership and network cache requirements; they are not installed here because this scoped feature does not yet need new packages.
- Listen Together needs authenticated realtime infrastructure, room membership policies, per-user authorization, testing and an explicit deployment/credential decision; it is not simulated in this PR.
- Cloud sync needs explicit opt-in authorization and conflict handling. Currently the only backup path is a user-controlled JSON export/import.
- A package install in CI previously reported 30 dependency advisories, including one critical (production-vs-dev exposure not established). Treat dependency and CSP review as a **release blocker**, and use npm audit to investigate before deploying publicly. Do not blindly run npm audit fix --force.

## Verification

CI workflow .github/workflows/library-qa.yml:
- TypeScript + production Vite build.
- Tests for metadata-only restrictions, queue ordering, shuffle, repeat, favorites, playlists and backup merge.
- Media Session mock tests.
- Existing Spotify OAuth and LRCLIB regression tests.
- Playwright browser mobile-viewport interactions, persistence after reload and backup export.

These tests **mock Spotify and LRCLIB** and do not verify a real Spotify account, native Android playback or actual 60 FPS on a phone.

## Next acceptance milestones

1. Investigate dependency advisories and update the lockfile with compatible versions after review.
2. Verify original web player queue and Media Session on real Chromium, mobile and Firefox/WebKit.
3. Integrate native Android playlist/favorite metadata using the same shared store without altering Spotify Remote source behavior.
4. Add locally permitted file persistence with user-controlled native permissions.
5. Add authorized discovery and streaming integrations only after API licensing and quotas are validated.
6. Design and deploy a secured realtime backend for Listen Together only with explicit approval.
7. Merge the stacked PR chain in a deliberate order and verify GitHub Pages deployment on main.
