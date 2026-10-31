export type AudioSourceType =
  | 'android-media'
  | 'demo'
  | 'macos-music'
  | 'macos-spotify'
  | 'spotify-web'
  | 'local-file'
  | 'search';

export interface WordTiming {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
}

export interface LyricLine {
  id: number;
  time: number;       // in seconds
  endTime: number;    // in seconds
  text: string;
  words?: WordTiming[];
}

export interface LyricsData {
  id?: number | string;
  trackName: string;
  artistName: string;
  albumName?: string;
  synced: boolean;
  hasWordSync?: boolean;
  lines: LyricLine[];
  plainText?: string;
  source?: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  duration: number; // in seconds
  position: number; // in seconds
  isPlaying: boolean;
  source: AudioSourceType;
  audioUrl?: string;
  badge?: string;
}

export interface ColorPalette {
  dominant: string;
  secondary: string;
  accent: string;
  dark: string;
  light: string;
  glow: string;
}

export type RimMode = 'aurora' | 'pulse' | 'wave' | 'liquid' | 'static';
export type PalettePreset = 'album-art' | 'neon' | 'sunset' | 'indigo' | 'emerald' | 'amber' | 'monochrome';

export type LyricStyle =
  | 'verci-single-word' // Signature Verci: One massive word at a time with spring physics
  | 'smooth-captions'   // Dynamic viral caption pop: word bounces & glows in sentence
  | 'cinematic'         // Apple Music multi-line fluid typography
  | 'perspective-3d';   // 3D perspective wall

export type FontSizeSetting = 'normal' | 'large' | 'massive';
export type LayoutMode = 'split' | 'lockscreen' | 'fullscreen-lyrics' | 'mini-island' | 'rim-only';

export interface RimLightConfig {
  enabled: boolean;
  mode: RimMode;
  thickness: number;
  blur: number;
  intensity: number;
  beatReactivity: number;
  palettePreset: PalettePreset;
  customPalette?: Partial<ColorPalette>;
}

export interface LyricConfig {
  style: LyricStyle;
  fontSize: FontSizeSetting;
  wordSync: boolean;
  syncOffset: number; // in ms (-5000 to +5000)
  autoScroll: boolean;
}

export interface MacOSNowPlayingResponse {
  activeApp: 'Music' | 'Spotify' | 'none';
  state: 'playing' | 'paused' | 'stopped' | 'not_running';
  track: string;
  artist: string;
  album: string;
  position: number;
  duration: number;
  artworkUrl?: string;
  latencyMs?: number;
  sampledAt?: number;
  error?: string;
}
