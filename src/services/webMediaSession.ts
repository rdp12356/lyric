import type { Track } from '../types';

export interface WebMediaActions {
  playPause(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
}
function supported(): MediaSession | null {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
    ? navigator.mediaSession : null;
}
function artwork(url: string): MediaImage[] {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'blob:') return [];
    return [{ src: parsed.href, sizes: '512x512', type: 'image/jpeg' }];
  } catch { return []; }
}
/** Only advertise media that Lyric actually plays; external Spotify remains separate. */
export function setLyricMediaMetadata(track: Track | null, playing: boolean) {
  const session = supported();
  if (!session) return;
  if (!track || track.source.startsWith('macos-') || track.source === 'spotify-web'
    || track.source === 'android-media') {
    session.metadata = null;
    session.playbackState = 'none';
    return;
  }
  try {
    if (typeof MediaMetadata !== 'undefined') {
      session.metadata = new MediaMetadata({
        title: track.title, artist: track.artist,
        album: track.album, artwork: artwork(track.albumArt)
      });
    }
    session.playbackState = playing ? 'playing' : 'paused';
  } catch { /* Optional browser APIs must never interrupt playback. */ }
}
export function setLyricMediaPosition(position: number, duration: number, playing: boolean) {
  const session = supported();
  if (!session || typeof session.setPositionState !== 'function') return;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;
  try {
    session.setPositionState({
      duration,
      playbackRate: 1,
      position: Math.max(0, Math.min(duration, position))
    });
  } catch { /* Some mobile browsers reject unsupported playbackRate/position updates. */ }
}
export function attachLyricMediaControls(read: () => WebMediaActions): () => void {
  const session = supported();
  if (!session || typeof session.setActionHandler !== 'function') return () => {};
  const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>> = {
    play: () => read().playPause(),
    pause: () => read().playPause(),
    nexttrack: () => read().next(),
    previoustrack: () => read().previous(),
    seekto: event => {
      if (Number.isFinite(event.seekTime)) read().seek(event.seekTime as number);
    }
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try { session.setActionHandler(action as MediaSessionAction, handler || null); }
    catch { /* Unsupported media-button action. */ }
  }
  return () => {
    for (const action of Object.keys(handlers)) {
      try { session.setActionHandler(action as MediaSessionAction, null); }
      catch { /* Ignore optional API differences. */ }
    }
    session.metadata = null;
    session.playbackState = 'none';
  };
}
