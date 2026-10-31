# Spotify Android callback repair

**Symptom:** After authorizing Spotify in Chrome, the address `http://127.0.0.1:43821/callback` gives ERR_CONNECTION_REFUSED.

The browser OAuth flow now uses the registered Android deep link **`lyric://spotify-callback`** rather than a short-lived loopback HTTP listener. Android routes Spotify's callback directly to Lyric, even if the original activity is recreated. Lyric validates the one-time OAuth state, exchanges the code using PKCE over HTTPS, and connects to the official Spotify App Remote SDK. No client secret is used, and access tokens are neither saved nor exposed to JavaScript.

## Important: Spotify Dashboard must be updated

1. Open https://developer.spotify.com/dashboard and select the application matching Lyric's displayed public Client ID.
2. Add the **exact redirect URI `lyric://spotify-callback`** (all lowercase; no trailing slash) and save. The app cannot finish authorization without this change. The old loopback callback is no longer used by this build.
3. Register Android package `io.github.rdp12356.lyric` and the SHA-1 fingerprint of the APK you install, found in `spotify-android-setup.txt`.
4. Install the new APK. Open Spotify, sign in, and play a track. In Lyric, tap **Sign in with Spotify**, authorize in Chrome, and choose **Open Lyric** when prompted.
5. Only successful Spotify App Remote connection marks Lyric **Connected**. Browser authorization alone does not guarantee playback availability.

The temporary OAuth state and PKCE verifier are kept in private app preferences for at most three minutes for activity recreation; they are cleared on use or cancellation. If Android kills the original JavaScript context, try a fresh connection from the app. Never share full callback URLs containing an authorization code.

**Not yet device-verified:** this patch still requires Android CI compilation, Dashboard configuration, and a physical-phone test to confirm Spotify App Remote binding.

---
# Lyric for Android 1.1.0

The default **Local edition** plays your files and catalog previews, caches lyrics for offline use, imports LRC files, and adds optional official Spotify App Remote connectivity. It has **no notification-listener service**. The separate **Connected edition** also supports generic Android media sessions through optional notification access, which may be blocked for sideloaded apps. Keep Play Protect enabled.

## What's new

- Measured audio spectrum and adaptive beat envelopes for edge lighting. A silent audio section dims the light; it does not fall back to a fixed simulated tempo.
- Five light patterns, album/preset colors, sensitivity, brightness, and edge-width controls. Settings survive app restarts.
- Official Spotify Android App Remote SDK, explicit connection, active playback metadata, artwork, and permitted controls.
- Smooth player clock with playback-rate handling, seek detection, and transport-latency compensation. It rebases correctly between samples, avoiding cumulative timing drift.
- Per-song ±50ms adjustments and a tap-to-calibrate lyric sheet. Offsets up to ±15 seconds are saved for up to 50 songs. Imported enhanced LRC can supply word timestamps; ordinary line-level lyrics still use estimated word timings.
- Multi-file queue, working next/previous, repeat queue, focus mode, sleep timer, and offline cache of the 25 most recently saved lyric records.
- Manual lyric mode for another player when automatic connection is unavailable. It is a manual clock, not automatic song recognition or Spotify control.

## Install and use

Download `Lyric-Android-Local-debug` from the successful Android APK workflow. Unzip it and install `app-local-debug.apk` on Android 6.0/API 23 or newer. The ZIP also includes `spotify-android-setup.txt` with registration details for that exact APK. Keep Android System WebView updated.

These are development-signed test APKs. If Android rejects an update because the signing key differs, uninstall the previous test version before installing; this removes its app-local preferences and cached lyrics. Original audio files on your phone remain separate. Production distribution and a stable release signing key are not configured.

### Local audio and queue

Use **Open audio file** or **Queue → Add songs** to select one or more files. No broad storage permission is requested. `Artist - Title.mp3` filenames improve lyric matching; title and artist can be edited in settings. Previous restarts the current file after three seconds, otherwise moves to the preceding item. Next advances within the queue; it never substitutes an unrelated demo. Repeat can wrap the queue. File selections last only while the app is open.

Catalog search supplies short previews, not full songs. Preview offsets within the full recording are unknown, so their full-song lyrics can misalign. Use a local recording or a connected player for full-song timing.

### Spotify without Web API

This version uses the **official Spotify Android App Remote SDK 0.8.0**, not Web API or Web Playback SDK. It talks to the installed Spotify app and requests only `app-remote-control`. No client secret, Web API token, notification access, screen capture, or arbitrary-track playback is used.

1. Install the official Spotify app and sign in.
2. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). Select **Android**. Web API and Web Playback SDK are not required for this route.
3. Add the exact redirect URI `lyric://spotify-callback` and save it in the Spotify Developer Dashboard.
4. In the developer app's Android configuration, register package `io.github.rdp12356.lyric` and the **SHA-1 signing fingerprint for the APK you install**. Find both in `spotify-android-setup.txt` or Lyric's Sources & settings screen.
5. Your public Client ID `62946f0e6551422aa8d3a5627245ab54` is prefilled in Lyric's **Sources & settings → Spotify app**. Tap **Connect Spotify** and authorize in Spotify. You can replace the Client ID to use a different registration; a client secret is not needed.
6. Start your music in Spotify and return to Lyric. The native SDK reports the playing song, position, speed, artwork, and control restrictions.

Spotify's SDK documentation describes reading PlayerState without Web API calls and restricts arbitrary-track URI playback to accounts with on-demand capability. Lyric does not invoke arbitrary-track playback. Whether a particular Free account/developer registration can connect, and which seek/skip operations it allows, must still be tested on the actual device. The app respects Spotify's reported restrictions; it does not bypass subscription requirements or ads. Web API development-mode Premium requirements and Web Playback SDK Premium requirements remain unchanged.

