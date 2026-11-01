import type { LyricsData } from '../types';

const STORE = 'lyric.offline.lyrics.v2';
const ONLINE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const lyricsKey = (title: string, artist: string, album = '', duration = 0) =>
  [title, artist, album, String(Math.round(duration))]
    .map(value => value.trim().toLowerCase()).join('|');

type Entry = { data: LyricsData; at: number };
function entries(): Record<string, Entry> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORE) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, Entry>
      : {};
  } catch {
    return {};
  }
}

/** Imported LRC files remain available offline until explicitly replaced or evicted. */
export function cachedLyrics(key: string, maxAgeMs = ONLINE_CACHE_TTL_MS): LyricsData | null {
  const entry = entries()[key];
  if (!entry?.data || !Array.isArray(entry.data.lines)) return null;
  const imported = entry.data.source?.startsWith('Imported LRC') === true;
  if (!imported && (!Number.isFinite(entry.at) || Date.now() - entry.at > maxAgeMs))
    return null;
  return entry.data;
}

export function removeCachedLyrics(key: string) {
  try {
    const values = entries();
    if (!Object.prototype.hasOwnProperty.call(values, key)) return;
    delete values[key];
    localStorage.setItem(STORE, JSON.stringify(values));
  } catch { /* Storage is optional. */ }
}

export function cacheLyrics(key: string, data: LyricsData) {
  try {
    const values = entries();
    values[key] = { data, at: Date.now() };
    const recent = Object.entries(values)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 25);
    localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(recent)));
  } catch { /* Playback must still work if storage is full or unavailable. */ }
}
