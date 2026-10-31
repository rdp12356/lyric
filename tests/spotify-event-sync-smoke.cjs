const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');

const watchdog = setTimeout(() => { console.error('FAIL: Spotify event UI test timed out'); process.exit(1); }, 45000);
watchdog.unref();

(async () => {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    headless: true, args: ['--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.androidBridge = {};
    window.spotifyEvents = {};
    window.blockPlaybackPoll = false;
    window.spotifyState = {
      permissionGranted: true, active: true, title: 'First Test Song',
      artist: 'Test Artist', album: 'Test Album', position: 12, duration: 150,
      playing: true, packageName: 'com.spotify.music', canSeek: true
    };
    const methods = {
      Spotify: ['getStatus','connectBrowser','reconnect','setAutoReconnect','getPlayback','control','disconnect','openApp','addListener','removeListener'],
      AndroidMedia: ['getCapabilities'],
      AudioInput: ['start','stop','getEnergy','setKeepAwake']
    };
    window.Capacitor = {
      PluginHeaders: Object.entries(methods).map(([name, list]) => ({
        name, methods: list.map(method => ({ name: method, rtype: method === 'addListener' || method === 'removeListener' ? 'callback' : 'promise' }))
      })),
      nativeCallback: (plugin, method, options, cb) => {
        if (plugin === 'Spotify' && method === 'addListener') {
          window.spotifyEvents[options.eventName] = cb;
          return 'callback-spotify-state';
        }
        if (plugin === 'Spotify' && method === 'removeListener') {
          delete window.spotifyEvents[options.eventName];
          return 'removed';
        }
        return 'mock-callback';
      },
      nativePromise: async (plugin, method) => {
        if (plugin === 'AndroidMedia') return { musicPlayerSync: false };
        if (plugin === 'AudioInput') return {};
        if (plugin !== 'Spotify') return {};
        if (method === 'getStatus') return {
          connected: true, autoReconnect: true,
          clientId: '0123456789abcdef0123456789abcdef',
          packageName: 'io.github.rdp12356.lyric'
        };
        if (method === 'getPlayback') {
          if (window.blockPlaybackPoll) return new Promise(() => {});
          return { ...window.spotifyState };
        }
        return {};
      }
    };
  });
  await page.route('https://lrclib.net/**', route => {
    const url = new URL(route.request().url());
    const title = url.searchParams.get('track_name') || 'Second Test Song';
    const artist = url.searchParams.get('artist_name') || 'Test Artist';
    const lyrics = {
      id: 2, trackName: title, artistName: artist, albumName: 'Test Album',
      duration: 150, instrumental: false,
      syncedLyrics: '[00:00.00]An original test lyric\n[00:20.00]Another short test line'
    };
    return route.fulfill({ json: url.pathname.endsWith('search') ? [lyrics] : lyrics });
  });
  await page.goto('http://127.0.0.1:5173/?android');
  await page.getByText('First Test Song', { exact: true }).waitFor({ timeout: 15000 });
  await page.waitForFunction(() => typeof window.spotifyEvents.playerState === 'function', { timeout: 10000 });
  await page.evaluate(() => {
    window.blockPlaybackPoll = true;
    window.spotifyState = {
      ...window.spotifyState, title: 'Second Test Song', position: 23
    };
    window.spotifyEvents.playerState({ ...window.spotifyState });
  });
  await page.getByText('Second Test Song', { exact: true }).waitFor({ timeout: 2000 });
  await page.evaluate(() => {
    window.spotifyState = { ...window.spotifyState, playing: false, position: 26 };
    window.spotifyEvents.playerState({ ...window.spotifyState });
  });
  await page.getByRole('button', { name: 'Play', exact: true }).waitFor({ timeout: 2000 });
  await page.getByRole('button', { name: 'Sources and settings' }).click();
  assert.equal(await page.getByLabel('Graphics quality').inputValue(), 'smooth');
  await page.getByLabel('Graphics quality').selectOption('cinematic');
  await page.reload();
  await page.getByLabel('Graphics quality').count();
  await page.getByRole('button', { name: 'Sources and settings' }).click();
  assert.equal(await page.getByLabel('Graphics quality').inputValue(), 'cinematic');
  assert.deepEqual(errors, [], 'No unhandled page exceptions in Spotify event-driven UI');
  console.log('PASS: immediate native Spotify song/pause events without polling, and saved graphics setting.');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
