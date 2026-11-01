# Lyric — Music Player Foundation Upgrade (2026-11-01)

## Scope and source of truth

This work is implemented on `feat/library-queue-backup-foundation`, stacked on `feat/web-spotify-pkce-lyrics` (PR #7). It is NOT an unrelated replacement or a cloned APK. Android Capacitor + official Spotify App Remote, browser Spotify-following mode, desktop Electron, LRCLIB and the original visual/lighting themes remain in place. `main` has not yet received the stacked Android and browser changes. Do not treat this feature branch as a production release.

## Verified existing architecture

- React 19, TypeScript, Vite 6, Tailwind, Framer Motion; no React Native/Expo.
- Separate existing `App.tsx` desktop/local preview player, `AndroidApp.tsx` Capacitor interface, and `WebSpotifyCompanion.tsx` for browser Spotify.
- Existing browser Spotify Auth Code with PKCE, refresh token rotation and callback checks from PR #7. Native Android PKCE/App Remote is separate. Spotify tokens are not used by or exported from the new library.
- Playback clocks: `PlaybackClock` for desktop and `SyncClock` for Android/browser. Original `App.tsx` previously recreated `Audio()` on track-object changes and ran 60Hz+ whole-app React updates.
- Lyrics from LRCLIB, local imports, caching and manual alternatives. Word timing interpolated from ordinary LRC is NOT genuine word-level synchronization.

## Completed foundation (this branch)

- **Typed library model:** `src/services/libraryModel.ts` defines a strict v1 schema, sanitized catalog metadata, queue, shuffle/repeat, favorites, playlists, history and user-selected volume; functions are immutable and unit-tested.
- **Store:** `src/services/libraryStore.ts` provides stable snapshot subscriptions via React 19 `useSyncExternalStore`. This deliberately avoids a new dependency and lockfile churn while decoupling library updates from the playback clock. It is compatible with a later measured move to Zustand. Do not claim Zustand or TanStack Query is installed.
- **Library UI:** `src/components/LocalLibraryPanel.tsx` offers queue reorder/remove, shuffle/repeat cycling, local volume, favorites, playlists, history, and JSON backup export/import. Imported backups are validated and **merged**; they do not replace existing data.
- **Audio lifecycle:** `App.tsx` now creates one HTMLAudioElement per mount, disconnects it on teardown, changes its source without rebuilding its analyser, keeps actual mute/volume, handles error/ended events, and navigates the queue. Looping one track is respected only on automatic ended, not when the user presses Next.
- **Media Session:** compatible browsers receive local track metadata and play/pause/previous/next/seek handlers. This does not impersonate Spotify or grant access to protected audio.
- **Rendering:** the desktop app coalesces visual updates to about 30fps, avoids lyrics refetch on artwork changes, and uses one adaptive desktop bridge poller.
- **Spotify discovery:** optional read-only `user-read-private playlist-read-private` scopes in browser login; account profile and a paged playlist browser with links back to Spotify; playlist item browsing only if Spotify permits. Song favorites save metadata, never audio or private Spotify credentials.
- **Lyrics truthfulness:** original Lyric word animation only claims genuine word timing if source data contains real enhanced LRC timestamps. Other text renders line-synchronized or estimated timing.
- **Tests:** `tests/library-model.cjs`, `tests/library-ui.cjs`, `tests/spotify-catalog.cjs`, `tests/spotify-catalog-ui.cjs`, plus preexisting Spotify/LRCLIB/browser suites, run via `.github/workflows/library-qa.yml`.

## Player behavior and limitations

- The Lyric local queue plays *authorized iTunes preview* or user-selected local files with an actual audio URL; Spotify tracks are **external metadata only**. The Lyric queue does not alter Spotify's queue. Spotify remote controls remain in the separately authorized browser companion.
- HTML5 audio may not provide true gapless playback, crossfade or a selectable bitrate for external previews. Those features have not been claimed or emulated.
- A local file object URL cannot survive reload. Lyric saves its metadata but does not persist the file contents. Users must reselect it for playback. No copyrighted audio or Spotify streams are uploaded.
- Browser previews and device autoplay restrictions apply; errors are shown without pretending playback succeeded.
- Playlists and queue live in the browser's localStorage, not in an account-backed database. Local preferences sync via storage events between same-origin tabs. Playlist JSON is versioned and merges safely. It is not a Google Drive or cloud backup.
- Android local music library UI and background playback notifications are not implemented in this branch; existing native Spotify integration is preserved.
- Spotify Developer Mode may require Premium, approved users, scoped endpoints and account-level rate/quota limits. 429 errors distinguish rate limiting and quota. Playlist item endpoint may return 403 for playlists you do not own or collaborate on.
- For web auth, refresh tokens are currently optionally stored in browser localStorage (XSS-accessible). Use a secure backend / HttpOnly-cookie session for higher-trust deployments; no secrets are introduced by this change.

## Unfinished phases and dependency checklist

### Platform and state architecture
- [x] Audit actual framework, app sources and existing state management.
- [x] Add isolated typed queue, playlist and settings persistence without replacing working hooks.
- [ ] Adopt Zustand selectively only after an approved lockfile/dependency update and performance profiling; TanStack Query is not currently installed, existing lyrics service already deduplicates calls.
- [ ] Break up the 47k-character AndroidApp into independently tested UI, playback and lyrics modules without changing SDK session flow.

### Streaming / discovery
- [x] Preserve authorized Spotify metadata/playback following and opt-in playlist browse.
- [x] Queue/next/previous/shuffle/repeat for local/demo audio with an explicit source distinction.
- [ ] Persistent local file playback blobs in IndexedDB/SQLite with quota handling and user permission.
- [ ] Full playback quality, buffering, crossfade and gapless where the audio provider and native platform permit.
- [ ] Spotify catalog search and artist/album surfaces; test API access against Spotify's latest Development Mode limitations.
- [ ] Additional lyrics sources only where usage and redistribution rights are verified. Do not scrape Spotify, KuGou, JioSaavn or protected endpoints.
- [ ] Full verified Lyricsfile word-timestamp parser, translations and romanization where user-supplied or licensed.

### Listen Together — requires approved, authenticated infrastructure
- [ ] **Not active:** no room server or public unauthenticated WebSocket is deployed. Do not present mock rooms as functional group listening.
- [ ] Select isolated Supabase Auth project (do not reuse credentials or database from another product), configure authenticated HTTPS/WSS and abuse protections.
- [ ] DB tables: `rooms` (owner, code_hash, expiry), `room_members` (user_id, role, revoked), `room_queue` (room_id, position, metadata), `room_events` (sequence, monotonic timestamp, actor). Enforce RLS using membership on every SELECT/INSERT/UPDATE/DELETE, host-only control RPC, TTL and invite rate limits.
- [ ] Broadcast metadata / transport intents only. Participants must obtain any playback independently through authorized services; no retransmission or mixing of copyrighted Spotify audio.
- [ ] Join/leave, disconnect/reconnect, host transfer, sequence consistency and latency compensation require real multi-user end-to-end testing.

### Account, backup and observability
- [ ] Account sign-in (Supabase/Firebase) requires app-specific domain and consent, RLS, password reset and deletion. No account backend currently exists in Lyric.
- [ ] Google Drive backup needs separate OAuth consent, encrypted backend handling, data ownership and conflict behavior.
- [ ] Secure bug-report backend/monitoring needs approved endpoint and privacy policy; no webhook token in the bundle.
- [ ] PWA offline shell, Android native playback notification/widget/headset service, full accessibility audit, internationalization and optional ads with consent.

### Security and verification
- [x] Keep credentials and audio bytes out of versioned JSON backups; validate imports (2 MB max, strict schema/fields).
- [x] Limit Spotify metadata access to explicit OAuth scopes, and link to Spotify for attribution.
- [x] TypeScript production build, queue/backup unit tests and mocked Spotify UI tests in CI (check the latest run before release).
- [ ] Complete repository-wide secret scan and dependency vulnerability audit; do not claim clean without a full scan.
- [ ] Audit Electron `webSecurity:false` and migrate to secure custom file protocol/CSP without breaking packaged app.
- [ ] Live Spotify account validation, physical Android device QA and desktop Electron packaging test.
- [ ] Merge stacked PR chain in dependency order, register browser Spotify redirect and verify GitHub Pages production deploy.

## Testing and CI

Run `npm ci --ignore-scripts`, `npm run build`, `node tests/library-model.cjs`, `node tests/spotify-catalog.cjs` and `npm run dev`. GitHub Actions runs the library/model/unit tests and Playwright browser UI checks against **mock** Spotify/LRCLIB responses. Do not claim actual live Spotify authorization or production deploy from these results.

## Official sources

- https://developer.spotify.com/documentation/web-api/reference/get-current-users-profile
- https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists
- https://developer.spotify.com/documentation/web-api/reference/get-playlists-items
- https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates
- https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- https://lrclib.net/docs