import { describe, expect, it } from 'vitest';
import { buildReport, type RunData } from '../src/diag/report';
import { Histogram, Timeline, Totals } from '../src/perf/stats';
import type { DeviceSummary } from '../src/platform/ios';

const device: DeviceSummary = {
  userAgent: 'TestPhone',
  browser: 'Safari',
  screen: '393x852',
  viewport: '393x759',
  pixelRatio: 3,
  standalone: true,
  cores: 6,
  language: 'en-GB',
  online: true,
};

function sampleRun(seconds: number, ms: number): RunData {
  const inferTotals = new Totals();
  const inferHistogram = new Histogram(500);
  const timeline = new Timeline(30);
  let frames = 0;
  for (let t = 0; t < seconds * 1000; t += 1000 / 15) {
    inferTotals.push(ms);
    inferHistogram.push(ms);
    timeline.push(t, ms);
    frames++;
  }
  return {
    config: { model: 'lite', delegate: 'GPU', width: 640, height: 480, rate: 15, facing: 'user' },
    startedAt: new Date(2026, 10, 15, 9, 5),
    activeMs: seconds * 1000,
    frames,
    found: frames,
    wholeBody: Math.round(frames / 2),
    visibilitySum: frames * 0.9,
    inferTotals,
    inferHistogram,
    timeline,
    firstInferMs: 180,
    warmUpMs: 5200,
    trackerLoadMs: 2300,
    cameraOpenMs: 600,
    camera: { width: 480, height: 640, frameRate: 30, facing: 'user', label: 'Front Camera' },
    engineRunning: 'GPU',
    fellBackToCpu: false,
    frameSource: 'video-frame',
    screenFrames: seconds * 60,
    stutters: 2,
    worstGapMs: 80,
    interruptions: 0,
    cameraMutes: 0,
    videoPauses: 0,
    wakeLock: 'active',
    wakeLockError: null,
    errors: [],
  };
}

describe('buildReport', () => {
  it('explains that no test has run yet', () => {
    const text = buildReport({ run: null, device, gpu: 'Apple GPU', engineLog: [], wakeLockSupported: true });
    expect(text).toContain('No camera test has been run yet');
    expect(text).toContain('Home Screen app');
  });

  it('summarises a five minute run', () => {
    const text = buildReport({
      run: sampleRun(301, 14),
      device,
      gpu: 'Apple GPU',
      engineLog: ['info: hello'],
      wakeLockSupported: true,
    });
    expect(text).toContain('Test length: 5:01');
    expect(text).toContain('Tracking speed: 15.0 looks/sec');
    expect(text).toContain('avg 14.0 ms · typical 14 ms · slowest 5% 14 ms');
    expect(text).toContain('got: 480x640 @ 30 fps');
    expect(text).toContain('Body found: 100% of looks · whole body in view: 50%');
    expect(text).toContain('Heat slowdown (last minute vs first): +0%');
    expect(text).toContain(' 4:30');
    expect(text).toContain('ERRORS\nnone');
    expect(text).toContain('info: hello');
    expect(text).toContain('MY NOTES');
  });

  it('flags a GPU fallback and lists errors', () => {
    const run = sampleRun(20, 40);
    run.engineRunning = 'CPU';
    run.fellBackToCpu = true;
    run.errors.push('detect failed: boom');
    const text = buildReport({ run, device, gpu: 'Apple GPU', engineLog: [], wakeLockSupported: false });
    expect(text).toContain('engine running: CPU (GPU FAILED, fell back)');
    expect(text).toContain('detect failed: boom');
    expect(text).toContain('n/a (run 2+ minutes)');
    expect(text).toContain('Screen-awake lock supported: no');
  });

  it('names the browser and nudges towards Safari', () => {
    const chrome = { ...device, standalone: false, browser: 'Chrome' };
    const text = buildReport({ run: null, device: chrome, gpu: 'x', engineLog: [], wakeLockSupported: true });
    expect(text).toContain('Opened as: Chrome tab (for the Home Screen test, please use Safari)');
  });

  it('shows why the screen-awake lock was refused', () => {
    const run = sampleRun(20, 20);
    run.wakeLock = 'refused';
    run.wakeLockError = 'NotAllowedError: denied';
    const text = buildReport({ run, device, gpu: 'x', engineLog: [], wakeLockSupported: true });
    expect(text).toContain('Screen-awake lock: refused (NotAllowedError: denied)');
    expect(text).toContain('Warm-up on a blank picture: 5200 ms · first real look: 180 ms');
  });

  it('never prints a false exact number when think time is off the scale', () => {
    const text = buildReport({ run: sampleRun(10, 900), device, gpu: 'x', engineLog: [], wakeLockSupported: true });
    expect(text).toContain('typical 500+ ms');
  });
});
