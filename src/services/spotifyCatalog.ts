import { getSpotifyBrowserAccessToken, spotifyBrowserLibraryAuthorized } from './webSpotifyAuth';

export interface SpotifyProfile {
  id: string;
  displayName: string;
  avatar: string;
  url: string;
}
export interface SpotifyPlaylist {
  id: string;
  name: string;
  artwork: string;
  itemCount: number;
  url: string;
}
export interface SpotifyCatalogTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  artwork: string;
  duration: number;
  url: string;
}
export interface SpotifyPage<T> {
  items: T[];
  total: number;
  offset: number;
  nextOffset: number | null;
}
export class SpotifyCatalogError extends Error {
  constructor(message: string, public status: number, public retryAfterSeconds?: number) {
    super(message);
  }
}
const safeSpotifyId = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9]{22}$/.test(id) ? id : '';
const text = (value: unknown, max=200) => typeof value === 'string' ? value.slice(0,max) : '';
const firstImage = (images: unknown) => Array.isArray(images) && images.length
  && typeof images[0]?.url === 'string' && images[0].url.startsWith('https://')
  ? images[0].url : '';
const readRetry = (response: Response) => {
  const value = response.headers.get('Retry-After') || '';
  const seconds = Number(value);
  if (value && Number.isFinite(seconds)) return Math.max(1, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - Date.now())/1000)) : 30;
};
async function querySpotify(path: string, signal?: AbortSignal): Promise<unknown> {
  if (!spotifyBrowserLibraryAuthorized()) throw new SpotifyCatalogError(
    'Reconnect with the optional Spotify Library permission to browse your playlists.', 403
  );
  let token = await getSpotifyBrowserAccessToken();
  for (let attempt=0; attempt<2; attempt++) {
    let response: Response;
    try {
      response = await fetch('https://api.spotify.com/v1' + path, {
        headers: { Authorization: 'Bearer ' + token },
        signal, cache: 'no-store'
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new SpotifyCatalogError('Cannot reach Spotify right now.', 0);
    }
    if (response.status === 401 && attempt === 0) {
      token = await getSpotifyBrowserAccessToken(true);
      continue;
    }
    if (response.status === 429) {
      let reason = '';
      try {
        const responseBody = await response.json();
        reason = String(responseBody?.reason || responseBody?.error?.reason || '');
      } catch { /* Empty rate-limit body. */ }
      throw new SpotifyCatalogError(
        reason === 'QUOTA_EXCEEDED'
          ? 'Spotify developer quota exceeded. Playlist browsing is temporarily unavailable.'
          : 'Spotify is rate limiting playlist requests. Please retry later.',
        429, readRetry(response)
      );
    }
    if (response.status === 403) throw new SpotifyCatalogError(
      'Spotify does not permit this playlist operation for this account or app.', 403
    );
    if (!response.ok) throw new SpotifyCatalogError('Spotify request failed (' + response.status + ').', response.status);
    return response.json();
  }
  throw new SpotifyCatalogError('Could not authorize this Spotify request.', 401);
}
function number(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
export async function spotifyProfile(signal?: AbortSignal): Promise<SpotifyProfile> {
  const obj = await querySpotify('/me', signal) as Record<string, any>;
  const id = text(obj.id, 200);
  return {
    id, displayName: text(obj.display_name || id),
    avatar: firstImage(obj.images),
    url: id ? 'https://open.spotify.com/user/' + encodeURIComponent(id) : ''
  };
}
export async function spotifyPlaylists(offset = 0, signal?: AbortSignal): Promise<SpotifyPage<SpotifyPlaylist>> {
  const skip = Math.min(100000, Math.max(0, Math.floor(offset)));
  const limit = 20;
  const data = await querySpotify('/me/playlists?' + new URLSearchParams({
    limit: String(limit), offset: String(skip)
  }), signal) as Record<string, any>;
  const items = (Array.isArray(data.items) ? data.items : []).flatMap((obj: any) => {
    const id = safeSpotifyId(obj?.id);
    if (!id) return [];
    return [{
      id, name: text(obj.name), artwork: firstImage(obj.images),
      itemCount: Math.max(0, number(obj.items?.total ?? obj.tracks?.total)),
      url: 'https://open.spotify.com/playlist/' + id
    } satisfies SpotifyPlaylist];
  });
  const total = Math.max(0, number(data.total));
  return { items, total, offset: skip, nextOffset: data.next && skip + limit < total ? skip + limit : null };
}
export async function spotifyPlaylistTracks(id: string, offset = 0, signal?: AbortSignal): Promise<SpotifyPage<SpotifyCatalogTrack>> {
  const playlistId = safeSpotifyId(id);
  if (!playlistId) throw new SpotifyCatalogError('Invalid Spotify playlist ID.', 400);
  const skip = Math.min(100000, Math.max(0, Math.floor(offset))), limit = 20;
  const data = await querySpotify('/playlists/' + playlistId + '/items?' + new URLSearchParams({
    limit: String(limit), offset: String(skip)
  }), signal) as Record<string, any>;
  const items = (Array.isArray(data.items) ? data.items : []).flatMap((record: any) => {
    const item = record?.item || record?.track;
    const id = safeSpotifyId(item?.id);
    if (!id || item?.type !== 'track') return [];
    return [{
      id, name: text(item.name),
      artist: Array.isArray(item.artists) ? item.artists.map((artist: any) => text(artist.name)).join(', ').slice(0,250) : '',
      album: text(item.album?.name), artwork: firstImage(item.album?.images),
      duration: Math.max(0, number(item.duration_ms))/1000,
      url: 'https://open.spotify.com/track/' + id
    } satisfies SpotifyCatalogTrack];
  });
  const total = Math.max(0, number(data.total));
  return { items, total, offset: skip, nextOffset: data.next && skip + limit < total ? skip + limit : null };
}