The SDK disconnects while Lyric is stopped and reconnects when returning after a successful connection. An app restart requires choosing Connect/Follow Spotify again. **Disconnect** closes the local SDK connection; Spotify account permissions can be revoked separately in Spotify account settings.

Debug APK signing fingerprints can change between CI runs unless the repository owner configures `ANDROID_DEBUG_KEYSTORE_BASE64` as an Actions secret containing a standard Android development keystore. The current GitHub connection cannot write repository secrets (HTTP 403), so each build exports its public fingerprint rather than claiming stable signing. Never commit a production signing key or Client Secret.

References: [Android SDK setup](https://developer.spotify.com/documentation/android/tutorials/getting-started), [App Remote SDK](https://github.com/spotify/android-sdk/blob/master/app-remote-lib/README.md), [SDK license](../third_party/spotify/LICENSE).

### Reactive lighting

**Local audio:** the Web Audio analyser reads the file's actual spectrum. Bass is 30–180 Hz, mids 180–2500 Hz, and highs 2500–10000 Hz, with bins derived from the actual sample rate. Attack/release smoothing and onset detection drive the edges. Silence remains silence.

**Spotify / other external players:** player metadata alone does not expose Spotify's audio waveform. Use the optional **microphone** for music audible through speakers. The microphone does **not** hear private audio in headphones and is not system-audio capture. Native analysis computes frequency-band and RMS levels in memory; it stores no audio, uploads none, and stops on leaving the foreground or turning the microphone off. Permission is requested only when the user taps the microphone control. Without an audio input, external playback gets an idle glow, not a claimed beat-synced effect.

All lighting is inside Lyric. It does not overlay other apps or modify Android's system/status-bar LEDs. The app keeps the display awake during playback, active microphone input, or focus mode; it releases that request when those stop.

### Lyrics, calibration, and manual mode

LRCLIB is used for lyric lookup. Matches include album and duration in their cache keys and prefer matching title/artist versions. Recent fetched and imported lyrics are cached on the device. **Import LRC lyrics** supplies offline lyrics or a specific version; the cache is capped at 25 records. Cache storage failure does not stop playback.

Tap **Calibrate this song**, then tap a line when you hear its first word. This stores an offset for the song. It cannot make estimated word timings exact, identify a different recording automatically, or correct a mismatched recording with irregular timing.

If automatic connectivity is unavailable, choose **Manual lyrics for another player**. Find the song, match the playhead to the external player, and start the manual lyric clock. This does not start/control Spotify and can drift if the external player buffers, pauses, or skips. Recalibrate as needed.

The foreground-only sleep timer stops local playback or requests a pause from the connected player, stops the microphone, exits focus mode, releases the keep-screen-awake request, and clears itself. Keep Lyric open for the timer; Android may suspend timers or disconnect the SDK while the app is in the background. External pauses are subject to player availability. Focus mode hides the player controls; Show player and Android Back restore them.

## Connected edition

Optional generic-player support remains in `app-connected-debug.apk`. Choose a preferred player (Spotify by default or Automatic), grant notification access if Android allows it, play music in that player, and select **Listen to music player**. Metadata/control support depends on that player's published media session. The service does not inspect or store notification content. If Android blocks this edition, use Local; do not disable Play Protect.

## Permissions and data

Internet is used for lyrics, catalog previews, artwork, and Spotify authorization through the Spotify app. Optional microphone access is for foreground acoustic analysis only. Local has no notification listener, accessibility service, screen recorder, overlay permission, account password, broad storage permission, or analytics code. Connected additionally declares the optional notification-listener service.

Song/artist lookup is sent to LRCLIB; catalog searches go to Apple. Audio files and microphone samples stay on the device. The Spotify SDK handles its own authorization; Lyric stores only the public Client ID, settings, and cached lyrics, not Spotify account passwords or Web API tokens. The SDK is distributed with its Apache 2.0 license in the APK and source repository.

## Build and verify

Requirements: Node.js 22+, Java JDK 21, Android SDK platform 35/build tools 34, and Android Studio or Android command-line tools.

```sh
npm ci --ignore-scripts
npm run android:apk
```

Default output: `android/app/build/outputs/apk/local/debug/app-local-debug.apk`. `npm run android:open` opens Android Studio. After syncing, build/lint both editions:

```sh
npm run android:sync
cd android
./gradlew assembleLocalDebug lintLocalDebug assembleConnectedDebug lintConnectedDebug
```

`--ignore-scripts` skips the upstream liquid-glass dependency's broken install hook and the unrelated Electron binary download. Mobile uses CSS glass. To develop the desktop Electron app, install its binary separately.

```sh
npx playwright install chromium
npm run dev
# in another terminal:
npm run test:android-ui
ANDROID_HOME=/path/to/android-sdk node scripts/verify-local-apk.cjs
ANDROID_HOME=/path/to/android-sdk node scripts/spotify-setup.cjs
```

Tests cover real WAV playback and FFT response to bass versus silence, clock drift/jitter, pause/seek/rate changes, queue controls, focus mode, style switching, saved calibration/lighting, offline LRC restoration, native bridge/Spotify UI mocks, microphone start/stop, and phone/landscape/tablet layouts. The Local APK verification checks its manifest and DEX for notification-listener declarations/implementations; unused media compatibility classes in AndroidX are not claimed to be removed.

The current session has no attached physical Android phone. Spotify SDK authorization on a real Free account, microphone frequency response on hardware, OEM notification restrictions, and Play Protect acceptance need device verification. APK compilation, lint, mocks, and browser tests do not prove those device behaviors.
