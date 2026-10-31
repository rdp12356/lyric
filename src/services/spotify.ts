import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { AndroidPlayback } from './androidMedia';
export interface SpotifyStatus { phase?: string; connected: boolean; autoReconnect?: boolean; clientId: string; packageName?: string; fingerprint?: string; redirectUri?: string }
export const Spotify = registerPlugin<{
  getStatus(): Promise<SpotifyStatus>;
  connectBrowser(options: { clientId: string }): Promise<SpotifyStatus>;
  connect(options: { clientId: string }): Promise<SpotifyStatus>;
  reconnect(): Promise<SpotifyStatus>;
  setAutoReconnect(options: { enabled: boolean }): Promise<SpotifyStatus>;
  disconnect(): Promise<void>;
  getPlayback(): Promise<AndroidPlayback>;
  addListener(eventName: 'playerState', listener: (state: AndroidPlayback) => void): Promise<PluginListenerHandle>;
  control(options: { action: 'play-pause' | 'next' | 'previous' | 'seek'; position?: number }): Promise<void>;
  openApp(): Promise<void>;
}>('Spotify');
