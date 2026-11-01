const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let spotifyName = 'Old Song';
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem('lyric.web.spotify.remembered', JSON.stringify({
        clientId: '62946f0e6551422aa8d3a5627245ab54',
        refreshToken: 'test-refresh', expiresAt: Date.now() - 10000, remember: true
      }));
      localStorage.setItem('lyric.web.spotify.prefer-mode', 'true');
    });
    await page.route('https://accounts.spotify.com/api/token', route =>
      route.fulfill({ json: { access_token: 'test-access', refresh_token: 'test-new', expires_in: 3600 } }));
    await page.route('https://api.spotify.com/v1/me/player', route =>
      route.fulfill({ json: {
        currently_playing_type: 'track', is_playing: true, progress_ms: 24000,
        device: { name: 'Mock Player' },
        item: {
          type: 'track', id: spotifyName === 'Old Song' ? 'a1' : 'b2',
          uri: 'spotify:track:' + (spotifyName === 'Old Song' ? 'a1' : 'b2'),
          name: spotifyName, artists: [{ name: 'Test Artist' }],
          duration_ms: 180000, album: { name: 'Album', images: [] }
        }
      }}));
    await page.route('https://lrclib.net/**', async route => {
      const url = new URL(route.request().url());
      let query = url.searchParams.get('track_name') || url.searchParams.get('q') || '';
      const old = query.includes('Old Song');
      const record = {
        id: old ? 10 : 20, trackName: old ? 'Old Song' : 'New Song',
        artistName: 'Test Artist', albumName: 'Album', duration: 180,
        syncedLyrics: old ? '[00:10.00]Old lyrics must never reappear'
          : '[00:10.00]New lyrics belong to this song'
      };
      if (old) await new Promise(resolve => setTimeout(resolve, 3800));
      if (route.request().isNavigationRequest()) return;
      try {
        await route.fulfill({
          json: url.pathname.endsWith('/search') ? [record] : record
        });
      } catch { /* Aborted obsolete request is expected. */ }
    });
    await page.goto('http://127.0.0.1:5173/?mode=spotify');
    await page.getByText('Old Song', {exact: true}).waitFor();
    spotifyName = 'New Song';
    await page.getByText('New Song', {exact: true}).waitFor({timeout: 12000});
    await page.getByText('New lyrics belong to this song').waitFor({timeout: 12000});
    await page.waitForTimeout(1600);
    assert.equal(await page.getByText('Old lyrics must never reappear').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: new Spotify tracks invalidate slow, obsolete LRCLIB requests.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
