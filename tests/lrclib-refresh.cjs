const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

require.extensions['.ts'] = (module, filename) => {
  const text = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  module._compile(js, filename);
};
const storage = new Map();
global.localStorage = {
  getItem: key => storage.get(key) || null,
  setItem: (key, value) => { storage.set(key, value); }
};
const service = require(path.resolve('src/services/lrclib.ts'));
const cache = require(path.resolve('src/services/lyricsCache.ts'));
const line1 = '[00:01.00]Freshly synced original lyrics';
const line2 = '[00:01.00]Updated synced original lyrics';
let version = 1;
let calls = [];
let backend = 'normal';
function response(status, data, headers = {}) {
  return { status, ok: status >= 200 && status < 300,
    headers: { get: name => headers[name] || null }, json: async () => data };
}
global.fetch = async (uri, options) => {
  const u = new URL(uri);
  calls.push(u);
  assert.equal(u.hostname, 'lrclib.net');
  assert(options.headers['Lrclib-Client'].includes('Lyric/'));
  if (backend === 'throttle') return response(429, {}, { 'Retry-After': '4' });
  const title = u.searchParams.get('track_name') || 'Test Song';
  if (u.pathname === '/api/get') return response(404, {});
  const records = [
    { id: 5, trackName: title, artistName: 'Original Artist',
      albumName: 'Album', duration: 180, instrumental: false,
      syncedLyrics: version === 1 ? line1 : line2, plainLyrics: 'Plain fallback' },
    { id: 6, trackName: title, artistName: 'Original Artist',
      albumName: 'Unrelated longer recording', duration: 245, instrumental: false,
      syncedLyrics: '[00:01.00]Wrong long version' }
  ];
  return response(200, records);
};
(async () => {
  const original = service.lookupLyricsFromLRCLIB('Test Song (Remastered)', 'Original Artist', 'Album', 180);
  const concurrent = service.lookupLyricsFromLRCLIB('Test Song (Remastered)', 'Original Artist', 'Album', 180);
  assert.strictEqual(original, concurrent, 'simultaneous duplicate requests should share one lookup');
  const first = await original;
  assert.equal(first.lyrics?.synced, true);
  assert.equal(first.lyrics?.lines[0].text, 'Freshly synced original lyrics');
  const callsAfterFirst = calls.length;
  const cachedResult = await service.lookupLyricsFromLRCLIB('Test Song (Remastered)', 'Original Artist', 'Album', 180);
  assert.equal(calls.length, callsAfterFirst, 'cached lookup must not hit LRCLIB');
  assert.equal(cachedResult.lyrics?.lines[0].text, 'Freshly synced original lyrics');

  version = 2;
  const fresh = await service.lookupLyricsFromLRCLIB('Test Song (Remastered)', 'Original Artist', 'Album', 180, { refresh: true });
  assert.equal(fresh.lyrics?.lines[0].text, 'Updated synced original lyrics');
  assert(calls.length > callsAfterFirst, 'manual refresh must request updated lyrics');
  const key = cache.lyricsKey('Test Song', 'Original Artist', 'Album', 180);
  assert.equal(cache.cachedLyrics(key)?.lines[0].text, 'Updated synced original lyrics');

  const rejected = await service.lookupLyricsFromLRCLIB('Test Song', 'Original Artist', 'Album', 400);
  assert.equal(rejected.lyrics, null, 'bad duration versions must not be accepted');
  assert.equal(rejected.issue, 'not-found');

  backend = 'throttle';
  const limited = await service.lookupLyricsFromLRCLIB('Another Song', 'Original Artist', '', 180);
  assert.equal(limited.issue, 'rate-limited');
  const after429 = calls.length;
  const stillLimited = await service.lookupLyricsFromLRCLIB('Third Song', 'Original Artist', '', 180);
  assert.equal(stillLimited.issue, 'rate-limited');
  assert.equal(calls.length, after429, 'retry-after cooldown must not generate extra requests');

  console.log('PASS: LRCLIB request deduplication, true refresh, sync matching, cache persistence, version length safety and 429 cooldown.');
})().catch(error => { console.error(error); process.exit(1); });
