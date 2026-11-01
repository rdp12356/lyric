/**
 * Browser-only Spotify PKCE session. No client secret.
 * A remembered refresh token is XSS-accessible in browser storage: this is an
 * explicit trade-off for a static GitHub Pages deployment, not server security.
 */
const APP_PREFIX = 'lyric.web.spotify.';
const SAVED_CLIENT = APP_PREFIX + 'clientId';
const PERSISTENT_SESSION = APP_PREFIX + 'remembered';
const TEMP_SESSION = APP_PREFIX + 'session';
const PENDING_LOGIN = APP_PREFIX + 'pkce';
const SCOPE = 'user-read-playback-state';
export type SpotifyAuthPhase = 'disconnected' | 'connected' | 'expired';
interface TokenSession {
  clientId: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt: number;
  remember: boolean;
}
interface PendingLogin {
  state: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
  createdAt: number;
  remember: boolean;
}
let current: TokenSession | null = null;
let refreshFlight: Promise<string> | null = null;
let callbackFlight: Promise<boolean> | null = null;
let epoch = 0;
const now = () => Date.now();
function storage(read: Storage, key: string): string | null {
  try { return read.getItem(key); } catch { return null; }
}
function parseSession(raw: string | null): TokenSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as TokenSession;
    return /^[a-f0-9]{32}$/i.test(value.clientId) && typeof value.refreshToken === 'string' && value.refreshToken.length > 5
      ? { ...value, accessToken: undefined } : null;
  } catch { return null; }
}
function load() {
  if (current) return current;
  current = parseSession(storage(sessionStorage, TEMP_SESSION))
    || parseSession(storage(localStorage, PERSISTENT_SESSION));
  return current;
}
function persist() {
  if (!current) return;
  const safe = JSON.stringify({ ...current, accessToken: undefined });
  try {
    sessionStorage.setItem(TEMP_SESSION, safe);
    if (current.remember) localStorage.setItem(PERSISTENT_SESSION, safe);
    else localStorage.removeItem(PERSISTENT_SESSION);
  } catch { /* Session continues until this page closes. */ }
}
function randomBase64Url(size = 48): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return btoa(Array.from(bytes, value => String.fromCharCode(value)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(Array.from(new Uint8Array(digest), value => String.fromCharCode(value)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
export function savedSpotifyClientId(): string {
  return storage(localStorage, SAVED_CLIENT) || '';
}
export function hasRememberedSpotifySession(): boolean {
  return !!load();
}
/**
 * GitHub Pages serves this app at the repository root, e.g. /lyric/.
 * The exact root URL (trailing slash) must be registered in Spotify Dashboard.
 */
export function webSpotifyRedirectUri(): string {
  let path = window.location.pathname;
  if (path.endsWith('/index.html')) path = path.slice(0, -'index.html'.length);
  if (!path.endsWith('/')) path = path.slice(0, path.lastIndexOf('/') + 1);
  return window.location.origin + path;
}
export async function beginSpotifyBrowserLogin(clientId: string, remember: boolean) {
  if (!/^[a-f0-9]{32}$/i.test(clientId)) throw new Error('Enter a valid 32-character Spotify Client ID.');
  if (!window.isSecureContext || !crypto?.subtle) throw new Error('Spotify sign-in requires HTTPS or localhost.');
  const verifier = randomBase64Url(64);
  const state = randomBase64Url(32);
  const redirectUri = webSpotifyRedirectUri();
  const pending: PendingLogin = { state, verifier, clientId, redirectUri, createdAt: now(), remember };
  try {
    sessionStorage.setItem(PENDING_LOGIN, JSON.stringify(pending));
    localStorage.setItem(SAVED_CLIENT, clientId);
  } catch { throw new Error('Browser storage is required to complete Spotify sign-in.'); }
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPE,
    redirect_uri: redirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge: await challenge(verifier)
  });
  window.location.assign('https://accounts.spotify.com/authorize?' + query);
}
type TokenAnswer = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
};
async function postToken(body: URLSearchParams): Promise<TokenAnswer> {
  let response: Response;
  try {
    response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
  } catch { throw new Error('Unable to reach Spotify authentication. Check your connection.'); }
  let answer: TokenAnswer = {};
  try { answer = await response.json() as TokenAnswer; } catch { /* No user data in failures. */ }
  if (!response.ok || !answer.access_token) {
    if (answer.error === 'invalid_grant') {
      throw new Error('Spotify authorization expired or was revoked. Connect again.');
    }
    throw new Error('Spotify authorization failed (' + response.status + ').');
  }
  return answer;
}
function cleanCallbackParams(url: URL) {
  ['code','state','error','error_description'].forEach(name => url.searchParams.delete(name));
  window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
}
export function hasSpotifyCallbackParams() {
  const query = new URLSearchParams(window.location.search);
  return query.has('code') || query.has('error');
}
export function finishSpotifyBrowserCallback(): Promise<boolean> {
  if (callbackFlight) return callbackFlight;
  callbackFlight = (async () => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const responseState = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    if (!code && !error) return !!load();
    const pendingText = storage(sessionStorage, PENDING_LOGIN);
    sessionStorage.removeItem(PENDING_LOGIN);
    cleanCallbackParams(url); // Remove one-time authorization code immediately.
    let pending: PendingLogin | null = null;
    try { if (pendingText) pending = JSON.parse(pendingText) as PendingLogin; } catch { /* Invalid pending state. */ }
    if (error) throw new Error(error === 'access_denied' ? 'Spotify authorization was cancelled.' : 'Spotify refused authorization.');
    if (!pending || now() - pending.createdAt > 10 * 60 * 1000
        || responseState !== pending.state
        || webSpotifyRedirectUri() !== pending.redirectUri) {
      throw new Error('Spotify sign-in verification failed. Please connect again.');
    }
    const requestEpoch = epoch;
    const answer = await postToken(new URLSearchParams({
      grant_type: 'authorization_code', code: code!,
      redirect_uri: pending.redirectUri, client_id: pending.clientId,
      code_verifier: pending.verifier
    }));
    if (epoch !== requestEpoch) return false;
    if (!answer.refresh_token) throw new Error('Spotify did not issue a refresh token. Connect again.');
    current = {
      clientId: pending.clientId, remember: pending.remember,
      refreshToken: answer.refresh_token,
      accessToken: answer.access_token,
      expiresAt: now() + Math.max(1, answer.expires_in || 3600) * 1000
    };
    persist();
    return true;
  })().finally(() => { callbackFlight = null; });
  return callbackFlight;
}
export async function getSpotifyBrowserAccessToken(force = false): Promise<string> {
  const session = load();
  if (!session) throw new Error('Connect your Spotify account to follow playback.');
  if (!force && session.accessToken && session.expiresAt - now() > 45000) return session.accessToken;
  if (refreshFlight) return refreshFlight;
  const capturedEpoch = epoch;
  refreshFlight = (async () => {
    let answer: TokenAnswer;
    try {
      answer = await postToken(new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
        client_id: session.clientId
      }));
    } catch (error) {
      if (error instanceof Error && error.message.includes('expired or was revoked')) {
        disconnectSpotifyBrowser();
      }
      throw error;
    }
    if (capturedEpoch !== epoch) throw new Error('Spotify account was disconnected.');
    session.accessToken = answer.access_token;
    session.refreshToken = answer.refresh_token || session.refreshToken; // Token rotation.
    session.expiresAt = now() + Math.max(1, answer.expires_in || 3600) * 1000;
    current = session;
    persist();
    return answer.access_token!;
  })().finally(() => { refreshFlight = null; });
  return refreshFlight;
}
export function disconnectSpotifyBrowser() {
  epoch++;
  current = null;
  refreshFlight = null;
  callbackFlight = null;
  try {
    localStorage.removeItem(PERSISTENT_SESSION);
    sessionStorage.removeItem(TEMP_SESSION);
    sessionStorage.removeItem(PENDING_LOGIN);
  } catch { /* Browser storage may be unavailable. */ }
}
