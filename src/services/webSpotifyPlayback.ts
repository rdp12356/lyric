import { getSpotifyBrowserAccessToken, spotifyBrowserControlsAuthorized } from './webSpotifyAuth';

export interface SpotifyWebPlayback {
  trackId: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  duration: number;
  position: number;
  playing: boolean;
  sampledAt: number;
  deviceName: string;
  deviceId?: string;
  canSeek: boolean;
}
export interface PlaybackUpdate {
  playback: SpotifyWebPlayback | null;
  message: string;
  retryAfterSeconds?: number;
}
export class PlaybackRequestError extends Error {
  constructor(message: string, public status: number, public retryAfterSeconds?: number) { super(message); }
}
interface SpotifyResponse {
  item?: {
    id?: string;
    uri?: string;
    type?: string;
    name?: string;
    artists?: { name: string }[];
    album?: { name?: string; images?: { url: string; width?: number }[] };
    duration_ms?: number;
  } | null;
  is_playing?: boolean;
  currently_playing_type?: string;
  progress_ms?: number;
  device?: { id?: string; name?: string; is_restricted?: boolean };
  actions?: { disallows?: { seeking?: boolean } };
}
function retrySeconds(response: Response): number {
  const value = response.headers.get('Retry-After') || '';
  const numeric = Number(value);
  if (value && Number.isFinite(numeric)) return Math.max(1, Math.ceil(numeric));
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.ceil((parsed - Date.now()) / 1000)) : 15;
}
export async function readWebSpotifyPlayback(signal?: AbortSignal): Promise<PlaybackUpdate> {
  let token = await getSpotifyBrowserAccessToken();
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = performance.now();
    let response: Response;
    try {
      response = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { Authorization: 'Bearer ' + token },
        signal,
        cache: 'no-store'
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new PlaybackRequestError('Spotify is unreachable. Check your connection.', 0);
    }
    if (response.status === 401 && attempt === 0) {
      token = await getSpotifyBrowserAccessToken(true);
      continue;
    }
    if (response.status === 204) return { playback: null, message: 'No active Spotify playback device.' };
    if (response.status === 429) throw new PlaybackRequestError(
      'Spotify is temporarily rate-limiting playback requests.', 429, retrySeconds(response)
    );
    if (response.status === 401) throw new PlaybackRequestError('Spotify session expired. Reconnect your account.', 401);
    if (response.status === 403) throw new PlaybackRequestError(
      'Spotify denied playback access. Check your account, developer allowlist and app permissions.', 403
    );
    if (!response.ok) throw new PlaybackRequestError('Spotify playback could not be read (' + response.status + ').', response.status);
    const data = await response.json() as SpotifyResponse;
    if (data.currently_playing_type === 'ad') return { playback: null, message: 'Spotify is playing an advertisement.' };
    const item = data.item;
    if (!item || item.type !== 'track' || !item.name) return {
      playback: null, message: 'Spotify is playing non-track content or nothing is selected.'
    };
    const elapsed = Math.max(0, performance.now() - started);
    const duration = Math.max(0, (item.duration_ms || 0) / 1000);
    const position = Math.max(0, (data.progress_ms || 0) / 1000 + (data.is_playing ? elapsed / 2000 : 0));
    const images = item.album?.images || [];
    const artwork = images.slice().sort((a,b) => (b.width || 0) - (a.width || 0))[0]?.url || '';
    const playback: SpotifyWebPlayback = {
      trackId: item.id || item.uri || '',
      uri: item.uri || '',
      title: item.name,
      artist: (item.artists || []).map(a => a.name).join(', '),
      album: item.album?.name || '',
      artwork,
      duration,
      position: Math.min(duration || Infinity, position),
      playing: !!data.is_playing,
      sampledAt: performance.now(),
      deviceName: data.device?.name || 'Spotify',
      deviceId: data.device?.id,
      canSeek: spotifyBrowserControlsAuthorized() && !data.actions?.disallows?.seeking && !data.device?.is_restricted
    };
    return { playback, message: '' };
  }
  throw new PlaybackRequestError('Spotify authorization failed.', 401);
}


/** Optional remote control; Spotify remains the only music player. */
export async function spotifyWebControl(action: 'seek' | 'pause' | 'resume', seconds?: number): Promise<void> {
  if (!spotifyBrowserControlsAuthorized()) throw new PlaybackRequestError(
    'Playback control was not authorized. Reconnect with the optional control permission.', 403
  );
  const endpoint = action === 'seek'
    ? '/v1/me/player/seek?position_ms=' + Math.round((seconds || 0) * 1000)
    : action === 'pause' ? '/v1/me/player/pause' : '/v1/me/player/play';
  if (action === 'seek' && (!Number.isFinite(seconds) || seconds! < 0 || seconds! > 86400)) {
    throw new Error('Invalid seek position.');
  }
  let token = await getSpotifyBrowserAccessToken();
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('https://api.spotify.com' + endpoint, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token }
    });
    if (response.status === 401 && attempt === 0) {
      token = await getSpotifyBrowserAccessToken(true);
      continue;
    }
    if (response.ok) return;
    if (response.status === 429) throw new PlaybackRequestError(
      'Spotify asked us to slow down.', 429, retrySeconds(response)
    );
    if (response.status === 403) throw new PlaybackRequestError('Your Spotify account or device does not allow this playback control.', 403);
    throw new PlaybackRequestError('Spotify playback control failed (' + response.status + ').', response.status);
  }
}
