// Tools for measuring speed without wasting speed.

/**
 * Remembers only the most recent N numbers (older ones fall off the end),
 * like a conveyor belt with N slots. Lets us ask "what was the average over
 * the last few seconds?" without storing every measurement forever.
 * Programmers call this a "ring buffer".
 */
export class RollingStats {
  private readonly buf: Float32Array;
  private next = 0;
  private filled = 0;

  constructor(readonly capacity = 120) {
    this.buf = new Float32Array(capacity);
  }

  push(value: number): void {
    this.buf[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  get count(): number {
    return this.filled;
  }

  mean(): number {
    if (this.filled === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.filled; i++) sum += this.buf[i]!;
    return sum / this.filled;
  }

  /**
   * p = 0.95 answers: "95% of measurements were at or below what number?"
   * This shows the bad moments that an average hides.
   */
  percentile(p: number): number {
    if (this.filled === 0) return 0;
    const sorted = Array.from(this.buf.subarray(0, this.filled)).sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[idx]!;
  }

  reset(): void {
    this.next = 0;
    this.filled = 0;
  }
}

/** Running totals for a whole test run: count, average, biggest value. */
export class Totals {
  count = 0;
  sum = 0;
  max = 0;

  push(value: number): void {
    this.count++;
    this.sum += value;
    if (value > this.max) this.max = value;
  }

  mean(): number {
    return this.count === 0 ? 0 : this.sum / this.count;
  }
}

/**
 * Counts how many measurements landed on each whole millisecond (0, 1, 2 ...).
 * Like tally marks on a ruler. It lets us answer "what was the 95th
 * percentile over the WHOLE run?" using a tiny fixed amount of memory.
 */
export class Histogram {
  private readonly bins: Uint32Array;
  private total = 0;

  constructor(readonly maxValue = 250) {
    this.bins = new Uint32Array(maxValue + 1);
  }

  push(value: number): void {
    const i = Math.min(this.maxValue, Math.max(0, Math.round(value)));
    this.bins[i]!++;
    this.total++;
  }

  percentile(p: number): number {
    if (this.total === 0) return 0;
    const target = Math.max(1, Math.ceil(p * this.total));
    let seen = 0;
    for (let i = 0; i <= this.maxValue; i++) {
      seen += this.bins[i]!;
      if (seen >= target) return i;
    }
    return this.maxValue;
  }
}

export interface TimelineBucket {
  /** Seconds since the run started when this bucket began. */
  startSec: number;
  frames: number;
  meanMs: number;
  /** Frames per second actually achieved in this bucket. */
  fps: number;
}

/**
 * Chops a run into equal slices of time (say 30 seconds each) and keeps the
 * average for each slice. If the phone heats up and slows itself down
 * ("thermal throttling"), later slices show bigger numbers than early ones.
 */
export class Timeline {
  private readonly buckets: { frames: number; sumMs: number; activeMs: number }[] = [];

  constructor(readonly bucketSec = 30) {}

  /** elapsedMs = active running time so far (pauses not included). */
  push(elapsedMs: number, inferMs: number): void {
    const i = Math.floor(elapsedMs / 1000 / this.bucketSec);
    while (this.buckets.length <= i) this.buckets.push({ frames: 0, sumMs: 0, activeMs: 0 });
    const b = this.buckets[i]!;
    b.frames++;
    b.sumMs += inferMs;
    b.activeMs = elapsedMs - i * this.bucketSec * 1000;
  }

  list(): TimelineBucket[] {
    const last = this.buckets.length - 1;
    return this.buckets.map((b, i) => {
      // Every bucket except the last one covers a full slice of time.
      const seconds = i < last ? this.bucketSec : Math.max(b.activeMs / 1000, 0.001);
      return {
        startSec: i * this.bucketSec,
        frames: b.frames,
        meanMs: b.frames ? b.sumMs / b.frames : 0,
        fps: b.frames / seconds,
      };
    });
  }

  /**
   * Compares the first full minute with the last full minute.
   * Returns e.g. 0.25 for "25% slower at the end", or null if the run was
   * too short to compare fairly.
   */
  slowdown(): number | null {
    const perMinute = Math.round(60 / this.bucketSec);
    const full = this.list().slice(0, -1); // drop the unfinished bucket
    if (full.length < perMinute * 2) return null;
    const avg = (bs: TimelineBucket[]) => {
      let frames = 0;
      let total = 0;
      for (const b of bs) {
        frames += b.frames;
        total += b.meanMs * b.frames;
      }
      return frames ? total / frames : 0;
    };
    const first = avg(full.slice(0, perMinute));
    const lastMin = avg(full.slice(-perMinute));
    if (first === 0) return null;
    return lastMin / first - 1;
  }
}
