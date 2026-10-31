/** Smooth external-player clock; explicit seeks and track changes can move backwards. */
export class SyncClock {
  private position = 0;
  private at = 0;
  private playing = false;
  private speed = 1;
  private last = 0;
  private initialized = false;
  constructor(private clock: () => number = () => performance.now()) {}
  reset(position = 0, playing = false, speed = 1) {
    this.position = Math.max(0, position); this.at = this.clock();
    this.playing = playing; this.speed = speed; this.last = this.position; this.initialized = true;
  }
  update(position: number, playing: boolean, speed = 1, transportMs = 0) {
    const now = this.clock();
    const corrected = Math.max(0, position + (playing ? Math.min(1000, transportMs) * speed / 2000 : 0));
    const estimate = this.position + (this.playing ? (now - this.at) * this.speed / 1000 : 0);
    const error = corrected - estimate;
    if (!this.initialized || playing !== this.playing || speed !== this.speed || Math.abs(error) > 1.2) {
      // Pauses, explicit seeks and large discontinuities must take effect immediately.
      this.reset(corrected, playing, speed); return;
    }
    // Rebase to the CURRENT estimate. Clamp ordinary SDK measurement jitter so
    // frequent transport updates cannot produce visibly jumping karaoke text.
    const correction = Math.max(-0.075, Math.min(0.075, error * (Math.abs(error) > 0.2 ? 0.24 : 0.12)));
    this.position = estimate + correction;
    this.at = now; this.playing = playing; this.speed = speed;
  }
  now() {
    const value = this.position + (this.playing ? (this.clock() - this.at) * this.speed / 1000 : 0);
    this.last = this.playing ? Math.max(this.last, value) : value;
    return Math.max(0, this.last);
  }
}
