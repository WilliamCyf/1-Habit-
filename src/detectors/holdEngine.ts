// The engine for timed holds (plank). Instead of counting reps it counts
// seconds, and the clock only runs while the form is valid. Stop holding
// properly and the clock stops, like a taxi meter that pauses when the car
// leaves the road.
import { readSkeleton, sideClarity, type SideJoints, type Skeleton } from './joints';
import type { Cue, Detector, DetectorEvent, Frame, LiveView } from './types';

export interface HoldMeasure {
  /** In the right general shape (used for "has the person left?"). */
  posture: boolean;
  /** Form is good enough for the clock to run. */
  valid: boolean;
  /** What to say if it is not valid. */
  cue: Cue | null;
  /** 0 to 1: how good the form is right now. */
  quality: number;
  /** Values for the checklist: [right shape, holding properly]. */
  debug: string;
}

export interface HoldSpec {
  variant: string;
  checkLabels: [string, string, string];
  measure(sk: Skeleton, near: SideJoints, far: SideJoints): HoldMeasure | null;
}

const READY_HOLD_MS = 800;
const LEFT_MS = 4000;

export class HoldDetector implements Detector {
  private side: 'left' | 'right' | null = null;
  private counting = false;
  private heldMs = 0;
  private wholeSeconds = 0;
  private lastT = 0;
  private qualitySum = 0;
  private qualityN = 0;
  private invalidSince: number | null = null;
  private lastCueT = -Infinity;
  private readySince: number | null = null;
  private readyProgress = 0;
  private outSince: number | null = null;
  private leftSent = false;
  private now: HoldMeasure | null = null;

  constructor(private readonly spec: HoldSpec) {}

  startCounting(): void {
    this.counting = true;
    this.lastT = 0;
    this.invalidSince = null;
    this.outSince = null;
    this.leftSent = false;
  }

  stopCounting(): void {
    this.counting = false;
  }

  get view(): LiveView {
    const m = this.now;
    const [seenLabel, shapeLabel, holdLabel] = this.spec.checkLabels;
    return {
      tracking: m !== null,
      ready: this.readyProgress >= 1,
      readyProgress: this.readyProgress,
      count: this.wholeSeconds,
      checks: [
        { label: seenLabel, ok: m !== null },
        { label: shapeLabel, ok: !!m && m.posture },
        { label: holdLabel, ok: !!m && m.valid },
      ],
      debug: `${m ? m.debug : 'not seen'} · ${m?.valid ? 'clock running' : 'clock stopped'} · ${(this.heldMs / 1000).toFixed(1)} s`,
    };
  }

  update(frame: Frame): DetectorEvent[] {
    const events: DetectorEvent[] = [];
    const t = frame.t;
    const m = this.read(frame);
    this.now = m;

    if (m?.valid) {
      this.readySince ??= t;
      this.readyProgress = Math.min(1, (t - this.readySince) / READY_HOLD_MS);
    } else {
      this.readySince = null;
      this.readyProgress = 0;
    }
    if (!this.counting) return events;

    // Has the person got up and gone?
    if (m?.posture) {
      this.outSince = null;
      this.leftSent = false;
    } else {
      this.outSince ??= t;
      if (!this.leftSent && t - this.outSince > LEFT_MS) {
        this.leftSent = true;
        events.push({ type: 'left' });
      }
    }

    if (m?.valid) {
      // Add the time since the last look, but never a big jump: a frozen
      // frame must not hand out free seconds.
      if (this.lastT) this.heldMs += Math.min(200, t - this.lastT);
      this.lastT = t;
      this.invalidSince = null;
      this.qualitySum += m.quality;
      this.qualityN++;
      const whole = Math.floor(this.heldMs / 1000);
      if (whole > this.wholeSeconds) {
        this.wholeSeconds = whole;
        events.push({ type: 'hold', seconds: whole, score: Math.round((100 * this.qualitySum) / this.qualityN) });
      }
    } else {
      this.lastT = 0;
      this.invalidSince ??= t;
      // Say why the clock stopped, but not more than once every 3 seconds.
      if (m?.cue && t - this.invalidSince > 600 && t - this.lastCueT > 3000) {
        this.lastCueT = t;
        events.push({ type: 'cue', cue: m.cue });
      }
    }
    return events;
  }

  private read(frame: Frame): HoldMeasure | null {
    if (!frame.pose) return null;
    const sk = readSkeleton(frame.pose, frame.aspect);
    const l = sideClarity(sk.left);
    const r = sideClarity(sk.right);
    const best = l >= r ? 'left' : 'right';
    if (this.side === null || (best !== this.side && Math.abs(l - r) > 1.2)) this.side = best;
    return this.side === 'left' ? this.spec.measure(sk, sk.left, sk.right) : this.spec.measure(sk, sk.right, sk.left);
  }
}
