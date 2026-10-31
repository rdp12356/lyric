import { LyricsData } from '../types';
import { cachedLyrics, cacheLyrics, lyricsKey } from './lyricsCache';
import { parseLRC, convertPlainToEstimatedLines } from './lrcParser';

interface LrclibRecord {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration: number;
  instrumental: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
}

const lyricsCache = new Map<string, LyricsData>();

/**
 * Fetch lyrics from LRCLIB for a given track
 */
export async function fetchLyricsFromLRCLIB(
  trackName: string,
  artistName: string,
  albumName: string = '',
  duration: number = 0
): Promise<LyricsData | null> {
  // Normalize key for caching
  const cleanTrack = trackName.trim().replace(/\(feat\..*?\)/i, '').replace(/\[.*?\]/g, '').trim();
  const cleanArtist = artistName.trim().split(/[,&]/)[0].trim();
  const cacheKey = lyricsKey(cleanTrack, cleanArtist, albumName, duration);
  const stored = cachedLyrics(cacheKey);
  if (stored) return stored;
  const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const pick = (records: LrclibRecord[]) => records.filter(r => {
    const title = normalize(r.trackName || r.name || ""), artist = normalize(r.artistName || "");
    return title === normalize(cleanTrack) && (!cleanArtist || artist.includes(normalize(cleanArtist)));
  }).sort((a, b) => (duration ? Math.abs(a.duration - duration) - Math.abs(b.duration - duration) : 0) + (a.syncedLyrics ? 0 : 30) - (b.syncedLyrics ? 0 : 30))[0] || null;

  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey)!;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    // 1. Try exact get endpoint first
    const params = new URLSearchParams({
      track_name: cleanTrack,
      artist_name: cleanArtist
    });
    if (albumName) params.append('album_name', albumName);
    if (duration > 0) params.append('duration', Math.round(duration).toString());

    let record: LrclibRecord | null = null;

    try {
      const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, { signal: controller.signal });
      if (res.ok) {
        record = await res.json();
      }
    } catch (e) {
      console.warn('LRCLIB exact get failed, trying search fallback...', e);
    }

    // 2. Fallback to search endpoint if exact match wasn't found
    if (!record || (!record.syncedLyrics && !record.plainLyrics)) {
      const searchRes = await fetch(
        `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTrack)}&artist_name=${encodeURIComponent(cleanArtist)}`, { signal: controller.signal }
      );
      if (searchRes.ok) {
        const searchResults: LrclibRecord[] = await searchRes.json();
        if (searchResults && searchResults.length > 0) {
          // Prefer record with syncedLyrics
          record = pick(searchResults);
        }
      }
    }

    // 3. Fallback to broad query search
    if (!record || (!record.syncedLyrics && !record.plainLyrics)) {
      const broadRes = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTrack} ${cleanArtist}`)}`, { signal: controller.signal }
      );
      if (broadRes.ok) {
        const broadResults: LrclibRecord[] = await broadRes.json();
        if (broadResults && broadResults.length > 0) {
          record = pick(broadResults);
        }
      }
    }

    if (!record) {
      return null;
    }

    let lyricsData: LyricsData;

    if (record.syncedLyrics) {
      const lines = parseLRC(record.syncedLyrics, duration || record.duration);
      lyricsData = {
        id: record.id,
        trackName: record.trackName || trackName,
        artistName: record.artistName || artistName,
        albumName: record.albumName || albumName,
        synced: true,
        hasWordSync: lines.some(l => l.words && l.words.length > 0),
        lines,
        plainText: record.plainLyrics,
        source: 'LRCLIB'
      };
    } else if (record.plainLyrics) {
      const lines = convertPlainToEstimatedLines(record.plainLyrics, duration || record.duration || 180);
      lyricsData = {
        id: record.id,
        trackName: record.trackName || trackName,
        artistName: record.artistName || artistName,
        albumName: record.albumName || albumName,
        synced: false,
        lines,
        plainText: record.plainLyrics,
        source: 'LRCLIB (plain)'
      };
    } else {
      return null;
    }

    lyricsCache.set(cacheKey, lyricsData);
    cacheLyrics(cacheKey, lyricsData);
    return lyricsData;
  } catch (err) {
    console.error('Error fetching lyrics from LRCLIB:', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Search LRCLIB for multiple matching tracks
 */
export async function searchLRCLIB(query: string): Promise<LrclibRecord[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return [];
    const results: LrclibRecord[] = await res.json();
    return results || [];
  } catch (e) {
    console.error('LRCLIB search error:', e);
    return [];
  }
}
