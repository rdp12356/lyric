import { LyricsData } from '../types';
import { cachedLyrics, cacheLyrics, lyricsKey } from './lyricsCache';
import { parseLRC, convertPlainToEstimatedLines } from './lrcParser';

interface LrclibRecord {
  id: number;
  name?: string;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration: number;
  instrumental: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export type LyricsLookupIssue = 'not-found' | 'instrumental' | 'network' | 'rate-limited' | 'service-error';
export interface LyricsLookupResult {
  lyrics: LyricsData | null;
  issue?: LyricsLookupIssue;
  retryAfterSeconds?: number;
}

const lyricsCache = new Map<string, LyricsData>();
const CLIENT_ID = 'Lyric/1.3.0 (+https://github.com/rdp12356/lyric)';
let rateLimitUntil = 0;
const normalize = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const cleanTitle = (s: string) => s.trim()
  .replace(/\s*[\[(](?:feat(?:uring)?\.?|ft\.?|with)\s+[^\])]+[\])]/gi, '')
  .replace(/\s*[\[(](?:\d{4}\s*)?(?:re-?master(?:ed)?|live|radio edit|single version|album version|deluxe|explicit|clean|mono|stereo|sped up|slowed|official audio|official video)[^\])]*[\])]/gi, '')
  .replace(/\s+[-–—]\s+(?:(?:\d{4}\s*)?re-?master(?:ed)?|live(?:\s+at\s+.+)?|radio edit|single version|deluxe|official (?:audio|video)).*$/gi, '')
  .trim();
const mainArtist = (s: string) => s.trim().split(/\s+(?:feat(?:uring)?\.?|ft\.?|with)\s+|,|;|\s+&\s+/i)[0].trim();
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

type ApiResult = { status: 'ok'; data: unknown } | { status: 'not-found' | 'network' | 'service-error' | 'rate-limited'; retryAfterSeconds?: number };
async function api(path: string): Promise<ApiResult> {
  if (Date.now() < rateLimitUntil) return { status: 'rate-limited', retryAfterSeconds: Math.ceil((rateLimitUntil - Date.now()) / 1000) };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch('https://lrclib.net' + path, {
      headers: { 'Lrclib-Client': CLIENT_ID },
      signal: controller.signal
    });
    if (res.status === 404) return { status: 'not-found' };
    if (res.status === 429) {
      const raw = res.headers.get('Retry-After') || '';
      const numeric = Number(raw);
      const seconds = raw && Number.isFinite(numeric) ? numeric : Math.max(0, (Date.parse(raw) - Date.now()) / 1000);
      const retryAfterSeconds = Math.max(1, Math.ceil(Number.isFinite(seconds) ? seconds : 30));
      rateLimitUntil = Date.now() + retryAfterSeconds * 1000;
      return { status: 'rate-limited', retryAfterSeconds };
    }
    if (!res.ok) return { status: 'service-error' };
    return { status: 'ok', data: await res.json() };
  } catch {
    return { status: 'network' };
  } finally {
    clearTimeout(timeout);
  }
}

function validRecord(value: unknown): value is LrclibRecord {
  return !!value && typeof value === 'object'
    && typeof (value as LrclibRecord).trackName === 'string'
    && typeof (value as LrclibRecord).artistName === 'string';
}

function matchScore(record: LrclibRecord, title: string, artist: string, album: string, duration: number): number {
  const expectedTitle = normalize(cleanTitle(title));
  const candidateTitle = normalize(cleanTitle(record.trackName || record.name || ''));
  if (!expectedTitle || !candidateTitle) return -Infinity;
  // Do not silently substitute a similarly named but different song.
  if (candidateTitle !== expectedTitle) return -Infinity;
  const expectedArtist = normalize(mainArtist(artist));
  const actualArtist = normalize(record.artistName);
  if (expectedArtist && (!actualArtist || !(actualArtist.includes(expectedArtist) || expectedArtist.includes(actualArtist)))) return -Infinity;
  const delta = duration > 0 && record.duration > 0 ? Math.abs(record.duration - duration) : 0;
  const albumBonus = album && record.albumName && normalize(album) === normalize(record.albumName) ? 12 : 0;
  const durationScore = duration > 0 && record.duration > 0 ? (delta <= 2 ? 18 : delta <= 15 ? 7 : delta > 35 ? -25 : -5) : 0;
  return 100 + albumBonus + durationScore + (record.syncedLyrics ? 45 : 0) + (record.plainLyrics ? 5 : 0);
}

