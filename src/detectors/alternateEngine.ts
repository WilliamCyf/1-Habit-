// The engine for fast left-right-left-right moves (high knees).
//
// At running speed the two legs swap in mid-air, so there is never a clear
// "both feet down" moment for the normal engine to use as rest. Instead this
// engine watches the DIFFERENCE between the two legs. That number swings
// from strongly positive (left knee up) to strongly negative (right knee up),
// and each swing to a new side is one rep.
import { readSkeleton, type Skeleton } from './joints';
import type { Cue, Detector, DetectorEvent, Frame, LiveView } from './types';

export interface AlternateMeasure {
  /** Left minus right: positive when the left side is "up". */
  diff: number;
  /** The height of whichever side is up (for "is it high enough?"). */
  height: number;
  posture: boolean;
  /** True when both sides are down, i.e. standing normally. */
  resting: boolean;
}

export interface AlternateSpec {
  variant: string;
  /** |diff| must reach this for a rep. */
  peakDiff: number;
  /** The raised side must reach at least this height. */
  minHeight: number;
  /** Shortest believable time between two reps. */
  minGapMs: number;
  shallowCue: Cue;
  checkLabels: [string, string, string];
  measure(sk: Skeleton): AlternateMeasure | null;
}

const READY_HOLD_MS = 800;
const LEFT_MS = 3500;

export class AlternateDetector implements Detector {
  private counting = false;
  private reps = 0;
  /** Which side scored last: +1, -1, or 0 for "either may score next". */
  private lastSide: 1 | -1 | 0 = 0;
  private lastRepT = -Infinity;
  private restSince: number | null = null;
  private readySince: number | null = null;
  private readyProgress = 0;
  private outSince: number | null = null;
  private leftSent = false;
  private now: AlternateMeasure | null = null;
  /** The swing in progress: which side is up, and whether it has been counted yet. */
  private swing: { side: 1 | -1; counted: boolean; best: number } | null = null;
  private lastShallowT = -Infinity;

  constructor(private readonly spec: AlternateSpec) {}

  startCounting(): void {
    this.counting = true;
    this.lastSide = 0;
    this.outSince = null;
    this.leftSent = false;
  }

  stopCounting(): void {
    this.counting = false;
  }

  get view(): LiveView {
    const m = this.now;
    const [seenLabel, shapeLabel, startLabel] = this.spec.checkLabels;
    return {
      tracking: m !== null,
      ready: this.readyProgress >= 1,
      readyProgress: this.readyProgress,
      count: this.reps,
      checks: [
        { label: seenLabel, ok: m !== null },
        { label: shapeLabel, ok: !!m && m.posture },
        { label: startLabel, ok: !!m && m.posture && m.resting },
      ],
      debug: m ? `diff ${m.diff.toFixed(2)} (peak ${this.spec.peakDiff}) · height ${m.height.toFixed(2)}` : 'not seen',
    };
  }

  update(frame: Frame): DetectorEvent[] {
    const events: DetectorEvent[] = [];
    const t = frame.t;
    const m = frame.pose ? this.spec.measure(readSkeleton(frame.pose, frame.aspect)) : null;
    this.now = m;

    if (m?.posture && m.resting) {
      this.readySince ??= t;
      this.readyProgress = Math.min(1, (t - this.readySince) / READY_HOLD_MS);
    } else {
      this.readySince = null;
      this.readyProgress = 0;
    }
    if (!this.counting) return events;

    if (m?.posture) {
      this.outSince = null;
      this.leftSent = false;
    } else {
      this.outSince ??= t;
      if (!this.leftSent && t - this.outSince > LEFT_MS) {
        this.leftSent = true;
        events.push({ type: 'left' });
      }
      return events;
    }

    // Standing still for a moment lets the same leg score again.
    if (m.resting) {
      this.restSince ??= t;
      if (t - this.restSince > 150) this.lastSide = 0;
    } else {
      this.restSince = null;
    }

    const side: 1 | -1 | 0 = m.diff >= this.spec.peakDiff ? 1 : m.diff <= -this.spec.peakDiff ? -1 : 0;

    // A swing ends when that side comes back down (or the other side goes up).
    if (this.swing && side !== this.swing.side) {
      if (!this.swing.counted && t - this.lastShallowT > 2500) {
        // It swung, but never got high enough.
        this.lastShallowT = t;
        events.push({ type: 'reject', reason: 'shallow', cue: this.spec.shallowCue });
      }
      this.swing = null;
    }
    // A new swing begins when a side goes up that did not score last.
    if (!this.swing && side !== 0 && side !== this.lastSide && t - this.lastRepT >= this.spec.minGapMs) {
      this.swing = { side, counted: false, best: m.height };
      this.lastSide = side;
    }
    // The knee often keeps rising after the swing is first noticed, so we
    // wait until it is high enough before counting, instead of judging early.
    if (this.swing && !this.swing.counted) {
      this.swing.best = Math.max(this.swing.best, m.height);
      if (this.swing.best >= this.spec.minHeight) {
        this.swing.counted = true;
        this.lastRepT = t;
        this.reps++;
        const score = Math.round(Math.min(100, 75 + 25 * Math.min(1, (this.swing.best - this.spec.minHeight) / 0.2)));
        events.push({ type: 'rep', count: this.reps, score, durationMs: 0, depthDeg: this.swing.best, variant: this.spec.variant, cue: 'nice' });
      }
    }
    return events;
  }
}
