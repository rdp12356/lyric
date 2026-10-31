import { registerPlugin } from '@capacitor/core';
import type { AudioEnergy } from './beatEnvelope';
export const AudioInput = registerPlugin<{
  start(): Promise<void>;
  stop(): Promise<void>;
  getEnergy(): Promise<AudioEnergy & { active: boolean }>;
}>('AudioInput');

import { spectrumEnergy, SILENCE } from './beatEnvelope';
export class WebMicrophone {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private bins: Uint8Array<ArrayBuffer> | null = null;
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.context = new AudioContext(); this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 2048;
    this.context.createMediaStreamSource(this.stream).connect(this.analyser);
    this.bins = new Uint8Array(this.analyser.frequencyBinCount); await this.context.resume();
  }
  energy() {
    if (!this.analyser || !this.bins || !this.context) return SILENCE;
    this.analyser.getByteFrequencyData(this.bins);
    return spectrumEnergy(this.bins, this.context.sampleRate, this.analyser.fftSize);
  }
  stop() { this.stream?.getTracks().forEach(t => t.stop()); void this.context?.close(); this.stream = null; this.context = null; this.analyser = null; }
}
