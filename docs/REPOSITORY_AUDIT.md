# Lyric repository audit and prioritized plan

Audited existing branch: fix/refresh-lrclib-lyrics (stacked Android PRs #2–#6)
New implementation branch: feat/web-spotify-pkce-lyrics
Audit date: 2026-11-01

## Actual architecture

- React 19, TypeScript, Vite 6, Tailwind 4, Framer Motion; no React Router. index.html imports src/main.tsx.
- React hooks and refs, plus SyncClock and PlaybackClock. No Redux, Zustand, React Context global store, TanStack Query, Riverpod, Provider or BLoC.
- Web App.tsx: originally demo/local audio and optional desktop bridge. It did not support browser Spotify login.
- Android AndroidApp.tsx + SpotifyPlugin.java: Capacitor and official Spotify App Remote, device-specific PKCE deep-link lyric://spotify-callback, remembered SDK reconnection.
- Desktop server/index.js: macOS AppleScript or Windows media-key bridge; not OAuth and not intended as a public server.
- Lyrics services: LRCLIB, LRC parser, localStorage lyrics cache, optional user-imported LRC. Imported LRC and manual source selection already exist in Android. Enhanced word synchronization is NOT verified when timestamps have been interpolated.
- GitHub Pages: deploy-pages.yml deploys only main; Vite base './'; no SPA router. Spotify callback must target the exact served root, including path /lyric/ or any custom domain; the Spotify developer must register it explicitly.
- Tests: sync and Android Playwright mocks + Gradle compile/lint; no prior browser PKCE tests.

## Prioritized checklist

### P0: Authorization/security
- [x] Preserve Android SDK and original React demo UI; add optional browser companion without replacing either.
- [x] Browser PKCE with secure S256 verifier, state, callback freshness and URL cleanup.
- [x] Persistent refresh-token option, serialized refresh, rotated refresh token handling, invalid_grant clearing, disconnect.
- [x] Avoid SPA-only callback routes; use GitHub Pages root index.html.
- [x] Add strict localhost origin controls and numeric seek validation to desktop bridge.
- [ ] Full dependency security review and CSP before public deployment.

### P1: Spotify playback
- [x] Typed Web API playback snapshots and track metadata.
- [x] Adaptive polling, background-tab pause, AbortController cancellation, 401 retry, rate-limit cooldown.
- [x] Smooth local clock interpolation using existing SyncClock.
- [x] Handle absence of device, advertisements, non-track content and unsupported control actions.
- [ ] Verify live Spotify Web API availability with owner's Developer Dashboard and user allowlist.
- [ ] Test actual latency, drift and background behavior on desktop and Android hardware.

### P1: Lyrics engine
- [x] Modular typed provider interface and LRCLIB implementation.
- [x] Candidate ranking with artist/title, album, duration and timestamp availability.
- [x] Manual source search and selection, attribution, locally imported LRC, offline cache and refresh.
- [x] Guard asynchronous responses against stale track identities in React.
- [ ] Propagate AbortSignal into LRCLIB network requests; currently stale responses are ignored.
- [ ] Add alternative providers ONLY after reviewing their permissions and licenses. Lyrics.ovh is plain text only and requires rights review; KuGou, Musixmatch, JioSaavn, SimpMusic and unofficial Spotify extraction are not enabled.
- [ ] Implement a spec-compliant Lyricsfile word-timing parser before claiming real word timestamps.

### P1: Lyrics UX
- [x] Smoothly scrolling line lyrics with active highlighting and reduced-motion support.
- [x] Pause autoscroll on manual interaction; Resume Sync action.
- [x] Per-song signed offset and persistent font size.
- [x] Clearly distinguish plain estimated lines from genuine line-synced LRC.
- [x] Preserve original source/demo functionality.

### P2: Additional features
- [ ] Optional theme switch, translations only when authorized, standalone PWA and PiP.
- [ ] Dedicated LRC edit and export tools.
- [ ] Consider Zustand only if observed component coupling warrants a new dependency; not installed just for fashion.

### P3: QA and deployment
- [x] CI tests for OAuth PKCE, callback replay/state, single-flight refresh, token rotation, playback/lyrics UI.
- [ ] Spotify Developer Dashboard: register browser callback root URI (not Android deep-link).
- [ ] Validate GitHub Pages production after the PR chain is reviewed and merged.
- [ ] Perform live-account and physical-phone verification, not just mocked tests.
- [ ] Verify stable Android APK signing for in-place upgrades.

## Security and legal caveats

Browser OAuth has no client secret. Access tokens remain only in memory. Refresh tokens exist in sessionStorage and optionally localStorage to support remembered sign-in. They can be accessed by malicious JavaScript or extensions. This is NOT equal to an HttpOnly cookie/server-backed session. For high-assurance deployments, use a minimal serverless token-session handler with HttpOnly Secure SameSite cookies, strict redirect allowlist, CSRF controls and rate limits, with secrets in environment variables.

Spotify refresh tokens now expire six months after authorization. Refreshing the access token does not extend refresh-token lifetime; invalid_grant requires reauthorization. Spotify development mode may require Premium for the app owner, test-account allowlisting and limited account quotas.

LRCLIB is free and supports browser CORS plus user-identification and Retry-After rules. Availability, provider terms, licensing and cache reuse must be respected. Spotify does NOT offer public lyric text. Its own API warns against synchronizing sound recordings with visual media: review applicable Spotify terms before commercial or broader distribution. No undocumented Spotify lyrics extraction is implemented.

The upstream README currently links to the original author's GitHub Pages and releases. Do not assume this fork is deployed without checking GitHub Pages settings and workflow results. No production changes were made by the implementation branch.

## Official documentation
- Spotify PKCE: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- Spotify refresh: https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
- Spotify token expiry: https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration
- Spotify quota modes: https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- LRCLIB: https://lrclib.net/docs
