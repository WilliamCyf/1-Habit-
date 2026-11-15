// Turns the measurements of one test run into a plain-text report that can
// be copied out of the phone. Kept free of any page/DOM code so it can be
// unit-tested on a computer.
import type { CameraInfo, Facing } from '../pose/camera';
import type { Delegate, ModelSize } from '../pose/tracker';
import type { Histogram, Timeline, Totals } from '../perf/stats';
import type { DeviceSummary } from '../platform/ios';

export interface RunData {
  config: {
    model: ModelSize;
    delegate: Delegate;
    width: number;
    height: number;
    rate: number;
    facing: Facing;
  };
  startedAt: Date;
  /** Time spent actually running, pauses excluded. */
  activeMs: number;
  frames: number;
  found: number;
  wholeBody: number;
  visibilitySum: number;
  inferTotals: Totals;
  inferHistogram: Histogram;
  timeline: Timeline;
  firstInferMs: number | null;
  trackerLoadMs: number;
  cameraOpenMs: number;
  camera: CameraInfo | null;
  engineRunning: Delegate;
  fellBackToCpu: boolean;
  frameSource: string;
  screenFrames: number;
  stutters: number;
  worstGapMs: number;
  interruptions: number;
  wakeLock: string;
  errors: string[];
}

export interface ReportInput {
  run: RunData | null;
  device: DeviceSummary;
  gpu: string;
  engineLog: readonly string[];
  wakeLockSupported: boolean;
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : 'n/a';
}

function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The tally only goes up to a maximum; show "500+" rather than a false exact value. */
function capped(h: Histogram, p: number): string {
  const v = h.percentile(p);
  return v >= h.maxValue ? `${h.maxValue}+` : String(v);
}

export function buildReport(input: ReportInput): string {
  const { run, device, gpu } = input;
  const lines: string[] = [];
  lines.push('REPLING CAMERA CHECK · report v1');
  lines.push(`Opened as: ${device.standalone ? 'Home Screen app (standalone)' : 'Safari tab'}`);
  lines.push(`Device: ${device.userAgent}`);
  lines.push(
    `Screen: ${device.screen} @${device.pixelRatio}x · viewport ${device.viewport} · cores ${device.cores ?? '?'}`,
  );
  lines.push(`Graphics: ${gpu}`);
  lines.push(`Screen-awake lock supported: ${input.wakeLockSupported ? 'yes' : 'no'}`);

  if (!run) {
    lines.push('', 'No test has been run yet. Tap "Start camera test".');
    return lines.join('\n');
  }

  const c = run.config;
  const cam = run.camera;
  const seconds = run.activeMs / 1000;
  const measured = run.inferTotals.count;

  lines.push('', 'SETTINGS');
  lines.push(`When: ${localStamp(run.startedAt)}`);
  lines.push(
    `Model: ${c.model} · engine asked: ${c.delegate} · engine running: ${run.engineRunning}${
      run.fellBackToCpu ? ' (GPU FAILED, fell back)' : ''
    }`,
  );
  lines.push(
    `Picture asked: ${c.width}x${c.height} · got: ${
      cam ? `${cam.width}x${cam.height} @ ${cam.frameRate} fps` : 'n/a'
    } · ${c.facing === 'user' ? 'front' : 'back'} camera`,
  );
  lines.push(`Goal: ${c.rate >= 30 ? 'max' : c.rate} looks/sec · frame source: ${run.frameSource}`);

  lines.push('', 'RESULTS');
  lines.push(`Test length: ${clock(run.activeMs)} · looks: ${run.frames}`);
  lines.push(`Tracking speed: ${seconds > 0 ? (run.frames / seconds).toFixed(1) : 'n/a'} looks/sec average`);
  if (measured) {
    lines.push(
      `Think time: avg ${run.inferTotals.mean().toFixed(1)} ms · typical ${capped(
        run.inferHistogram,
        0.5,
      )} ms · slowest 5% ${capped(run.inferHistogram, 0.95)} ms · worst ${run.inferTotals.max.toFixed(0)} ms`,
    );
  } else {
    lines.push('Think time: not enough looks to measure');
  }
  lines.push(
    `First look (warm-up): ${run.firstInferMs === null ? 'n/a' : `${run.firstInferMs.toFixed(0)} ms`} · tracker load ${(
      run.trackerLoadMs / 1000
    ).toFixed(1)} s · camera start ${(run.cameraOpenMs / 1000).toFixed(1)} s`,
  );
  lines.push(
    `Screen: ${seconds > 0 ? (run.screenFrames / seconds).toFixed(0) : 'n/a'} fps average · stutters over 50 ms: ${
      run.stutters
    } · worst gap ${run.worstGapMs.toFixed(0)} ms`,
  );
  lines.push(
    `Body found: ${pct(run.found, run.frames)} of looks · whole body in view: ${pct(
      run.wholeBody,
      run.frames,
    )} · confidence ${run.found ? (run.visibilitySum / run.found).toFixed(2) : 'n/a'}`,
  );
  const slow = run.timeline.slowdown();
  lines.push(
    `Heat slowdown (last minute vs first): ${
      slow === null ? 'n/a (run 2+ minutes)' : `${slow >= 0 ? '+' : ''}${Math.round(slow * 100)}%`
    }`,
  );
  lines.push(`Screen-awake lock: ${run.wakeLock} · interruptions: ${run.interruptions}`);

  const buckets = run.timeline.list();
  if (buckets.length) {
    lines.push('', 'TIMELINE (every 30 s: avg think ms / looks per sec)');
    for (const b of buckets) {
      lines.push(`${clock(b.startSec * 1000).padStart(5)}  ${b.meanMs.toFixed(1).padStart(5)} ms / ${b.fps.toFixed(1)}`);
    }
  }

  lines.push('', 'ERRORS');
  lines.push(run.errors.length ? run.errors.join('\n') : 'none');

  if (input.engineLog.length) {
    lines.push('', 'ENGINE LOG (latest lines)');
    lines.push(...input.engineLog.slice(-12));
  }

  lines.push('', 'MY NOTES (please fill in)');
  lines.push('iPhone model and iOS version: ');
  lines.push('Heat after the test (cool / warm / hot): ');
  lines.push('Did the skeleton stick to my body? (yes / mostly / no): ');
  lines.push('Anything odd: ');
  return lines.join('\n');
}
