const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('lyric.web.spotify.remembered', JSON.stringify({
        clientId: '62946f0e6551422aa8d3a5627245ab54',
        refreshToken: 'mock-refresh', expiresAt: Date.now() - 10000, remember: true
      }));
      localStorage.setItem('lyric.web.spotify.prefer-mode', 'true');
    });
    await page.route('https://accounts.spotify.com/api/token', route =>
      route.fulfill({ json: { access_token: 'mock-token', refresh_token: 'mock-next', expires_in: 3600 } }));
    await page.route('https://api.spotify.com/v1/me/player', route =>
      route.fulfill({ json: {
        currently_playing_type: 'track', is_playing: true, progress_ms: 15000,
        device: { name: 'Official Spotify' },
        item: {
          type: 'track', id: 'web-track-one', uri: 'spotify:track:web-track-one',
          name: 'Spotify Library Song', artists: [{ name: 'Original Artist' }],
          duration_ms: 180000, album: { name: 'Original Album', images: [] }
        }
      }}));
    await page.route('https://lrclib.net/**', route => route.fulfill({ json: {
      id: 34, trackName: 'Spotify Library Song', artistName: 'Original Artist', duration: 180,
      syncedLyrics: '[00:10.00]An original demo lyric'
    } }));
    await page.goto('http://127.0.0.1:5173/?mode=spotify');
    await page.getByText('Spotify Library Song', { exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Save Spotify favorite' }).click();
    await page.getByRole('button', { name: 'Remove Spotify favorite' }).waitFor();
    await page.getByRole('button', { name: 'Open music library' }).click();
    const drawer = page.getByRole('dialog', { name: 'Music Library' });
    await drawer.getByRole('button', { name: 'Favorites' }).click();
    await drawer.getByRole('button', { name: 'Play Spotify Library Song' }).waitFor();
    assert.equal(await drawer.getByRole('button', { name: 'Play Spotify Library Song' }).isDisabled(), true,
      'External Spotify metadata cannot be played locally');
    await drawer.getByRole('button', { name: 'History' }).click();
    await drawer.getByText('Spotify Library Song').last().waitFor();
    await drawer.getByRole('button', { name: 'Playlists' }).click();
    await drawer.getByRole('textbox', { name: 'New playlist name' }).fill('Spotify Favorites');
    await drawer.getByRole('button', { name: 'Create' }).click();
    await drawer.getByRole('button', { name: 'Add now playing' }).click();
    await drawer.getByText('1 tracks').waitFor();
    await drawer.getByRole('button', { name: 'Queue', exact: true }).click();
    assert.equal(await drawer.getByRole('button', { name: 'Add to queue' }).isDisabled(), true,
      'External Spotify metadata must not enter the local playback queue');
    await drawer.getByRole('button', { name: 'Close music library' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Remove Spotify favorite' }).waitFor({ timeout: 15000 });
    assert.deepEqual(errors, []);
    console.log('PASS: Spotify favorites, recent tracks and playlists persist without hijacking external playback.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
