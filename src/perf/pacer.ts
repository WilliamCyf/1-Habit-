/**
 * Decides which camera frames to analyse.
 *
 * The camera delivers about 30 pictures per second, but analysing all of them
 * would heat the phone for no benefit: a push-up takes over a second, so 15
 * looks per second is plenty. The pacer is like a doorman who lets through
 * every second guest.
 *
 * It keeps a "next due" time instead of just measuring the gap since the
 * last frame. That way small timing wobbles do not add up, and we land on
 * the target rate on average.
 */
export class FramePacer {
  private intervalMs: number;
  private dueMs = -Infinity;

  /**
   * @param targetFps  how many frames per second we want to analyse
   * @param toleranceMs  accept a frame that arrives this little bit early.
   *   Camera frames come about every 33 ms; without tolerance a frame that is
   *   1 ms early would be skipped and we would wait a whole extra frame.
   */
  constructor(
    targetFps: number,
    private readonly toleranceMs = 8,
  ) {
    this.intervalMs = 1000 / targetFps;
  }

  setTargetFps(fps: number): void {
    this.intervalMs = 1000 / fps;
  }

  get targetFps(): number {
    return 1000 / this.intervalMs;
  }

  /** Call once per camera frame. True means "analyse this one". */
  shouldProcess(nowMs: number): boolean {
    if (nowMs < this.dueMs - this.toleranceMs) return false;
    // Schedule the next slot one interval after this slot was DUE (not after
    // "now"), so a frame that is a few ms late does not push everything back.
    // If we fell behind (app was paused, phone hiccup), restart from now
    // instead of trying to "catch up" with a burst of frames.
    const next = this.dueMs + this.intervalMs;
    this.dueMs = next < nowMs ? nowMs + this.intervalMs : next;
    return true;
  }

  reset(): void {
    this.dueMs = -Infinity;
  }
}
