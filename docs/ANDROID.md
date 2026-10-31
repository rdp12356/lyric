# Lyric for Android

The Android app reuses Lyric's React lyric renderer, LRC parser, album colors, and ambient lighting inside Capacitor. The desktop app continues to use its original entry point. Append `?android` to the development URL to preview the phone UI in a browser.

## Install and use

Install the debug APK on Android 6.0 (API 23) or newer. Android may ask you to allow installation from your browser or file manager. Keep Android System WebView updated.

- **Music player:** Open Sources & settings, choose **Enable notification access**, and enable **Lyric music sync** in Android settings. Play a song in Spotify, Apple Music, or another app that publishes an Android media session, then return to Lyric. Player support depends on the metadata, timestamps, and control actions exposed by that app.
- **Local files:** Choose **Open audio file** using Android's file picker. No broad storage permission is requested. Filenames in `Artist - Title.mp3` format improve lyric matching; title and artist can also be edited in settings.
- **Lyrics:** LRCLIB supplies lyrics over the internet. Choose **Import LRC lyrics** for offline lyrics or a specific song version. Import again after selecting a different track. Word timing is estimated from line timestamps.
- **Controls:** Play/pause, previous/next, seek, single-word/caption styles, ambient lighting, and ±50ms lyric calibration. Local Previous restarts the file; local Next selects the next built-in preview.
- **Search:** Catalog results play short iTunes previews, not full songs. Preview timestamps do not describe their offset in the full recording, so full-song lyrics may not align. Use a local file or external music player for full-song synchronization.

Lyric is a foreground lyric display. It keeps the screen awake while visible. It does not draw over other apps, capture other apps' audio, or run its own background music service. For external players, lighting uses a procedural pulse rather than the player's audio waveform. Local files use the Web Audio analyser.

## Permissions and privacy

Internet access is used for lyrics, catalog previews, artwork, and fonts. Optional Android notification-listener access grants media-session discovery and controls; the service does not inspect or store notification content. No microphone, all-files, contacts, analytics, or account permission is requested. Song and artist information is sent to LRCLIB for lyric lookup; catalog searches go to Apple. Imported files stay on the device. Local selections and imported lyrics are session-only.

On some Android versions, sideloaded apps must first be allowed in **App info → menu → Allow restricted settings** before notification access can be enabled. This is optional; local playback still works without it.

## Build

Requirements: Node.js 22+, Java JDK 21, Android SDK platform 35/build tools 34, and Android Studio or Android command-line tools.

```sh
npm ci --ignore-scripts
npm run android:apk
```

`--ignore-scripts` avoids the upstream liquid-glass package's broken install hook; the mobile app uses the existing CSS glass treatment. It also skips Electron's unrelated desktop binary download. For desktop Electron development, install its binary separately.

Output: `android/app/build/outputs/apk/debug/app-debug.apk`. The debug APK is signed with a development key and is intended for testing. For distribution, configure your own release signing in Android Studio; no release credentials are included.

```sh
npm run android:open
# or, after npm run android:sync:
cd android
./gradlew assembleDebug lintDebug
```

The **Android APK** GitHub workflow builds, lints, runs the UI smoke test, and uploads an installable debug APK artifact. Download it from the workflow run's Artifacts section and unzip it.

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