function asLyrics(record: LrclibRecord, title: string, artist: string, album: string, duration: number): LyricsData | null {
  const durationSeconds = duration || record.duration || 180;
  if (record.syncedLyrics) {
    const lines = parseLRC(record.syncedLyrics, durationSeconds);
    if (lines.length) return {
      id: record.id,
      trackName: record.trackName || title,
      artistName: record.artistName || artist,
      albumName: record.albumName || album,
      synced: true,
      hasWordSync: false, // The LRC parser estimates word times unless enhanced timestamps exist.
      lines,
      plainText: record.plainLyrics || undefined,
      source: 'LRCLIB'
    };
  }
  if (record.plainLyrics) {
    const lines = convertPlainToEstimatedLines(record.plainLyrics, durationSeconds);
    if (lines.length) return {
      id: record.id,
      trackName: record.trackName || title,
      artistName: record.artistName || artist,
      albumName: record.albumName || album,
      synced: false,
      lines,
      plainText: record.plainLyrics,
      source: 'LRCLIB (estimated timing)'
    };
  }
  return null;
}

/**
 * Return lyrics and an explicit reason when none are available.
 * Spotify supplies only track metadata/playback; lyrics come from LRCLIB.
 */
export async function lookupLyricsFromLRCLIB(
  trackName: string, artistName: string, albumName = '', duration = 0
): Promise<LyricsLookupResult> {
  const title = cleanTitle(trackName);
  const artist = mainArtist(artistName);
  if (!title || !artist) return { lyrics: null, issue: 'not-found' };
  const key = lyricsKey(title, artist, albumName, duration);
  const stored = cachedLyrics(key) || lyricsCache.get(key);
  if (stored) return { lyrics: stored };

  const exactParams = new URLSearchParams({ track_name: title, artist_name: artist });
  if (albumName) exactParams.set('album_name', albumName);
  if (duration > 0 && duration <= 3600) exactParams.set('duration', String(Math.round(duration)));

  const looseParams = new URLSearchParams({ track_name: title, artist_name: artist });
  const searchParams = new URLSearchParams({ track_name: title, artist_name: artist });
  const broadParams = new URLSearchParams({ q: title + ' ' + artist });

  const paths = [
    '/api/get?' + exactParams,
    '/api/get?' + looseParams,
    '/api/search?' + searchParams,
    '/api/search?' + broadParams
  ].filter((path, idx, all) => all.indexOf(path) === idx);

  const candidates = new Map<number, LrclibRecord>();
  let networkFailed = false, serviceFailed = false, instrumentalFound = false;
  for (let i = 0; i < paths.length; i++) {
    if (i > 0) await delay(250);
    const response = await api(paths[i]);
    if (response.status === 'rate-limited') return { lyrics: null, issue: 'rate-limited', retryAfterSeconds: response.retryAfterSeconds };
    if (response.status === 'network') { networkFailed = true; break; }
    if (response.status === 'service-error') { serviceFailed = true; continue; }
    if (response.status !== 'ok') continue;
    const records = Array.isArray(response.data) ? response.data : [response.data];
    for (const item of records) {
      if (!validRecord(item) || !Number.isFinite(matchScore(item, title, artist, albumName, duration))) continue;
      if (item.instrumental && !item.plainLyrics && !item.syncedLyrics) instrumentalFound = true;
      else candidates.set(item.id, item);
    }
    if (i <= 1 && [...candidates.values()].some(record => !!record.syncedLyrics)) break;
  }

  const ranked = [...candidates.values()].sort(
    (a, b) => matchScore(b, title, artist, albumName, duration) - matchScore(a, title, artist, albumName, duration)
  );
  for (const record of ranked) {
    const lyrics = asLyrics(record, trackName, artistName, albumName, duration);
    if (lyrics) {
      lyricsCache.set(key, lyrics);
      cacheLyrics(key, lyrics);
      return { lyrics };
    }
  }
  if (networkFailed) return { lyrics: null, issue: 'network' };
  if (serviceFailed) return { lyrics: null, issue: 'service-error' };
  return { lyrics: null, issue: instrumentalFound ? 'instrumental' : 'not-found' };
}

/** Compatibility API for the web / desktop player. */
export async function fetchLyricsFromLRCLIB(
  trackName: string, artistName: string, albumName = '', duration = 0
): Promise<LyricsData | null> {
  return (await lookupLyricsFromLRCLIB(trackName, artistName, albumName, duration)).lyrics;
}

export async function searchLRCLIB(query: string): Promise<LrclibRecord[]> {
  if (!query.trim()) return [];
  const response = await api('/api/search?' + new URLSearchParams({ q: query.trim() }));
  return response.status === 'ok' && Array.isArray(response.data)
    ? response.data.filter(validRecord)
    : [];
}
