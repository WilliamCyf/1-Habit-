import { describe, expect, it } from 'vitest';
import { Histogram, RollingStats, Timeline, Totals } from '../src/perf/stats';

describe('RollingStats', () => {
  it('averages what it has', () => {
    const s = new RollingStats(4);
    s.push(10);
    s.push(20);
    expect(s.mean()).toBe(15);
    expect(s.count).toBe(2);
  });

  it('forgets the oldest values once full', () => {
    const s = new RollingStats(3);
    [100, 1, 2, 3].forEach((v) => s.push(v));
    expect(s.count).toBe(3);
    expect(s.mean()).toBe(2);
  });

  it('finds percentiles', () => {
    const s = new RollingStats(100);
    for (let i = 1; i <= 100; i++) s.push(i);
    expect(s.percentile(0.95)).toBe(95);
    expect(s.percentile(0.5)).toBe(50);
    expect(s.percentile(1)).toBe(100);
  });

  it('is safe when empty', () => {
    const s = new RollingStats(5);
    expect(s.mean()).toBe(0);
    expect(s.percentile(0.95)).toBe(0);
  });
});

describe('Totals', () => {
  it('tracks count, mean and max', () => {
    const t = new Totals();
    [4, 10, 1].forEach((v) => t.push(v));
    expect(t.count).toBe(3);
    expect(t.mean()).toBe(5);
    expect(t.max).toBe(10);
  });
});

describe('Histogram', () => {
  it('finds whole-run percentiles', () => {
    const h = new Histogram(250);
    for (let i = 0; i < 95; i++) h.push(12);
    for (let i = 0; i < 5; i++) h.push(80);
    expect(h.percentile(0.5)).toBe(12);
    expect(h.percentile(0.95)).toBe(12);
    expect(h.percentile(0.99)).toBe(80);
  });

  it('clamps huge values into the last bin', () => {
    const h = new Histogram(100);
    h.push(5000);
    expect(h.percentile(1)).toBe(100);
  });
});

describe('Timeline', () => {
  /** Simulate `seconds` of looks at `fps`, taking `msAt(t)` each. */
  function fill(tl: Timeline, seconds: number, fps: number, msAt: (sec: number) => number): void {
    const step = 1000 / fps;
    for (let t = 0; t < seconds * 1000; t += step) tl.push(t, msAt(t / 1000));
  }

  it('groups looks into 30 second buckets', () => {
    const tl = new Timeline(30);
    fill(tl, 90, 15, () => 12);
    const buckets = tl.list();
    expect(buckets).toHaveLength(3);
    expect(buckets[0]!.frames).toBe(450);
    expect(buckets[0]!.fps).toBeCloseTo(15, 1);
    expect(buckets[0]!.meanMs).toBeCloseTo(12, 5);
    expect(buckets[2]!.startSec).toBe(60);
  });

  it('reports no slowdown figure for short runs', () => {
    const tl = new Timeline(30);
    fill(tl, 100, 15, () => 12);
    expect(tl.slowdown()).toBeNull();
  });

  it('detects a phone that slows down as it heats up', () => {
    const tl = new Timeline(30);
    // 12 ms for the first minute, drifting up to 18 ms by minute five.
    fill(tl, 315, 15, (sec) => (sec < 60 ? 12 : sec > 240 ? 18 : 15));
    expect(tl.slowdown()).toBeCloseTo(0.5, 2);
  });

  it('reports about zero for a steady phone', () => {
    const tl = new Timeline(30);
    fill(tl, 200, 15, () => 14);
    expect(tl.slowdown()).toBeCloseTo(0, 5);
  });
});
