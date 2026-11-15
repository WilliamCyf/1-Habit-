import { describe, expect, it } from 'vitest';
import { FramePacer } from '../src/perf/pacer';

/** Feed the pacer camera frames at a steady rate and count how many it accepts. */
function accepted(pacer: FramePacer, cameraFps: number, seconds: number, jitterMs = 0): number {
  let count = 0;
  const step = 1000 / cameraFps;
  for (let i = 0; i * step < seconds * 1000; i++) {
    // Deterministic wobble so the test gives the same answer every time.
    const wobble = jitterMs ? Math.sin(i * 12.9898) * jitterMs : 0;
    if (pacer.shouldProcess(1000 + i * step + wobble)) count++;
  }
  return count;
}

describe('FramePacer', () => {
  it('takes every second frame for 15 fps from a 30 fps camera', () => {
    expect(accepted(new FramePacer(15), 30, 10)).toBe(150);
  });

  it('takes every third frame for 10 fps from a 30 fps camera', () => {
    expect(accepted(new FramePacer(10), 30, 10)).toBe(100);
  });

  it('takes every frame when the goal matches the camera', () => {
    expect(accepted(new FramePacer(30), 30, 10)).toBe(300);
  });

  it('stays on target when frame timing wobbles', () => {
    const n = accepted(new FramePacer(15), 30, 20, 4);
    expect(n).toBeGreaterThanOrEqual(295);
    expect(n).toBeLessThanOrEqual(305);
  });

  it('never exceeds the camera rate', () => {
    expect(accepted(new FramePacer(60), 30, 5)).toBe(150);
  });

  it('does not burst to catch up after a long pause', () => {
    const pacer = new FramePacer(15);
    expect(pacer.shouldProcess(0)).toBe(true);
    // 5 seconds of nothing (app in background), then frames resume.
    expect(pacer.shouldProcess(5000)).toBe(true);
    expect(pacer.shouldProcess(5033)).toBe(false);
    expect(pacer.shouldProcess(5067)).toBe(true);
  });

  it('can change target while running', () => {
    const pacer = new FramePacer(15);
    pacer.setTargetFps(10);
    expect(pacer.targetFps).toBeCloseTo(10);
    expect(accepted(pacer, 30, 10)).toBe(100);
  });
});
