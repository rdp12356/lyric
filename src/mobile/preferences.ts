import type { LyricStyle, RimLightConfig } from '../types';
export interface MobilePreferences {
  style: LyricStyle;
  rim: RimLightConfig;
  sensitivity: number;
  graphicsMode: 'smooth' | 'cinematic';
  preferredPlayer: string;
  offsets: Record<string, number>;
}
const defaults: MobilePreferences = {
  style: 'smooth-captions',
  rim: { enabled: true, mode: 'pulse', thickness: 8, blur: 30, intensity: 0.85, beatReactivity: 0.8, palettePreset: 'album-art' },
  sensitivity: 1.5, graphicsMode: 'smooth', preferredPlayer: 'com.spotify.music', offsets: {},
};
export function readPreferences(): MobilePreferences {
  try {
    const saved = JSON.parse(localStorage.getItem('lyric.mobile.preferences.v2') || '{}');
    return { ...defaults, ...saved, rim: { ...defaults.rim, ...saved.rim }, offsets: saved.offsets || {} };
  } catch { return defaults; }
}
export function writePreferences(value: MobilePreferences) {
  try { localStorage.setItem('lyric.mobile.preferences.v2', JSON.stringify(value)); } catch { /* Private mode / full storage. */ }
}
export const songKey = (title: string, artist: string, album = '', duration = 0) => [title, artist, album, String(Math.round(duration))].map(v => v.trim().toLowerCase()).join('|');
