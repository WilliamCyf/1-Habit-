/**
 * The heat governor: slows the tracking down if the phone starts to struggle.
 *
 * Like easing off the accelerator when the engine temperature climbs. It
 * watches how long each look takes. If looks get slow (a sign the phone is
 * hot and limiting itself), it steps down to fewer looks per second, which
 * lets the phone cool. When things are comfortable again for a while, it
 * steps back up. It never changes speed more than once every few seconds,
 * so it cannot flap up and down.
 */
export class Governor {
  private level = 0;
  private windowStart = 0;
  private sum = 0;
  private count = 0;
  private calmSince = 0;
  private lastChange = -Infinity;

  constructor(
    /** Allowed speeds, fastest first. */
    readonly levels: readonly number[] = [15, 12, 10],
    private readonly slowMs = 45,
    private readonly calmMs = 28,
  ) {}

  get fps(): number {
    return this.levels[this.level]!;
  }

  get steppedDown(): boolean {
    return this.level > 0;
  }

  /**
   * Report one look. Returns the new looks-per-second if it should change,
   * otherwise null.
   */
  push(inferMs: number, nowMs: number): number | null {
    if (this.count === 0) this.windowStart = nowMs;
    this.sum += inferMs;
    this.count++;
    // Judge on about 3 seconds of evidence, not on a single slow frame.
    if (nowMs - this.windowStart < 3000) return null;
    const mean = this.sum / this.count;
    this.sum = 0;
    this.count = 0;

    if (mean > this.slowMs) {
      this.calmSince = 0;
      if (this.level < this.levels.length - 1 && nowMs - this.lastChange >= 6000) {
        this.level++;
        this.lastChange = nowMs;
        return this.fps;
      }
      return null;
    }
    if (mean < this.calmMs) {
      if (this.calmSince === 0) this.calmSince = this.windowStart;
      // Only speed back up after 20 comfortable seconds.
      if (this.level > 0 && nowMs - this.calmSince >= 20000 && nowMs - this.lastChange >= 20000) {
        this.level--;
        this.lastChange = nowMs;
        this.calmSince = 0;
        return this.fps;
      }
    } else {
      this.calmSince = 0;
    }
    return null;
  }

  reset(): void {
    this.level = 0;
    this.sum = 0;
    this.count = 0;
    this.calmSince = 0;
    this.lastChange = -Infinity;
  }
}
