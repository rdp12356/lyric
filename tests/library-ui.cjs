const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    await page.route('http://localhost:4892/**', route => route.abort());
    await page.route('https://lrclib.net/**', route => route.fulfill({ status: 404 }));
    await page.goto('http://127.0.0.1:5173/');
    await page.getByRole('button', { name: 'Open music library' }).click();
    const dialog = page.getByRole('dialog', { name: 'Your music library' });
    await dialog.waitFor({ timeout: 15000 });
    assert.equal(await page.getByRole('tab', { name: 'Queue' }).getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name: 'Move Blinding Lights down' }).click();
    let state = await page.evaluate(() => JSON.parse(localStorage.getItem('lyric.music.library.v1')));
    assert.deepEqual(state.queue.slice(0, 2), ['demo-2', 'demo-1']);
    await page.getByRole('button', { name: /Shuffle Off/ }).click();
    await page.getByRole('button', { name: /Repeat off/ }).click();
    await page.getByLabel('Local player volume').fill('25');
    state = await page.evaluate(() => JSON.parse(localStorage.getItem('lyric.music.library.v1')));
    assert.equal(state.shuffle, true);
    assert.equal(state.repeat, 'all');
    assert.equal(state.volume, 0.25);
    await page.getByRole('tab', { name: 'Favorites' }).click();
    await page.getByRole('button', { name: 'Favorite current song' }).click();
    state = await page.evaluate(() => JSON.parse(localStorage.getItem('lyric.music.library.v1')));
    assert(state.favorites.includes('demo-1'));
    await page.getByRole('tab', { name: 'Playlists' }).click();
    await page.getByLabel('New playlist name').fill('Study Mix');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('button', { name: 'Study Mix (0)' }).click();
    await page.getByRole('button', { name: 'Add current song' }).click();
    state = await page.evaluate(() => JSON.parse(localStorage.getItem('lyric.music.library.v1')));
    assert.deepEqual(state.playlists[0].trackIds, ['demo-1']);
    await page.getByRole('tab', { name: 'Backup' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup' }).click();
    const download = await downloadPromise;
    const backupText = fs.readFileSync(await download.path(), 'utf8');
    const backup = JSON.parse(backupText);
    assert.equal(backup.version, 1);
    assert.equal(backup.library.playlists[0].name, 'Study Mix');
    assert(!backupText.includes('accessToken'));
    assert(!backupText.includes('refreshToken'));
    await page.getByLabel('Library backup file').setInputFiles({
      name: 'Lyric-library.json', mimeType: 'application/json', buffer: Buffer.from(backupText)
    });
    await page.getByText('Backup merged:', { exact: false }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    await page.reload();
    await page.getByRole('button', { name: 'Open music library' }).click();
    await page.getByRole('tab', { name: 'Playlists' }).click();
    await page.getByRole('button', { name: /Study Mix \(1\)/ }).waitFor();
    console.log('PASS: library UI queue/shuffle/repeat/volume, favorites, playlists, backup export/import and reload persistence.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
