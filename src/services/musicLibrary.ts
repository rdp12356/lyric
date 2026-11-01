import { useSyncExternalStore } from 'react';
import type { Track, AudioSourceType } from '../types';

export type RepeatMode = 'off' | 'all' | 'one';
export type SavedTrack = Pick<Track, 'id' | 'title' | 'artist' | 'album' | 'albumArt' | 'duration' | 'source'> & { audioUrl?: string };
export interface SavedPlaylist {
  id: string;
  name: string;
  tracks: SavedTrack[];
  createdAt: number;
}
export interface MusicLibraryState {
  version: 1;
  queue: SavedTrack[];
  currentId: string | null;
  shuffle: boolean;
  repeat: RepeatMode;
  shuffleHistory: string[];
  favorites: SavedTrack[];
  playlists: SavedPlaylist[];
  recent: SavedTrack[];
}
export interface LibraryBackup {
  schema: 'lyric.music-library';
  version: 1;
  exportedAt: string;
  library: MusicLibraryState;
}

const KEY = 'lyric.music-library.v1';
// Session-only file handles: never serialized, and invalid after a browser restart.
const localSessionAudio = new Map<string, string>();
const validSources: readonly AudioSourceType[] = [
  'demo', 'search', 'local-file', 'spotify-web', 'android-media', 'macos-music', 'macos-spotify'
];
const empty = (): MusicLibraryState => ({
  version: 1, queue: [], currentId: null, shuffle: false, repeat: 'off',
  shuffleHistory: [], favorites: [], playlists: [], recent: []
});
const cleanText = (input: unknown, max: number): string => typeof input === 'string'
  ? input.trim().slice(0, max) : '';
const safeHttps = (input: unknown): string => {
  if (typeof input !== 'string' || input.length > 2048) return '';
  try {
    const url = new URL(input);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
};
const allowPreview = (value: string) => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'audio-ssl.itunes.apple.com' || host === 'audio.itunes.apple.com';
  } catch { return false; }
};

/** Save metadata, never ephemeral blob URLs, credentials or arbitrary network URLs. */
export function sanitizeTrack(input: unknown): SavedTrack | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  const id = cleanText(candidate.id, 180);
  const title = cleanText(candidate.title, 180);
  if (!id || !title || !validSources.includes(candidate.source as AudioSourceType)) return null;
  const audioUrl = safeHttps(candidate.audioUrl);
  const duration = Number(candidate.duration);
  return {
    id, title,
    artist: cleanText(candidate.artist, 180),
    album: cleanText(candidate.album, 180),
    albumArt: safeHttps(candidate.albumArt),
    duration: Number.isFinite(duration) ? Math.max(0, Math.min(duration, 86400)) : 0,
    source: candidate.source as AudioSourceType,
    ...(audioUrl && allowPreview(audioUrl) && (candidate.source === 'demo' || candidate.source === 'search') ? { audioUrl } : {})
  };
}
const safeTracks = (input: unknown, max: number): SavedTrack[] => {
  if (!Array.isArray(input)) return [];
  const unique = new Map<string, SavedTrack>();
  for (const value of input.slice(0, max * 3)) {
    const track = sanitizeTrack(value);
    if (track && !unique.has(track.id)) unique.set(track.id, track);
    if (unique.size >= max) break;
  }
  return [...unique.values()];
};
const safeStringIds = (input: unknown): string[] => Array.isArray(input)
  ? input.filter((x): x is string => typeof x === 'string').slice(-200) : [];
const cleanState = (input: unknown): MusicLibraryState => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return empty();
  const v = input as Partial<MusicLibraryState>;
  const queue = safeTracks(v.queue, 200);
  const playlists: SavedPlaylist[] = [];
  if (Array.isArray(v.playlists)) {
    const used = new Set<string>();
    for (const row of v.playlists.slice(0, 80)) {
      if (!row || typeof row !== 'object') continue;
      const id = cleanText(row.id, 80);
      const name = cleanText(row.name, 120);
      if (!id || !name || used.has(id)) continue;
      used.add(id);
      const timestamp = Number(row.createdAt);
      playlists.push({
        id, name, tracks: safeTracks(row.tracks, 300),
        createdAt: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now()
      });
    }
  }
  const current = typeof v.currentId === 'string' && queue.some(x => x.id === v.currentId)
    ? v.currentId : null;
  return {
    version: 1,
    queue,
    currentId: current,
    shuffle: v.shuffle === true,
    repeat: v.repeat === 'all' || v.repeat === 'one' ? v.repeat : 'off',
    shuffleHistory: safeStringIds(v.shuffleHistory).filter(id => queue.some(x => x.id === id)),
    favorites: safeTracks(v.favorites, 500),
    playlists,
    recent: safeTracks(v.recent, 80)
  };
};
function fromStorage(): MusicLibraryState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 4 * 1024 * 1024) return empty();
    return cleanState(JSON.parse(raw));
  } catch { return empty(); }
}
function save(state: MusicLibraryState) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { /* In-memory playback still works if private storage is unavailable. */ }
}
const addUnique = (tracks: SavedTrack[], value: SavedTrack, max: number) =>
  [value, ...tracks.filter(track => track.id !== value.id)].slice(0, max);

