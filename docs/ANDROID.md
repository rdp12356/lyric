# Lyric for Android

The Android app reuses Lyric's React lyric renderer, LRC parser, album colors, and ambient lighting inside Capacitor. The desktop app continues to use its original entry point. Append `?android` to the development URL to preview the phone UI in a browser.

## Editions and Play Protect

The default **Local edition** has no notification-listener service or app code for accessing other players’ media sessions. It plays local files and catalog previews, fetches lyrics, imports LRC files, and displays ambient lighting. It does **not** automatically follow Spotify or other apps.

The optional **Connected edition** includes the original notification-based media-session integration. Sideloaded apps requesting this access may be blocked by Google Play Protect. A protection warning alone does not confirm the exact classification reason. Use Local if notification access is not needed; do not disable Play Protect. Removing this access does not guarantee Google will approve a sideloaded APK. Distribution through a Play testing track and provider review may be needed if a build remains blocked.

Both editions use the same package ID and version 1.0.1 (versionCode 2). Switching editions requires a compatible signing key or uninstalling the previously installed test build. Neither edition has been independently scanned or approved by Google.

## Install and use

Install the debug APK on Android 6.0 (API 23) or newer. Android may ask you to allow installation from your browser or file manager. Keep Android System WebView updated.

- **Music player (Connected edition only):** Open Sources & settings, choose **Enable notification access**, and enable **Lyric music sync** in Android settings. Play a song in Spotify, Apple Music, or another app that publishes an Android media session, then return to Lyric. Player support depends on the metadata, timestamps, and control actions exposed by that app.
- **Local files:** Choose **Open audio file** using Android's file picker. No broad storage permission is requested. Filenames in `Artist - Title.mp3` format improve lyric matching; title and artist can also be edited in settings.
- **Lyrics:** LRCLIB supplies lyrics over the internet. Choose **Import LRC lyrics** for offline lyrics or a specific song version. Import again after selecting a different track. Word timing is estimated from line timestamps.
- **Controls:** Play/pause, previous/next, seek, single-word/caption styles, ambient lighting, and ±50ms lyric calibration. Local Previous restarts the file; local Next selects the next built-in preview.
- **Search:** Catalog results play short iTunes previews, not full songs. Preview timestamps do not describe their offset in the full recording, so full-song lyrics may not align. Use a local file or external music player for full-song synchronization.

Lyric is a foreground lyric display. It keeps the screen awake while visible. It does not draw over other apps, capture other apps' audio, or run its own background music service. For external players, lighting uses a procedural pulse rather than the player's audio waveform. Local files use the Web Audio analyser.

## Permissions and privacy

Internet access is used for lyrics, catalog previews, artwork, and fonts. In the Connected edition only, optional Android notification-listener access grants media-session discovery and controls; the service does not inspect or store notification content. No microphone, all-files, contacts, analytics, or account permission is requested. Song and artist information is sent to LRCLIB for lyric lookup; catalog searches go to Apple. Imported files stay on the device. Local selections and imported lyrics are session-only.

If Android does not allow notification access for the Connected edition, use the Local edition. Do not disable Play Protect to install Lyric.

## Build

Requirements: Node.js 22+, Java JDK 21, Android SDK platform 35/build tools 34, and Android Studio or Android command-line tools.

```sh
npm ci --ignore-scripts
npm run android:apk
```

`--ignore-scripts` avoids the upstream liquid-glass package's broken install hook; the mobile app uses the existing CSS glass treatment. It also skips Electron's unrelated desktop binary download. For desktop Electron development, install its binary separately.

Default output: `android/app/build/outputs/apk/local/debug/app-local-debug.apk`. The Connected build is available with `./gradlew assembleConnectedDebug` and outputs `android/app/build/outputs/apk/connected/debug/app-connected-debug.apk`. Each debug APK is signed with a development key and is intended for testing. For distribution, configure your own release signing in Android Studio; no release credentials are included.

```sh
npm run android:open
# or, after npm run android:sync:
cd android
./gradlew assembleLocalDebug lintLocalDebug
```

The **Android APK** GitHub workflow builds, lints, runs the UI smoke test, and uploads separate `Lyric-Android-Local-debug` and `Lyric-Android-Connected-debug` artifacts. Choose Local for the build without notification access. Download it from the workflow run's Artifacts section and unzip it.

## Verification

```sh
npx playwright install chromium
npm run dev
# in another terminal:
npm run test:android-ui
```

The smoke test generates an actual WAV file and verifies playback, pause, seek, style switching, calibration, LRC import, and narrow/landscape/tablet layouts. It mocks lyric API responses to make the check deterministic. A second smoke test uses a mocked Capacitor transport to check permission UI, media-session updates, and pause/seek commands. Native session discovery, OEM notification settings, audio focus, and physical-device behavior require Android device testing.

## Visual adaptation

The desktop reference is `assets/preview.png`. The Android layout preserves the dark canvas, album-derived rim light, large centered lyrics, and smoked-glass player. Controls are rearranged into a touch-friendly bottom player; the welcome and source screens are Android additions. Chromium/Playwright is used for browser verification because no browser-control tool is available in this session. Phone widths of 320px and 390px, landscape 844×390, and tablet 768×1024 are covered by the smoke test. Copy, typography, rim colors, player spacing, and control sizes were inspected in rendered screenshots; the desktop layout is intentionally adapted rather than reproduced at desktop dimensions.

After building, `node scripts/verify-local-apk.cjs` checks the actual Local APK manifest and DEX contents for notification-listener declarations and implementations. AndroidX may include unused media compatibility classes; the check does not claim to remove all media-related library code. Set `ANDROID_HOME` to your SDK folder before running it.
