const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText, filename
);
const memory = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key,value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
};
global.localStorage = memory();
global.sessionStorage = memory();
const ID = '3cEYpjA9oz9GiPac4AsH4n';
const TRACK = '6rqhFgbbKwnb9MLmUQDhG6';
let requests = [], mode = 'normal';
global.fetch = async uri => {
  const url = new URL(uri); requests.push(url.pathname + url.search);
  if (url.hostname === 'accounts.spotify.com') return {
    status: 200, ok: true, json: async () => ({ access_token: 'test-token', refresh_token: 'refresh-rotated', expires_in: 3600 })
  };
  const response = (status, data, retry = '') => ({
    status, ok: status >= 200 && status < 300,
    headers: { get: name => name === 'Retry-After' ? retry : null },
    json: async () => data
  });
  if (mode === 'quota') return response(429, { reason: 'QUOTA_EXCEEDED' }, '12');
  if (mode === 'forbidden') return response(403, {});
  if (url.pathname === '/v1/me') return response(200, { id: 'user-id', display_name: 'Test Listener', images: [] });
  if (url.pathname === '/v1/me/playlists') return response(200, {
    items: [{ id: ID, name: 'Original Test Mix', images: [], items: { total: 1 } }],
    next: null, total: 1, offset: 0
  });
  if (url.pathname === '/v1/playlists/' + ID + '/items') return response(200, {
    items: [{ item: {
      id: TRACK, type: 'track', name: 'Test Song',
      duration_ms: 123000, artists: [{ name: 'Composer' }],
      album: { name: 'Original Album', images: [] }
    }}],
    next: null, total: 1, offset: 0
  });
  throw Error('Unexpected endpoint ' + url);
};
(async () => {
  const auth = require(path.resolve('src/services/webSpotifyAuth.ts'));
  const catalog = require(path.resolve('src/services/spotifyCatalog.ts'));
  await assert.rejects(catalog.spotifyPlaylists(), /library permission|playlist/i);
  localStorage.setItem('lyric.web.spotify.remembered', JSON.stringify({
    clientId: '62946f0e6551422aa8d3a5627245ab54',
    refreshToken: 'refresh-start', remember: true, allowLibrary: true,
    expiresAt: Date.now() - 10000
  }));
  assert.equal(auth.spotifyBrowserLibraryAuthorized(), true);
  const user = await catalog.spotifyProfile();
  assert.equal(user.displayName, 'Test Listener');
  const page = await catalog.spotifyPlaylists();
  assert.equal(page.items[0].id, ID);
  assert.equal(page.items[0].itemCount, 1);
  assert.equal(page.nextOffset, null);
  const songs = await catalog.spotifyPlaylistTracks(ID);
  assert.equal(songs.items[0].id, TRACK);
  assert.equal(songs.items[0].duration, 123);
  assert(songs.items[0].url.startsWith('https://open.spotify.com/track/'));
  await assert.rejects(catalog.spotifyPlaylistTracks('invalid'), /Invalid/);
  mode = 'quota';
  await assert.rejects(catalog.spotifyPlaylists(), error => {
    assert.equal(error.status, 429);
    assert.match(error.message, /quota/i);
    assert.equal(error.retryAfterSeconds, 12);
    return true;
  });
  mode = 'forbidden';
  await assert.rejects(catalog.spotifyPlaylists(), error => {
    assert.equal(error.status, 403);
    return true;
  });
  auth.disconnectSpotifyBrowser();
  await assert.rejects(catalog.spotifyProfile(), /library permission/i);
  console.log('PASS: opt-in Spotify scopes, profile, playlists, playlist items, quota and forbidden-access rules.');
})().catch(error => { console.error(error); process.exit(1); });