export class MusicLibraryStore {
  private state: MusicLibraryState;
  private listeners = new Set<() => void>();
  private random: () => number;
  constructor(initial?: MusicLibraryState, random: () => number = Math.random) {
    this.state = initial ? cleanState(initial) : fromStorage();
    this.random = random;
  }
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  readonly getSnapshot = () => this.state;
  private update(change: (current: MusicLibraryState) => MusicLibraryState) {
    this.state = cleanState(change(this.state));
    save(this.state);
    this.listeners.forEach(fn => fn());
  }
  queueTrack(input: Track | SavedTrack): boolean {
    const track = sanitizeTrack(input);
    if (!track) return false;
    this.update(s => ({
      ...s, queue: s.queue.some(t => t.id === track.id) ? s.queue : [...s.queue, track].slice(0, 200),
    }));
    return true;
  }
  /** Mark a restored queue selection without falsely recording a song as played. */
  selectQueueItem(id: string) {
    if (!this.state.queue.some(t => t.id === id)) return;
    this.update(s => ({ ...s, currentId: id }));
  }
  playNow(input: Track | SavedTrack): SavedTrack | null {
    const track = sanitizeTrack(input);
    if (!track) return null;
    if (track.source === 'local-file' && typeof input.audioUrl === 'string'
      && input.audioUrl.startsWith('blob:') && input.audioUrl.length < 2048) {
      localSessionAudio.set(track.id, input.audioUrl);
    }
    this.update(s => {
      const queue = s.queue.some(t => t.id === track.id) ?
        s.queue.map(t => t.id === track.id ? track : t) : [...s.queue, track].slice(-200);
      return {
        ...s, queue, currentId: track.id,
        shuffleHistory: s.shuffleHistory[s.shuffleHistory.length - 1] === track.id ? s.shuffleHistory : [...s.shuffleHistory, track.id].slice(-200),
        recent: addUnique(s.recent, track, 80)
      };
    });
    return track;
  }
  removeFromQueue(id: string) {
    this.update(s => ({
      ...s, queue: s.queue.filter(t => t.id !== id),
      currentId: s.currentId === id ? null : s.currentId,
      shuffleHistory: s.shuffleHistory.filter(item => item !== id)
    }));
  }
  reorderQueue(from: number, to: number) {
    this.update(s => {
      if (!Number.isInteger(from) || !Number.isInteger(to)
          || from < 0 || to < 0 || from >= s.queue.length || to >= s.queue.length || from === to) return s;
      const queue = [...s.queue];
      const [item] = queue.splice(from, 1);
      queue.splice(to, 0, item);
      return { ...s, queue };
    });
  }
  clearQueue() {
    this.update(s => ({ ...s, queue: [], currentId: null, shuffleHistory: [] }));
  }
  setShuffle(value: boolean) {
    this.update(s => ({ ...s, shuffle: value, shuffleHistory: s.currentId ? [s.currentId] : [] }));
  }
  setRepeat(value: RepeatMode) {
    this.update(s => ({ ...s, repeat: value }));
  }
  /** Returns null when repeat=off and the queue has reached its end. */
  nextTrack(ended = false): SavedTrack | null {
    const s = this.state;
    if (!s.queue.length) return null;
    const at = s.queue.findIndex(t => t.id === s.currentId);
    if (ended && s.repeat === 'one' && at >= 0) return s.queue[at];
    let target: SavedTrack | undefined;
    if (s.shuffle && s.queue.length > 1) {
      let options = s.queue.filter(t => t.id !== s.currentId && !s.shuffleHistory.includes(t.id));
      if (!options.length && s.repeat === 'all') {
        options = s.queue.filter(t => t.id !== s.currentId);
        this.update(old => ({ ...old, shuffleHistory: old.currentId ? [old.currentId] : [] }));
      }
      if (!options.length) return null;
      target = options[Math.min(options.length - 1, Math.floor(this.random() * options.length))];
    } else {
      const next = at + 1;
      target = s.queue[next] || (s.repeat === 'all' ? s.queue[0] : undefined);
    }
    return target ? this.playNow(target) : null;
  }
  previousTrack(): SavedTrack | null {
    const s = this.state;
    const at = s.queue.findIndex(t => t.id === s.currentId);
    const previous = s.shuffle && s.shuffleHistory.length > 1
      ? s.queue.find(t => t.id === s.shuffleHistory[s.shuffleHistory.length - 2])
      : s.queue[at - 1] || (s.repeat === 'all' ? s.queue[s.queue.length - 1] : undefined);
    return previous ? this.playNow(previous) : null;
  }
  /** Remember externally playing Spotify/Android tracks without queueing audio. */
  rememberTrack(input: Track | SavedTrack) {
    const track = sanitizeTrack(input);
    if (!track) return;
    if (this.state.recent[0]?.id === track.id) return;
    this.update(s => ({ ...s, recent: addUnique(s.recent, track, 80) }));
  }
  isFavorite(id: string): boolean { return this.state.favorites.some(t => t.id === id); }
  toggleFavorite(input: Track | SavedTrack) {
    const track = sanitizeTrack(input);
    if (!track) return;
    this.update(s => ({
      ...s, favorites: s.favorites.some(t => t.id === track.id)
        ? s.favorites.filter(t => t.id !== track.id) : addUnique(s.favorites, track, 500)
    }));
  }
  createPlaylist(name: string): string | null {
    const safe = cleanText(name, 120);
    if (!safe || this.state.playlists.length >= 80) return null;
    const id = 'list-' + (globalThis.crypto?.randomUUID?.() || String(Date.now()) + '-' + String(Math.random()));
    this.update(s => ({
      ...s, playlists: [...s.playlists, { id, name: safe, tracks: [], createdAt: Date.now() }]
    }));
    return id;
  }
  renamePlaylist(id: string, name: string) {
    const safe = cleanText(name, 120);
    if (!safe) return;
    this.update(s => ({ ...s, playlists: s.playlists.map(p => p.id === id ? { ...p, name: safe } : p) }));
  }
  deletePlaylist(id: string) {
    this.update(s => ({ ...s, playlists: s.playlists.filter(p => p.id !== id) }));
  }
  addToPlaylist(id: string, input: Track | SavedTrack) {
    const track = sanitizeTrack(input);
    if (!track) return;
    this.update(s => ({
      ...s, playlists: s.playlists.map(p => p.id !== id ? p :
        { ...p, tracks: p.tracks.some(t => t.id === track.id) ? p.tracks :
          [...p.tracks, track].slice(0, 300) })
    }));
  }
  removeFromPlaylist(id: string, trackId: string) {
    this.update(s => ({
      ...s, playlists: s.playlists.map(p => p.id !== id ? p :
        { ...p, tracks: p.tracks.filter(t => t.id !== trackId) })
    }));
  }
  exportBackup(): string {
    const backup: LibraryBackup = {
      schema: 'lyric.music-library', version: 1,
      exportedAt: new Date().toISOString(), library: this.state
    };
    return JSON.stringify(backup, null, 2);
  }
  /** Explicitly merge with existing local data by default; never touches Spotify OAuth. */
  restoreBackup(raw: string, merge = true): { playlists: number; favorites: number; queue: number } {
    if (raw.length > 4 * 1024 * 1024) throw new Error('Backup exceeds the 4 MB size limit.');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error('Backup is not valid JSON.'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Not a Lyric backup.');
    const backup = parsed as Partial<LibraryBackup>;
    if (backup.schema !== 'lyric.music-library' || backup.version !== 1
        || !backup.library || !Array.isArray(backup.library.playlists)
        || !Array.isArray(backup.library.queue) || !Array.isArray(backup.library.favorites)) {
      throw new Error('Unsupported Lyric backup schema.');
    }
    const incoming = cleanState(backup.library);
    this.update(existing => {
      if (!merge) return incoming;
      const playlistMap = new Map(existing.playlists.map(p => [p.id, p]));
      for (const p of incoming.playlists) {
        const previous = playlistMap.get(p.id);
        playlistMap.set(p.id, previous ? {
          ...previous, tracks: safeTracks([...previous.tracks, ...p.tracks], 300)
        } : p);
      }
      return {
        ...existing,
        queue: safeTracks([...existing.queue, ...incoming.queue], 200),
        favorites: safeTracks([...existing.favorites, ...incoming.favorites], 500),
        playlists: [...playlistMap.values()].slice(0, 80),
        recent: safeTracks([...existing.recent, ...incoming.recent], 80),
        currentId: existing.currentId || incoming.currentId,
      };
    });
    return { playlists: incoming.playlists.length, favorites: incoming.favorites.length, queue: incoming.queue.length };
  }
}
export const musicLibrary = new MusicLibraryStore();

/** React's native useSyncExternalStore gives fine-grained updates without a new dependency. */
export function useMusicLibrary() {
  return useSyncExternalStore(musicLibrary.subscribe, musicLibrary.getSnapshot, musicLibrary.getSnapshot);
}
export function playbackTrack(saved: SavedTrack): Track {
  return {
    ...saved,
    ...(saved.source === 'local-file' && localSessionAudio.has(saved.id)
      ? { audioUrl: localSessionAudio.get(saved.id) } : {}),
    position: 0, isPlaying: false
  };
}
export function canPlaySavedTrack(track: SavedTrack): boolean {
  if (track.source === 'local-file') return localSessionAudio.has(track.id);
  if (track.source !== 'demo' && track.source !== 'search') return false;
  return !!track.audioUrl || (track.source === 'demo' && track.id.startsWith('demo-'));
}
