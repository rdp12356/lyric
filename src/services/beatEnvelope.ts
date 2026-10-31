export interface AudioEnergy { bass: number; mid: number; treble: number; overall: number; beat?: number }
export const SILENCE: AudioEnergy = { bass: 0, mid: 0, treble: 0, overall: 0, beat: 0 };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Attack/release envelope and adaptive onset detection. Silence never creates a beat. */
export class BeatEnvelope {
  private average = 0;
  private lastBeat = -1000;
  private at = 0;
  private state: AudioEnergy = { ...SILENCE };
  update(input: AudioEnergy, now: number, sensitivity = 1) {
    const dt = Math.min(100, Math.max(1, now - this.at)); this.at = now;
    const bass = clamp(input.bass * sensitivity);
    const onset = bass > 0.08 && bass > this.state.bass + 0.045 && bass > this.average * 1.45 + 0.035 && now - this.lastBeat > 180;
    this.average += (bass - this.average) * (1 - Math.exp(-dt / 500));
    if (onset) this.lastBeat = now;
    for (const key of ['bass', 'mid', 'treble', 'overall'] as const) {
      const target = clamp(input[key] * sensitivity);
      const rate = target > this.state[key] ? 25 : 180;
      this.state[key] += (target - this.state[key]) * (1 - Math.exp(-dt / rate));
    }
    this.state.beat = onset ? 1 : (this.state.beat || 0) * Math.exp(-dt / 150);
    return { ...this.state };
  }
}
/** FFT bin ranges are based on the real sample rate, rather than fixed bin counts. */
export function spectrumEnergy(data: Uint8Array, sampleRate: number, fftSize: number): AudioEnergy {
  const band = (low: number, high: number) => {
    const start = Math.max(1, Math.ceil(low * fftSize / sampleRate));
    const end = Math.min(data.length, Math.floor(high * fftSize / sampleRate) + 1);
    let sum = 0; for (let i = start; i < end; i++) sum += (data[i] / 255) ** 2;
    return end > start ? Math.sqrt(sum / (end - start)) : 0;
  };
  const bass = band(30, 180), mid = band(180, 2500), treble = band(2500, 10000);
  return { bass, mid, treble, overall: bass * 0.5 + mid * 0.35 + treble * 0.15 };
}
