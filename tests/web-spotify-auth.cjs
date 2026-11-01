const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
require.extensions['.ts'] = (module, file) => {
  module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText, file);
};
function mem() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}
global.crypto = webcrypto;
global.localStorage = mem();
global.sessionStorage = mem();
global.document = { title: 'Lyric' };
const loc = {
  href: 'https://rdp12356.github.io/lyric/?mode=spotify',
  origin: 'https://rdp12356.github.io',
  pathname: '/lyric/',
  search: '?mode=spotify',
  hash: '',
  assign(value) { this.lastAssign = value; },
};
const history = {
  replaceState(_state, _title, pathName) {
    loc.href = 'https://rdp12356.github.io' + pathName;
    const u = new URL(loc.href);
    loc.pathname = u.pathname;
    loc.search = u.search; loc.hash = u.hash;
  }
};
global.window = { location: loc, history, isSecureContext: true };
const auth = require(path.resolve('src/services/webSpotifyAuth.ts'));
const CLIENT = '62946f0e6551422aa8d3a5627245ab54';
let tokenCalls = [];
let issueError = '';
global.fetch = async (_uri, options) => {
  const body = new URLSearchParams(options.body);
  tokenCalls.push(body);
  if (issueError) return { ok: false, status: 400, json: async () => ({ error: issueError }) };
  if (body.get('grant_type') === 'authorization_code') return {
    ok: true, status: 200,
    json: async () => ({ access_token: 'first-access', refresh_token: 'first-refresh', expires_in: 3600 })
  };
  if (body.get('grant_type') === 'refresh_token') return {
    ok: true, status: 200,
    json: async () => ({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600 })
  };
  throw Error('Unexpected token request');
};
(async () => {
  assert.equal(auth.webSpotifyRedirectUri(), 'https://rdp12356.github.io/lyric/');
  assert.equal(auth.hasRememberedSpotifySession(), false);
  await auth.beginSpotifyBrowserLogin(CLIENT, true);
  const url = new URL(loc.lastAssign);
  assert.equal(url.host, 'accounts.spotify.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://rdp12356.github.io/lyric/');
  const pending = JSON.parse(sessionStorage.getItem('lyric.web.spotify.pkce'));
  assert(pending.verifier.length >= 43);
  assert.equal(url.searchParams.get('state'), pending.state);
  loc.href = 'https://rdp12356.github.io/lyric/?code=one-time&state=' + pending.state;
  loc.search = '?code=one-time&state=' + pending.state;
  const results = await Promise.all([auth.finishSpotifyBrowserCallback(),auth.finishSpotifyBrowserCallback()]);
  assert.deepEqual(results, [true,true], 'StrictMode duplicate callbacks must share token exchange');
  assert.equal(tokenCalls.length, 1);
  assert(!loc.search.includes('code='), 'One-time code must disappear from browser URL');
  assert.equal(await auth.getSpotifyBrowserAccessToken(), 'first-access');
  const session = JSON.parse(localStorage.getItem('lyric.web.spotify.remembered'));
  assert.equal(session.accessToken, undefined, 'access token must never be persisted');
  assert.equal(session.refreshToken, 'first-refresh');
  const refreshed = await Promise.all([
    auth.getSpotifyBrowserAccessToken(true),
    auth.getSpotifyBrowserAccessToken(true),
    auth.getSpotifyBrowserAccessToken(true)
  ]);
  assert.deepEqual(refreshed, ['rotated-access','rotated-access','rotated-access']);
  assert.equal(tokenCalls.length, 2, 'Single-flight refresh prevents triple API calls');
  const rotated = JSON.parse(localStorage.getItem('lyric.web.spotify.remembered'));
  assert.equal(rotated.refreshToken, 'rotated-refresh');
  auth.disconnectSpotifyBrowser();
  assert.equal(auth.hasRememberedSpotifySession(), false);
  await auth.beginSpotifyBrowserLogin(CLIENT, false);
  const wrong = JSON.parse(sessionStorage.getItem('lyric.web.spotify.pkce'));
  loc.href = 'https://rdp12356.github.io/lyric/?code=bad&state=wrong';
  loc.search = '?code=bad&state=wrong';
  await assert.rejects(auth.finishSpotifyBrowserCallback(), /verification failed/i);
  assert.equal(tokenCalls.length, 2, 'Reject CSRF attempts before token endpoint');
  assert(!loc.search.includes('code='), 'Failed auth must also clear sensitive code');
  console.log('PASS: Pages redirect, PKCE S256, state validation, callback deduplication, token rotation, single-flight refresh and disconnect.');
})().catch(error => { console.error(error); process.exit(1); });
