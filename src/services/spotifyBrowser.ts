/** Accept only Spotify track links; never pass an arbitrary URL into an iframe. */
export function spotifyTrackUri(value: string): string | null {
  const input = value.trim();
  if (/^spotify:track:[A-Za-z0-9]{22}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})\/?$/);
    return match ? `spotify:track:${match[1]}` : null;
  } catch { return null; }
}
export interface BrowserPlayback { position: number; duration: number; playing: boolean }
export interface SpotifyEmbedController {
  addListener(event: string, callback: (event: {data: any}) => void): void;
  removeListener?(event: string, callback: (event: {data: any}) => void): void;
  togglePlay(): void;
  seek(seconds: number): void;
  destroy(): void;
}
