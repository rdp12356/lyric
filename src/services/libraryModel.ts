import type { Track } from '../types';

/** Portable metadata only: never contain OAuth credentials, Blob URLs or raw audio. */
export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  duration: number;
  source: Track['source'];
}
export type RepeatMode = 'off' | 'all' | 'one';
export interface LibraryPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}
export interface LibraryHistory {
  trackId: string;
  playedAt: number;
}
export interface LibraryState {
  schemaVersion: 1;
  catalog: LibraryTrack[];
  favorites: string[];
  playlists: LibraryPlaylist[];
  queue: string[];
  currentId: string | null;
  history: LibraryHistory[];
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
}
export interface LibraryBackup {
  app: 'Lyric';
  version: 1;
  exportedAt: string;
  library: LibraryState;
}
const SOURCES = new Set<Track['source']>([
  'android-media', 'demo', 'macos-music', 'macos-spotify', 'spotify-web',
  'local-file', 'search'
]);
const LIMIT = { tracks: 400, queue: 200, playlists: 50, history: 100, favorite: 400 };
const asText = (v: unknown, limit = 200) => typeof v === 'string' ? v.trim().slice(0, limit) : '';
const asRecord = (value: unknown): Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const safeId = (value: unknown) => asText(value, 180).replace(/[^\p{L}\p{N}_:|.\-]/gu, '');
const dedupe = (ids: string[], allowed: Set<string>, max: number): string[] =>
  [...new Set(ids.filter(id => allowed.has(id)))].slice(0, max);
