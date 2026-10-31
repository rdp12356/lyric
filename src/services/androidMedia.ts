import { Capacitor, registerPlugin } from '@capacitor/core';

export interface AndroidPlayback {
  permissionGranted: boolean;
  active: boolean;
  packageName?: string;
  title?: string;
  trackId?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
  position?: number;
  playing?: boolean;
  speed?: number;
  canSeek?: boolean;
  retryAfterMs?: number;
  players?: { packageName: string; label: string; playing: boolean }[];
}

interface AndroidMediaPlugin {
  getCapabilities(): Promise<{ musicPlayerSync: boolean }>;
  getPlayback(options?: { packageName?: string }): Promise<AndroidPlayback>;
  openSettings(): Promise<void>;
  control(options: { action: 'play-pause' | 'next' | 'previous' | 'seek'; position?: number; packageName?: string }): Promise<void>;
}

export const isAndroid = Capacitor.getPlatform() === 'android';
export const AndroidMedia = registerPlugin<AndroidMediaPlugin>('AndroidMedia');
