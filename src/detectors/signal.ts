/**
 * Smooths a jittery measurement, like a shock absorber on a car.
 *
 * Each new value only nudges the smoothed value part of the way. Programmers
 * call this an "exponential moving average". `tauMs` sets how soft the
 * suspension is: about that many milliseconds to mostly catch up. It uses
 * real time, so it behaves the same at 10 or 15 looks per second.
 */
export class Smoother {
  private value: number | null = null;
  private lastT = 0;

  constructor(private readonly tauMs: number) {}

  update(raw: number, t: number): number {
    if (this.value === null || t - this.lastT > 1000) {
      // First value, or a long gap: start fresh instead of blending with stale data.
      this.value = raw;
    } else {
      const alpha = 1 - Math.exp(-(t - this.lastT) / this.tauMs);
      this.value += alpha * (raw - this.value);
    }
    this.lastT = t;
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/** Squeeze `v` from the range [inLow, inHigh] onto [outLow, outHigh], clamped at both ends. */
export function remap(v: number, inLow: number, inHigh: number, outLow: number, outHigh: number): number {
  const k = Math.min(1, Math.max(0, (v - inLow) / (inHigh - inLow)));
  return outLow + k * (outHigh - outLow);
}

/**
 * Removes one-frame spikes. Keeps the last few readings and returns the
 * middle one when they are sorted, so a single wild value (the tracker
 * briefly mistaking an arm) is simply ignored, like throwing out the
 * highest and lowest score in a judging panel.
 */
export class MedianFilter {
  private readonly values: number[] = [];

  constructor(private readonly size = 5) {}

  update(value: number): number {
    this.values.push(value);
    if (this.values.length > this.size) this.values.shift();
    const sorted = [...this.values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  }

  reset(): void {
    this.values.length = 0;
  }
}
