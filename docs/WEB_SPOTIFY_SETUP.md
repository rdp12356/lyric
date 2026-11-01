# Spotify Web / GitHub Pages setup for Lyric

This guide covers the **browser** companion added by the feat/web-spotify-pkce-lyrics branch. The Android App Remote flow is a separate implementation and continues using lyric://spotify-callback.

## Prerequisites

- A Spotify Developer app and its public Client ID (a 32-character hexadecimal string).
- The exact HTTPS root URL at which this fork is served. The current GitHub Pages deployment workflow deploys **main**, not development branches.
- A Spotify account allowed by the Developer app. Spotify Development Mode may require the developer/app owner to have Premium, restrict the user allowlist, and enforce per-account quotas.
- The official Spotify app playing audio on a playback device. Lyric does not stream music and does not require the Web Playback SDK.

## Configure redirect URI

1. Visit https://developer.spotify.com/dashboard and select your developer app.
2. In Settings, register the exact **browser callback root** displayed in Lyric's web Connect screen.
3. If GitHub Pages is configured to serve this fork as a project, the URL may look like https://rdp12356.github.io/lyric/ (the trailing slash matters). If you use a custom domain, use the custom HTTPS root instead.
4. Keep the existing Android redirect lyric://spotify-callback registered for the native APK. **Do not replace the Android URI with the web URI**.
5. For local browser testing, open http://127.0.0.1:5173/?mode=spotify and register http://127.0.0.1:5173/. Some Spotify dashboard configurations reject localhost hostnames; 127.0.0.1 is the documented loopback development option. Do not switch hostnames mid-OAuth because temporary PKCE state is tied to the origin.
6. No client secret is needed or allowed in the web bundle.

The Vite base is './'. The OAuth callback uses the real root index.html rather than a virtual /callback route, so Pages can serve it on a fresh navigation. Codes are removed from the address bar as soon as the callback is processed.

## Connect and follow

1. Open the web app and select **Follow Spotify**. Enter the public Client ID.
2. **Remember Spotify sign-in** is on by default. Uncheck it if you prefer the refresh token to be stored only in sessionStorage rather than persistent localStorage.
3. **Allow Spotify playback controls** is separate and off by default. Enable it only if you want optional pause/resume and tap-to-seek. Spotify authorization requests an additional scope when this box is checked.
4. Authorize via Spotify. Return to Lyric: the browser view automatically reads your current Spotify playback state and uses local clock interpolation between adaptive updates.
5. For missing lyrics choose **Refresh lyrics**, **Search versions**, or **Import LRC**. Only LRCLIB has been enabled as an online provider; no unauthorized lyrics scraping occurs.
6. Use +/- 100 ms to correct per-track lyric alignment. Scroll manually and use **Resume Sync** to restore automatic scrolling. The browser does not fabricate genuine word timing when only line LRC is available.

## Security tradeoffs

- The browser generates a cryptographically secure PKCE verifier/challenge and state. It has no Spotify client secret.
- Access tokens are kept in memory. Refresh tokens are stored in sessionStorage and, when Remember is checked, localStorage. Those storage areas are readable by JavaScript and vulnerable to XSS or malicious extensions.
- For higher security, use a secure serverless token/session backend: token exchange and refresh server-side, HttpOnly Secure SameSite cookie, CSRF checks, strict origins, rate limiting and secrets in environment configuration.
- Rotated refresh tokens replace older refresh tokens. Spotify refresh tokens issued after 2026 authorization expire about six months after initial authorization, regardless of repeated refreshes. When authorization is revoked or expired, the user must connect again.
- Disconnect deletes the locally saved session and stops playback requests. To revoke authorization globally, visit the Spotify account's connected-app access page.

## Spotify policy and provider limitations

- Browser mode uses Spotify Web API read-only user-read-playback-state, optionally user-modify-playback-state with explicit consent.
- It is NOT the Spotify Web Playback SDK and it does not create or route any audio stream.
- Spotify does not expose full lyrics through the public Web API. LRCLIB or a personal imported LRC file supplies lyrics.
- The Spotify Web API provides snapshot-based playback, not a public real-time playback WebSocket. Local interpolation can improve smoothness but cannot guarantee exact word timing.
- Spotify developer policies restrict uses of Spotify content in synchronization with visual media; review platform terms and rights before commercial or distributed use.
- Other sources (Lyrics.ovh, KuGou, Musixmatch, Paxsenix, JioSaavn, SimpMusic) are not enabled without verifying technical access, provider ToS and lyric redistribution licensing.

## Testing

Use:
- npm ci --ignore-scripts
- npm run build
- node tests/web-spotify-auth.cjs
- node tests/web-spotify-playback.cjs
- node tests/lrclib-refresh.cjs
- node tests/sync-audio.cjs
- node tests/desktop-bridge-security.cjs
- npm run dev -- --host 127.0.0.1

The Web Spotify companion QA workflow runs these checks and a Playwright browser test with **mocked Spotify and LRCLIB responses**. Mocked tests cannot prove live Spotify authorization, Premium entitlement, access allowlisting, lyric availability or user-device synchronization. Real-account testing is still required before deploying main.

## Dependency sequence

This branch is based on fix/refresh-lrclib-lyrics, which builds on the still-draft Android PR chain. Review/merge the dependency chain in order and verify the GitHub Pages workflow after changes land on main. Do not assume the upstream README's original GitHub Pages link is the URL of this fork.
