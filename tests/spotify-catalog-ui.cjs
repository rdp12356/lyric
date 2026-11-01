const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const PLAYLIST = '3cEYpjA9oz9GiPac4AsH4n';
const TRACK = '6rqhFgbbKwnb9MLmUQDhG6';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      localStorage.setItem('lyric.web.spotify.remembered', JSON.stringify({
        clientId: '62946f0e6551422aa8d3a5627245ab54',
        refreshToken: 'mock-refresh', expiresAt: Date.now() - 1000,
        remember: true, allowLibrary: true
      }));
      localStorage.setItem('lyric.web.spotify.prefer-mode', 'true');
    });
    await page.route('https://accounts.spotify.com/api/token', route =>
      route.fulfill({ json: { access_token: 'mock-access', refresh_token: 'mock-rotated', expires_in: 3600 } }));
    await page.route('https://api.spotify.com/v1/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/v1/me/player') return route.fulfill({ json: {
        currently_playing_type: 'track', progress_ms: 7000, is_playing: true,
        item: { type: 'track', id: TRACK, uri: 'spotify:track:' + TRACK,
          name: 'Current Spotify Song', artists: [{ name: 'Test Artist' }],
          duration_ms: 180000, album: { name: 'Test Album', images: [] } },
        device: { name: 'Mock device' }
      } });
      if (url.pathname === '/v1/me') return route.fulfill({ json: {
        id: 'listener-id', display_name: 'Test Listener', images: []
      } });
      if (url.pathname === '/v1/me/playlists') return route.fulfill({ json: {
        items: [{ id: PLAYLIST, name: 'Practice Mix', images: [], items: { total: 1 } }],
        total: 1, offset: 0, next: null
      } });
      if (url.pathname === '/v1/playlists/' + PLAYLIST + '/items') return route.fulfill({ json: {
        items: [{ item: { id: TRACK, type: 'track', name: 'Saved Playlist Song',
          duration_ms: 180000, artists: [{ name: 'Test Artist' }],
          album: { name: 'Test Album', images: [] } } }],
        total: 1, offset: 0, next: null
      } });
      return route.fulfill({ status: 404 });
    });
    await page.route('https://lrclib.net/**', route => route.fulfill({ status: 404 }));
    await page.goto('http://127.0.0.1:5173/?mode=spotify');
    await page.getByRole('button', { name: 'Browse Spotify playlists' }).waitFor();
    await page.getByRole('button', { name: 'Browse Spotify playlists' }).click();
    const dialog = page.getByRole('dialog', { name: 'Spotify playlists' });
    await dialog.getByText('Test Listener').waitFor();
    await dialog.getByText('Practice Mix').click();
    await dialog.getByText('Saved Playlist Song').waitFor();
    const favorite = dialog.locator('button[aria-label*="Saved Playlist Song favorite"]');
    try { await favorite.waitFor({ timeout: 4000 }); }
    catch (error) {
      console.error('Spotify dialog buttons:', await dialog.locator('button').evaluateAll(nodes =>
        nodes.map(node => ({ text: node.textContent?.trim(), aria: node.getAttribute('aria-label') }))
      ));
      throw error;
    }
    const label = await favorite.getAttribute('aria-label');
    if (label && label.startsWith('Save ')) await favorite.click();
    const favorites = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('lyric.music.library.v1')).favorites);
    assert(favorites.includes('spotify:spotify:track:' + TRACK));
    const href = await dialog.getByRole('link', { name: 'Open Saved Playlist Song on Spotify' }).getAttribute('href');
    assert.equal(href, 'https://open.spotify.com/track/' + TRACK);
    await dialog.getByRole('button', { name: 'Close Spotify library' }).click();
    assert.equal(await dialog.count(), 0);
    console.log('PASS: OAuth-permissioned Spotify playlists, profile, saved metadata and links back to Spotify.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
