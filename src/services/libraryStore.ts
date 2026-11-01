import { useSyncExternalStore } from 'react';
import type { Track } from '../types';
import { DEMO_TRACKS } from './audioManager';
import {
  type LibraryState, type LibraryTrack, type RepeatMode,
  normalizeLibrary, initialLibrary, registerTrack, queueTrack,
  removeQueueTrack, reorderQueue, nextTrackId, markPlayed, toggleFavorite,
  addPlaylist, addToPlaylist, removeFromPlaylist, exportLibrary, mergeLibraryBackup
} from './libraryModel';

const KEY = 'lyric.music.library.v1';
const initialSeed = DEMO_TRACKS.map(track => ({
  id: track.id, title: track.title, artist: track.artist,
  album: track.album, albumArt: track.albumArt,
  duration: track.duration, source: track.source
}));
function restore(): LibraryState {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? normalizeLibrary(JSON.parse(saved), initialSeed) : initialLibrary(initialSeed);
  } catch { return initialLibrary(initialSeed); }
}
/**
 * A tiny external store using React 19's built-in subscription primitive.
 * Keeps queue/library changes independent of the 30fps playback clock.
 * No new runtime dependencies or npm lockfile churn.
 */
class LibraryStore {
  private snapshot = restore();
  private listeners = new Set<() => void>();
  private runtime = new Map<string, Track>();
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private emit() { this.listeners.forEach(listener => listener()); }
  private commit(next: LibraryState) {
    if (next === this.snapshot) return;
    this.snapshot = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Quota or privacy mode. */ }
    this.emit();
  }
  /** In-memory audio is NEVER included in backups or persisted as Blob URLs. */
  register = (track: Track, enqueue = false) => {
    this.runtime.set(track.id, track);
    const item: LibraryTrack = {
      id: track.id, title: track.title, artist: track.artist,
      album: track.album, albumArt: track.albumArt,
      duration: track.duration, source: track.source
    };
    const updated = registerTrack(this.snapshot, item);
    this.commit(enqueue ? queueTrack(updated, track.id) : updated);
  };
  getPlayable = (id: string): Track | null => {
    const transient = this.runtime.get(id);
    if (transient) return transient;
    return DEMO_TRACKS.find(track => track.id === id) || null;
  };
  getMetadata = (id: string) => this.snapshot.catalog.find(track => track.id === id);
  play = (track: Track) => {
    this.register(track, true);
    this.commit(markPlayed(this.snapshot, track.id));
  };
  markNowPlaying = (track: Track) => {
    this.register(track);
    this.commit(markPlayed(this.snapshot, track.id));
  };
  enqueue = (id: string) => this.commit(queueTrack(this.snapshot, id));
  dequeue = (id: string) => this.commit(removeQueueTrack(this.snapshot, id));
  moveQueue = (id: string, direction: -1 | 1) => this.commit(reorderQueue(this.snapshot, id, direction));
  adjacent = (currentId: string, direction: -1 | 1, automatic = false) =>
    nextTrackId(this.snapshot, currentId, direction, automatic);
  favorite = (id: string) => this.commit(toggleFavorite(this.snapshot, id));
  setShuffle = (value: boolean) => this.commit({ ...this.snapshot, shuffle: value });
  setRepeat = (value: RepeatMode) => this.commit({ ...this.snapshot, repeat: value });
  setVolume = (value: number) => {
    if (!Number.isFinite(value)) return;
    this.commit({ ...this.snapshot, volume: Math.max(0, Math.min(1, value)) });
  };
  createPlaylist = (name: string) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID() : 'playlist-' + Date.now();
    this.commit(addPlaylist(this.snapshot, name, id));
  };
  addToPlaylist = (playlistId: string, trackId: string) =>
    this.commit(addToPlaylist(this.snapshot, playlistId, trackId));
  removeFromPlaylist = (playlistId: string, trackId: string) =>
    this.commit(removeFromPlaylist(this.snapshot, playlistId, trackId));
  export = () => exportLibrary(this.snapshot);
  import = (content: string) => {
    const merged = mergeLibraryBackup(this.snapshot, content);
    this.commit(merged);
    return merged;
  };
  refreshFromStorage = () => {
    const latest = restore();
    if (JSON.stringify(latest) !== JSON.stringify(this.snapshot)) {
      this.snapshot = latest;
      this.emit();
    }
  };
}
export const libraryStore = new LibraryStore();
export function useLibrary(): LibraryState {
  return useSyncExternalStore(libraryStore.subscribe, libraryStore.getSnapshot, libraryStore.getSnapshot);
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === KEY) libraryStore.refreshFromStorage();
  });
}
