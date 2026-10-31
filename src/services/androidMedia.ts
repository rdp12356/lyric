import { Capacitor, registerPlugin } from '@capacitor/core';

export interface AndroidPlayback {
  permissionGranted: boolean;
  active: boolean;
  packageName?: string;
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
  position?: number;
  playing?: boolean;
}

interface AndroidMediaPlugin {
  getCapabilities(): Promise<{ musicPlayerSync: boolean }>;
  getPlayback(): Promise<AndroidPlayback>;
  openSettings(): Promise<void>;
  control(options: { action: 'play-pause' | 'next' | 'previous' | 'seek'; position?: number }): Promise<void>;
}

export const isAndroid = Capacitor.getPlatform() === 'android';
export const AndroidMedia = registerPlugin<AndroidMediaPlugin>('AndroidMedia');