function validImage(value: unknown) {
  const url = asText(value, 1024);
  if (!url) return '';
  try { const parsed = new URL(url); return parsed.protocol === 'https:' ? parsed.href : ''; }
  catch { return ''; }
}
export function asLibraryTrack(value: unknown): LibraryTrack | null {
  const obj = asRecord(value);
  const id = safeId(obj.id);
  const title = asText(obj.title);
  const source = obj.source;
  if (!id || !title || !SOURCES.has(source as Track['source'])) return null;
  const duration = Number(obj.duration);
  return {
    id, title,
    artist: asText(obj.artist) || 'Unknown Artist',
    album: asText(obj.album),
    albumArt: validImage(obj.albumArt),
    duration: Number.isFinite(duration) ? Math.min(86400, Math.max(0, duration)) : 0,
    source: source as Track['source']
  };
}
export function initialLibrary(seed: LibraryTrack[] = []): LibraryState {
  const catalog = seed.slice(0, LIMIT.tracks);
  return {
    schemaVersion: 1, catalog, favorites: [], playlists: [],
    queue: catalog.filter(t => t.source === 'demo').map(t => t.id),
    currentId: catalog[0]?.id || null, history: [],
    shuffle: false, repeat: 'off', volume: 0.8
  };
}
export function normalizeLibrary(value: unknown, seed: LibraryTrack[] = []): LibraryState {
  const obj = asRecord(value);
  if (obj.schemaVersion !== 1) throw Error('Unsupported library backup version.');
  const candidateTracks = Array.isArray(obj.catalog) ? obj.catalog : [];
  const unique = new Map<string, LibraryTrack>();
  for (const item of [...seed, ...candidateTracks]) {
    const track = asLibraryTrack(item);
    if (track && !unique.has(track.id)) unique.set(track.id, track);
    if (unique.size >= LIMIT.tracks) break;
  }
  const catalog = [...unique.values()];
  const allowed = new Set(catalog.map(track => track.id));
  const arrayIds = (item: unknown) => Array.isArray(item) ? item.map(safeId).filter(Boolean) : [];
  const playlists: LibraryPlaylist[] = [];
  const existing = new Set<string>();
  for (const item of Array.isArray(obj.playlists) ? obj.playlists : []) {
    const row = asRecord(item);
    const id = safeId(row.id), name = asText(row.name, 80);
    if (!id || !name || existing.has(id)) continue;
    existing.add(id);
    playlists.push({
      id, name, trackIds: dedupe(arrayIds(row.trackIds), allowed, LIMIT.queue),
      createdAt: Number.isFinite(Number(row.createdAt)) ? Math.max(0, Number(row.createdAt)) : 0
    });
    if (playlists.length >= LIMIT.playlists) break;
  }
  const queue = dedupe(arrayIds(obj.queue), allowed, LIMIT.queue);
  const currentId = safeId(obj.currentId);
  const rawHistory = Array.isArray(obj.history) ? obj.history : [];
  const history: LibraryHistory[] = rawHistory.slice(0, LIMIT.history).flatMap(item => {
    const entry = asRecord(item);
    const trackId = safeId(entry.trackId), playedAt = Number(entry.playedAt);
    return allowed.has(trackId) && Number.isFinite(playedAt) && playedAt >= 0
      ? [{ trackId, playedAt }] : [];
  });
  const volume = Number(obj.volume);
  return {
    schemaVersion: 1,
    catalog,
    favorites: dedupe(arrayIds(obj.favorites), allowed, LIMIT.favorite),
    playlists,
    queue,
    currentId: allowed.has(currentId) ? currentId : (queue[0] || null),
    history,
    shuffle: obj.shuffle === true,
    repeat: obj.repeat === 'all' || obj.repeat === 'one' ? obj.repeat : 'off',
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.8
  };
}
export function registerTrack(state: LibraryState, track: LibraryTrack): LibraryState {
  const safe = asLibraryTrack(track);
  if (!safe) return state;
  const found = state.catalog.findIndex(row => row.id === safe.id);
  const catalog = found >= 0
    ? state.catalog.map(row => row.id === safe.id ? safe : row)
    : [...state.catalog, safe].slice(-LIMIT.tracks);
  return normalizeLibrary({ ...state, catalog }, []);
}
export function queueTrack(state: LibraryState, trackId: string): LibraryState {
  if (!state.catalog.some(t => t.id === trackId)) return state;
  if (state.queue.includes(trackId)) return state;
  return { ...state, queue: [...state.queue, trackId].slice(-LIMIT.queue) };
}
export function removeQueueTrack(state: LibraryState, id: string): LibraryState {
  return { ...state, queue: state.queue.filter(t => t !== id) };
}
export function reorderQueue(state: LibraryState, id: string, direction: -1 | 1): LibraryState {
  const queue = [...state.queue];
  const from = queue.indexOf(id), to = from + direction;
  if (from < 0 || to < 0 || to >= queue.length) return state;
  [queue[from], queue[to]] = [queue[to], queue[from]];
  return { ...state, queue };
}
export function nextTrackId(state: LibraryState, currentId: string, direction: -1 | 1 = 1,
  automatic = false, random = Math.random): string | null {
  const queue = state.queue;
  if (!queue.length) return null;
  if (automatic && state.repeat === 'one') return queue.includes(currentId) ? currentId : queue[0];
  if (state.shuffle && direction > 0 && queue.length > 1) {
    const options = queue.filter(id => id !== currentId);
    return options[Math.min(options.length - 1, Math.max(0, Math.floor(random() * options.length)))];
  }
  const index = queue.indexOf(currentId);
  if (index < 0) return queue[0];
  const next = index + direction;
  if (next >= 0 && next < queue.length) return queue[next];
  return state.repeat === 'all' ? queue[(next + queue.length) % queue.length] : null;
}
export function markPlayed(state: LibraryState, trackId: string, now = Date.now()): LibraryState {
  if (!state.catalog.some(track => track.id === trackId)) return state;
  return {
    ...state, currentId: trackId,
    history: [{ trackId, playedAt: now }, ...state.history.filter(h => h.trackId !== trackId)]
      .slice(0, LIMIT.history)
  };
}
export function toggleFavorite(state: LibraryState, id: string): LibraryState {
  if (!state.catalog.some(t => t.id === id)) return state;
  return { ...state, favorites: state.favorites.includes(id)
    ? state.favorites.filter(item => item !== id)
    : [...state.favorites, id].slice(-LIMIT.favorite) };
}
export function addPlaylist(state: LibraryState, name: string, id: string, now = Date.now()): LibraryState {
  const clean = asText(name, 80), safe = safeId(id);
  if (!clean || !safe || state.playlists.some(p => p.id === safe) || state.playlists.length >= LIMIT.playlists)
    return state;
  return { ...state, playlists: [...state.playlists, { id: safe, name: clean, trackIds: [], createdAt: now }] };
}
export function addToPlaylist(state: LibraryState, playlistId: string, trackId: string): LibraryState {
  if (!state.catalog.some(t => t.id === trackId)) return state;
  return { ...state, playlists: state.playlists.map(playlist =>
    playlist.id === playlistId && !playlist.trackIds.includes(trackId)
      ? { ...playlist, trackIds: [...playlist.trackIds, trackId].slice(0, LIMIT.queue) }
      : playlist) };
}
export function removeFromPlaylist(state: LibraryState, playlistId: string, trackId: string): LibraryState {
  return { ...state, playlists: state.playlists.map(p =>
    p.id === playlistId ? { ...p, trackIds: p.trackIds.filter(id => id !== trackId) } : p) };
}
export function exportLibrary(state: LibraryState): string {
  return JSON.stringify({ app: 'Lyric', version: 1, exportedAt: new Date().toISOString(),
    library: normalizeLibrary(state) } satisfies LibraryBackup, null, 2);
}
export function mergeLibraryBackup(current: LibraryState, input: string): LibraryState {
  if (input.length > 2 * 1024 * 1024) throw Error('Backup file is too large (2 MB limit).');
  let root: unknown;
  try { root = JSON.parse(input); } catch { throw Error('Backup is not valid JSON.'); }
  const data = asRecord(root);
  if (data.app !== 'Lyric' || data.version !== 1) throw Error('Not a supported Lyric backup.');
  const backup = normalizeLibrary(data.library);
  const mergedCatalog = [...current.catalog];
  const used = new Set(mergedCatalog.map(row => row.id));
  for (const track of backup.catalog) if (!used.has(track.id)) {
    mergedCatalog.push(track); used.add(track.id);
  }
  const playlistIds = new Set(current.playlists.map(p => p.id));
  const playlists = [...current.playlists];
  for (const p of backup.playlists) {
    if (playlistIds.has(p.id)) {
      const existing = playlists.find(row => row.id === p.id)!;
      existing.trackIds = [...new Set([...existing.trackIds, ...p.trackIds])];
    } else { playlists.push({ ...p }); playlistIds.add(p.id); }
  }
  // Import is MERGE-only, never silently replaces existing playlists or settings.
  return normalizeLibrary({
    ...current, catalog: mergedCatalog,
    favorites: [...current.favorites, ...backup.favorites],
    playlists, queue: [...current.queue, ...backup.queue],
    history: [...current.history, ...backup.history]
  });
}
