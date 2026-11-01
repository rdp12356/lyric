const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');

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
    window.spotifyCalls = [];
    window.spotifyConnectedMock = false;
    const methods = {
      Spotify: ['getStatus','connect','connectBrowser','reconnect','setAutoReconnect','getPlayback','control','disconnect','openApp','addListener','removeListener'],
      AndroidMedia: ['getCapabilities'],
      AudioInput: ['start','stop','getEnergy','setKeepAwake']
    };
    window.Capacitor = {
      PluginHeaders: Object.entries(methods).map(([name, entries]) => ({ name, methods: entries.map(method => ({ name: method, rtype: method === 'addListener' ? 'callback' : 'promise' })) })),
      nativeCallback: (plugin, method) => plugin === 'Spotify' && method === 'addListener' ? 'mock-spotify-listener' : 'mock-listener',
      nativePromise: async (plugin, method, options) => {
        if (plugin === 'AndroidMedia') return { musicPlayerSync: false };
        if (plugin === 'AudioInput') return {};
        if (plugin !== 'Spotify') return {};
        window.spotifyCalls.push(method);
        const pref = localStorage.getItem('spotify.fixture.auto') !== 'false';
        const status = () => ({
          connected: window.spotifyConnectedMock, autoReconnect: localStorage.getItem('spotify.fixture.auto') !== 'false',
          clientId: '0123456789abcdef0123456789abcdef', packageName: 'io.github.rdp12356.lyric', fingerprint: 'AA:BB',
          redirectUri: 'lyric://spotify-callback'
        });
        if (method === 'getStatus') return status();
        if (method === 'reconnect') {
          if (!pref) throw Error('No previous authorization');
          window.spotifyConnectedMock = true;
          return status();
        }
        if (method === 'setAutoReconnect') {
          localStorage.setItem('spotify.fixture.auto', String(!!options.enabled));
          return status();
        }
        if (method === 'getPlayback') return {
          permissionGranted: true, active: true, title: 'Spotify Song', artist: 'Native Artist',
          album: 'Album', duration: 180, position: 20, playing: true, canSeek: true, packageName: 'com.spotify.music'
        };
        if (method === 'disconnect') { window.spotifyConnectedMock = false; localStorage.setItem('spotify.fixture.auto', 'false'); return {}; }
        return {};
      }
    };
  });
  await page.route('https://lrclib.net/**', route => route.fulfill({ json: {
    id: 17, trackName: 'Spotify Song', artistName: 'Native Artist', duration: 180,
    syncedLyrics: '[00:00.00]A synchronized line\n[00:10.00]A second lyric line'
  } }));
  await page.goto('http://127.0.0.1:5173/?android');
  await page.getByText('Spotify Song', { exact: true }).waitFor({ timeout: 15000 });
  assert(await page.evaluate(() => window.spotifyCalls.includes('reconnect')), 'Previous connection should reconnect automatically');
  assert(!(await page.evaluate(() => window.spotifyCalls.includes('connectBrowser'))), 'Automatic reconnect must not launch OAuth browser');
  await page.reload();
  await page.getByText('Spotify Song', { exact: true }).waitFor({ timeout: 15000 });
  assert(await page.evaluate(() => window.spotifyCalls.includes('reconnect')), 'Spotify should reconnect on every fresh launch');
  await page.getByRole('button', { name: 'Sources and settings' }).click();
  await page.getByLabel('Reconnect Spotify automatically when reopening Lyric').uncheck();
  await page.waitForFunction(() => localStorage.getItem('spotify.fixture.auto') === 'false');
  await page.reload();
  await page.getByRole('heading', { name: 'Your music. Every word.' }).waitFor({ timeout: 10000 });
  assert(!(await page.evaluate(() => window.spotifyCalls.includes('reconnect'))), 'Opting out must prevent automatic connection');
  assert.deepEqual(errors, [], 'No unhandled JavaScript errors');
  console.log('PASS: remembered Spotify reconnect, playback restoration, no redundant OAuth, and opt-out across reloads.');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
