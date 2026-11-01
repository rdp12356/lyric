const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => {
  module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, file);
};
const storage = () => {
  const values = new Map();
  return {
    getItem: k => values.get(k) || null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: k => values.delete(k)
  };
};
global.localStorage = storage();
global.sessionStorage = storage();
global.window = {
  location: { href: 'https://rdp12356.github.io/lyric/', pathname: '/lyric/',
    origin: 'https://rdp12356.github.io', search: '' }
};
localStorage.setItem('lyric.web.spotify.remembered', JSON.stringify({
  clientId: '62946f0e6551422aa8d3a5627245ab54',
  refreshToken: 'old-refresh', expiresAt: 0, remember: true
}));
let mode = 'valid';
let tokenCalls = 0, playbackCalls = 0;
const validData = {
  currently_playing_type: 'track', is_playing: true, progress_ms: 10200,
  device: { name: 'Spotify Desktop', id: 'device-one', is_restricted: false },
  item: {
    type: 'track', name: 'Original Test Track', uri: 'spotify:track:abc123', id: 'abc123',
    artists: [{ name: 'Original Artist' }], duration_ms: 180000,
    album: { name: 'Album', images: [{ url: 'https://i.scdn.co/album.jpg', width: 300 }] }
  }
};
function reply(status, data, headers = {}) {
  return {
    status, ok: status >= 200 && status < 300,
    headers: { get(name) { return headers[name] || null; } },
    json: async () => data
  };
}
global.fetch = async (uri) => {
  const url = String(uri);
  if (url.includes('accounts.spotify.com/api/token')) {
    tokenCalls++;
    return reply(200, { access_token: 'test-access-' + tokenCalls,
      refresh_token: 'rotated-refresh', expires_in: 3600 });
  }
  if (url.includes('api.spotify.com/v1/me/player')) {
    playbackCalls++;
    if (mode === 'no-device') return reply(204, null);
    if (mode === 'ad') return reply(200, { currently_playing_type: 'ad' });
    if (mode === '403') return reply(403, { error: { status: 403 } });
    if (mode === '429') return reply(429, {}, { 'Retry-After': '7' });
    if (mode === '401-once') {
      mode = 'valid';
      return reply(401, {});
    }
    if (mode === 'paused') return reply(200, { ...validData, is_playing: false });
    return reply(200, validData);
  }
  throw Error('Unexpected URL: ' + url);
};
(async () => {
  const playback = require(path.resolve('src/services/webSpotifyPlayback.ts'));
  let result = await playback.readWebSpotifyPlayback();
  assert.equal(result.playback.title, 'Original Test Track');
  assert.equal(result.playback.artist, 'Original Artist');
  assert.equal(result.playback.deviceName, 'Spotify Desktop');
  assert.equal(result.playback.canSeek, false, 'No seek without explicit scope');
  assert.equal(tokenCalls, 1, 'Session should be refreshed exactly once');
  mode = 'paused';
  result = await playback.readWebSpotifyPlayback();
  assert.equal(result.playback.playing, false);
  assert(Math.abs(result.playback.position - 10.2) < 0.2);
  mode = 'no-device';
  result = await playback.readWebSpotifyPlayback();
  assert.equal(result.playback, null);
  assert.match(result.message, /No active/);
  mode = 'ad';
  result = await playback.readWebSpotifyPlayback();
  assert.equal(result.playback, null);
  assert.match(result.message, /advertisement/);
  mode = '429';
  await assert.rejects(playback.readWebSpotifyPlayback(), error => {
    assert.equal(error.status, 429);
    assert(error.retryAfterSeconds >= 7);
    return true;
  });
  mode = '403';
  await assert.rejects(playback.readWebSpotifyPlayback(), /denied playback access/);
  mode = '401-once';
  result = await playback.readWebSpotifyPlayback();
  assert.equal(result.playback.title, 'Original Test Track');
  assert.equal(tokenCalls, 2, '401 should force one token refresh before retrying');
  await assert.rejects(playback.spotifyWebControl('seek', 20), /not authorized/);
  console.log('PASS: Spotify track/album/device, pauses, 204, ads, 403, 429, 401 refresh and control scopes.');
})().catch(error => { console.error(error); process.exit(1); });
