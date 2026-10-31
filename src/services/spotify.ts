import { registerPlugin } from '@capacitor/core';
import type { AndroidPlayback } from './androidMedia';
export interface SpotifyStatus { connected: boolean; clientId: string; packageName?: string; fingerprint?: string; redirectUri?: string }
export const Spotify = registerPlugin<{
  getStatus(): Promise<SpotifyStatus>;
  connect(options: { clientId: string }): Promise<SpotifyStatus>;
  disconnect(): Promise<void>;
  getPlayback(): Promise<AndroidPlayback>;
  control(options: { action: 'play-pause' | 'next' | 'previous' | 'seek'; position?: number }): Promise<void>;
  openApp(): Promise<void>;
  openWebPlayer(options?: {uri?: string}): Promise<void>;
}>('Spotify');
