const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText, file
);
const values = new Map();
global.localStorage = {
  getItem: key => values.get(key) || null,
  setItem: (key, value) => { values.set(key, value); },
  removeItem: key => { values.delete(key); }
};
let variant = 'live';
global.fetch = async uri => {
  const url = new URL(uri);
  if (url.pathname === '/api/get') return {
    ok: false, status: 404, headers: { get() { return null; } }
  };
  const record = {
    id: variant === 'live' ? 1 : variant === 'acoustic' ? 2 : 3,
    trackName: variant === 'live' ? 'Test Song (Live)' :
      variant === 'acoustic' ? 'Test Song (Acoustic)' : 'Test Song',
    artistName: 'Original Artist', albumName: 'Same Album',
    instrumental: false, duration: 180,
    syncedLyrics: '[00:00.00]Lyrics for matching recording'
  };
  return {
    ok: true, status: 200, json: async () => [record],
    headers: { get() { return null; } }
  };
};
(async () => {
  const { lookupLyricsFromLRCLIB } = require(path.resolve('src/services/lrclib.ts'));
  const studio = await lookupLyricsFromLRCLIB('Test Song','Original Artist','Same Album',180);
  assert.equal(studio.lyrics,null,'Studio should not silently receive live lyrics');
  const live = await lookupLyricsFromLRCLIB('Test Song (Live)','Original Artist','Same Album',180);
  assert.equal(live.lyrics?.synced,true,'Live must match its own live recording');
  variant = 'acoustic';
  const liveWithAcoustic = await lookupLyricsFromLRCLIB('Test Song (Live)','Original Artist','Other Album',180);
  assert.equal(liveWithAcoustic.lyrics,null,'Different live/acoustic versions must not be combined');
  const acoustic = await lookupLyricsFromLRCLIB('Test Song (Acoustic)','Original Artist','Same Album',180);
  assert.equal(acoustic.lyrics?.synced,true);
  variant = 'studio';
  const studioAvailable = await lookupLyricsFromLRCLIB('Test Song','Original Artist','Same Album',180, {refresh: true});
  assert.equal(studioAvailable.lyrics?.synced,true);
  console.log('PASS: strict Spotify live/acoustic/studio version matching and explicit refresh.');
})().catch(error => { console.error(error); process.exit(1); });
