import type { LyricsData } from '../types';
import {
  lookupLyricsFromLRCLIB, searchLRCLIB, fetchLRCLIBLyricsById,
  type LyricsLookupIssue, type LrclibRecord
} from './lrclib';

export interface LyricsTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
}
export interface LyricsCandidate {
  provider: 'LRCLIB';
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  formats: ('lrc' | 'plain' | 'word')[];
  confidence: number;
  attribution: string;
}
export interface ProviderError {
  reason: LyricsLookupIssue;
  retryAfterSeconds?: number;
}
export interface LyricsProvider {
  readonly id: string;
  readonly supportedFormats: readonly string[];
  searchLyrics(track: LyricsTrack, signal?: AbortSignal): Promise<LyricsCandidate[]>;
  getLyrics(candidate: LyricsCandidate, track: LyricsTrack, signal?: AbortSignal): Promise<LyricsData | null>;
}
const normalized = (value: string) => value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function releaseScore(record: LrclibRecord, track: LyricsTrack): number {
  const expectedName = normalized(track.name);
  const recordName = normalized(record.trackName);
  const expectedArtist = normalized(track.artist.split(/,| feat\.? /i)[0]);
  const artist = normalized(record.artistName);
  if (!recordName || !expectedName || !recordName.includes(expectedName) && !expectedName.includes(recordName)) return 0;
  if (expectedArtist && !artist.includes(expectedArtist) && !expectedArtist.includes(artist)) return 0;
  const distance = track.duration > 0 && record.duration > 0 ? Math.abs(track.duration - record.duration) : 0;
  if (distance > 25) return 0;
  return Math.min(1,
    0.54 + (expectedName === recordName ? 0.14 : 0)
    + (normalized(track.album) === normalized(record.albumName || '') ? 0.07 : 0)
    + (distance <= 2 ? 0.12 : distance <= 10 ? 0.05 : 0)
    + (record.syncedLyrics ? 0.1 : 0.02)
    + (record.hasWordSync ? 0.03 : 0));
}
function convert(record: LrclibRecord, track: LyricsTrack): LyricsCandidate {
  const formats: LyricsCandidate['formats'] = [];
  if (record.syncedLyrics) formats.push('lrc');
  if (record.plainLyrics) formats.push('plain');
  if (record.hasWordSync) formats.push('word');
  return {
    provider: 'LRCLIB', id: record.id,
    trackName: record.trackName, artistName: record.artistName,
    albumName: record.albumName || '', duration: record.duration,
    formats, confidence: releaseScore(record, track),
    attribution: 'https://lrclib.net'
  };
}
/**
 * Provider registry deliberately contains only verified, public LRCLIB.
 * Other services must not be scraped or added until usage rights are checked.
 */
export const lyricsProviders: readonly LyricsProvider[] = [{
  id: 'LRCLIB',
  supportedFormats: ['plain', 'lrc', 'word'],
  async searchLyrics(track, signal) {
    if (signal?.aborted) return [];
    const records = await searchLRCLIB(track.name + ' ' + track.artist, signal);
    if (signal?.aborted) return [];
    return records.filter(record => record.id > 0 && (record.plainLyrics || record.syncedLyrics))
      .map(record => convert(record, track))
      .filter(candidate => candidate.confidence >= 0.55)
      .sort((a, b) => b.confidence - a.confidence);
  },
  async getLyrics(candidate, track, signal) {
    if (signal?.aborted) return null;
    const result = await fetchLRCLIBLyricsById(candidate.id, track.name, track.artist, track.album, track.duration, signal);
    if (signal?.aborted) return null;
    return result.lyrics;
  }
}];
export async function findLyrics(track: LyricsTrack, refresh = false, signal?: AbortSignal) {
  return lookupLyricsFromLRCLIB(track.name, track.artist, track.album, track.duration, { refresh, signal });
}
