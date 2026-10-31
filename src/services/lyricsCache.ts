import type { LyricsData } from '../types';
const STORE = 'lyric.offline.lyrics.v2';
export const lyricsKey = (title: string, artist: string, album = '', duration = 0) => [title, artist, album, String(Math.round(duration))].map(v => v.trim().toLowerCase()).join('|');
export function cachedLyrics(key: string): LyricsData | null {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}')[key]?.data || null; } catch { return null; }
}
export function cacheLyrics(key: string, data: LyricsData) {
  try {
    const values = JSON.parse(localStorage.getItem(STORE) || '{}');
    values[key] = { data, at: Date.now() };
    const recent = Object.entries(values).sort((a: any, b: any) => b[1].at - a[1].at).slice(0, 25);
    localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(recent)));
  } catch { /* Playback must still work if storage is full or unavailable. */ }
}
