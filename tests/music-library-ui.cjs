const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5173/');
    await page.getByRole('button', { name: 'Open music library' }).click();
    const dialog = page.getByRole('dialog', { name: 'Music Library' });
    await dialog.waitFor();
    assert.equal(await dialog.getByText('Your queue · 5').count(), 1, 'Demo queue should be available on first run');
    await dialog.getByRole('button', { name: 'Remove Levitating from queue' }).click();
    await dialog.getByText('Your queue · 4').waitFor();
    await dialog.getByRole('button', { name: 'Queue Levitating' }).click();
    await dialog.getByText('Your queue · 5').waitFor();
    await dialog.getByRole('button', { name: 'Toggle shuffle' }).click();
    assert.equal(await dialog.getByRole('button', { name: 'Toggle shuffle' }).getAttribute('aria-pressed'), 'true');
    await dialog.getByRole('button', { name: 'Repeat off' }).click();
    await dialog.getByRole('button', { name: 'Repeat queue' }).waitFor();
    await dialog.getByRole('button', { name: 'Favorite current song' }).click();
    await dialog.getByRole('button', { name: 'Favorites' }).click();
    await dialog.getByRole('button', { name: 'Remove favorite Blinding Lights' }).waitFor();

    await dialog.getByRole('button', { name: 'Playlists' }).click();
    await dialog.getByRole('textbox', { name: 'New playlist name' }).fill('After Hours');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await dialog.getByRole('button', { name: 'Add now playing' }).click();
    await dialog.getByText('1 tracks').waitFor();

    await dialog.getByRole('button', { name: 'Backup' }).click();
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export JSON' }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'lyric-library-backup.json');

    await dialog.getByRole('button', { name: 'Close music library' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Open music library' }).click();
    await dialog.getByRole('button', { name: 'Favorites' }).click();
    await dialog.getByRole('button', { name: 'Remove favorite Blinding Lights' }).waitFor();
    await dialog.getByRole('button', { name: 'Playlists' }).click();
    await dialog.getByRole('button', { name: 'After Hours 1 tracks' }).waitFor();
    await dialog.getByRole('button', { name: 'Queue' }).click();
    await dialog.getByRole('button', { name: 'Repeat queue' }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Toggle shuffle' }).getAttribute('aria-pressed'), 'true');

    await dialog.getByRole('button', { name: 'Backup' }).click();
    await page.locator('input[aria-label="Library backup JSON"]').setInputFiles({
      name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"invalid":true}')
    });
    await dialog.getByText('Unsupported Lyric backup schema.').waitFor();
    assert.deepEqual(errors, [], 'No page exceptions in the library interface');
    console.log('PASS: responsive library UI, queue updates, shuffle/repeat, favorites, playlists, JSON export, reload persistence and invalid backup.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
