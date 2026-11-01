const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    let spotifyTitle = 'Spotify Test Song';
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('lyric.web.spotify.remembered', JSON.stringify({
        clientId: '62946f0e6551422aa8d3a5627245ab54',
        refreshToken: 'test-refresh', expiresAt: Date.now() - 10000, remember: true
      }));
      localStorage.setItem('lyric.web.spotify.prefer-mode', 'true');
    });
    await page.route('https://accounts.spotify.com/api/token', route => {
      return route.fulfill({ json: { access_token: 'mock-access', refresh_token: 'mock-rotated', expires_in: 3600 } });
    });
    await page.route('https://api.spotify.com/v1/me/player', route => {
      return route.fulfill({ json: {
        currently_playing_type: 'track', is_playing: true, progress_ms: 12000,
        item: {
          type: 'track', id: spotifyTitle === 'Spotify Test Song' ? 'one' : 'two',
          uri: 'spotify:track:' + (spotifyTitle === 'Spotify Test Song' ? 'one' : 'two'),
          name: spotifyTitle, artists: [{ name: 'Test Artist' }],
          duration_ms: 180000, album: { name: 'Test Album', images: [] }
        },
        device: { name: 'Mock Spotify' }
      }});
    });
    await page.route('https://lrclib.net/**', route => {
      const url = new URL(route.request().url());
      const requested = url.searchParams.get('track_name') || spotifyTitle;
      const record = {
        id: requested === 'Spotify Test Song' ? 17 : 19, trackName: requested,
        artistName: 'Test Artist', albumName: 'Test Album', duration: 180,
        instrumental: false, syncedLyrics: '[00:01.00]First live lyric line\n[00:14.00]Second line',
        plainLyrics: 'First live lyric line\nSecond line'
      };
      return route.fulfill({ json: url.pathname.endsWith('/search') ? [record] : record });
    });
    await page.goto('http://127.0.0.1:5173/?mode=spotify');
    await page.getByText('Spotify Test Song', { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText('First live lyric line').waitFor({ timeout: 15000 });
    assert.equal(await page.getByLabel('Lyrics lines').count(), 1);
    await page.getByLabel('Lyrics lines').hover();
    await page.mouse.wheel(0, 250);
    await page.getByRole('button', { name: 'Resume Sync' }).waitFor();
    await page.getByRole('button', { name: 'Resume Sync' }).click();
    await page.getByRole('button', { name: 'Refresh lyrics' }).click();
    await page.getByText('First live lyric line').waitFor();
    await page.getByRole('button', { name: 'Search versions' }).click();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByText('Spotify Test Song', { exact: false }).last().waitFor();
    spotifyTitle = 'Second Spotify Song';
    await page.getByText('Second Spotify Song', { exact: true }).waitFor({ timeout: 12000 });
    await page.getByText('First live lyric line').waitFor();
    assert.deepEqual(errors, [], 'No JavaScript errors in browser Spotify flow');
    console.log('PASS: browser session restoration, mocked Spotify playback, LRCLIB sync, refresh, manual scroll and track change.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
