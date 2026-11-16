// One counting engine shared by most exercises.
//
// Squats, lunges, sit-ups and the rest all follow the same story: a single
// number (the "signal", usually a joint angle) leaves its resting value,
// reaches a peak, and comes back. So the engine is written once, and each
// exercise only supplies a small "spec": how to measure its signal, where
// the thresholds are, and how to judge a finished rep.
//
// It is the same turnstile idea as the push-up counter:
//
//   REST ── signal passes "start" ──▶ MOVING ── passes "peak" ──▶ PEAKED
//     ▲                                                             │
//     └──────────────── signal returns to "rest" ───────────────────┘
//                         (then the rep is judged)
import { remap, Smoother } from './signal';
import { bodyScale, readSkeleton, sideClarity, type SideJoints, type Skeleton } from './joints';
import type { Cue, Detector, DetectorEvent, Frame, LiveView, RejectReason } from './types';

type XY = { x: number; y: number };

/** What an exercise measures on one camera frame. */
export interface Measure {
  /** The main number that rises and falls with each rep. */
  signal: number;
  /** Is the body in the right general shape for this exercise at all? */
  posture: boolean;
  /** A point that must really travel during a rep (for example the hip in a squat). */
  mover: XY;
  /** Points that must stay put (for example the feet). */
  planted: XY[];
  /** A point used to notice the tracker jumping to a different person. */
  anchor: XY;
  /** Body size, for turning distances into shares of the body. */
  scale: number;
  /** Two optional extra numbers. The engine records their lowest and highest values. */
  form?: number;
  aux?: number;
}

/** Everything the engine noticed about one rep, handed to the exercise to judge. */
export interface Evidence {
  durationMs: number;
  /** The furthest the signal went. */
  peak: number;
  /** Time spent at or beyond the peak threshold. */
  pauseMs: number;
  /** Time from starting to first reaching the peak threshold. */
  toPeakMs: number;
  formMin: number;
  formMax: number;
  auxMin: number;
  auxMax: number;
  /** The same, but only while at the peak. */
  formPeakMin: number;
  formPeakMax: number;
  auxPeakMin: number;
  auxPeakMax: number;
}

export type Verdict = { ok: true; score: number; cue: Cue } | { ok: false; reason: RejectReason; cue: Cue };

export interface RepSpec {
  /** Recorded on each rep, e.g. "half", "standard", "pause". */
  variant: string;
  view: 'side' | 'front';
  /** Signal values. If peak is smaller than rest, the signal goes DOWN into the rep. */
  rest: number;
  start: number;
  peak: number;
  minRepMs: number;
  maxRepMs?: number;
  /** The mover must travel at least this share of body size. */
  minTravel: number;
  /** Planted points may drift at most this share of body size. */
  maxShift: number;
  smoothMs?: number;
  /** What to say when the movement stops short of the peak. */
  shallowCue: Cue;
  /** Checklist wording: [body seen, right shape, start position]. */
  checkLabels: [string, string, string];
  measure(sk: Skeleton, near: SideJoints, far: SideJoints): Measure | null;
  judge(e: Evidence): Verdict;
}

const READY_HOLD_MS = 800;
const LOST_MS = 500;
const LEFT_MS = 3500;
const JUMP_SHARE = 0.45;

interface Track {
  startT: number;
  peaked: boolean;
  peakT: number;
  extreme: number;
  pauseMs: number;
  lastT: number;
  frames: number;
  postureFrames: number;
  mover0: XY;
  planted0: XY[];
  travel: number;
  shift: number;
  scale: number;
  formMin: number;
  formMax: number;
  auxMin: number;
  auxMax: number;
  formPeakMin: number;
  formPeakMax: number;
  auxPeakMin: number;
  auxPeakMax: number;
}

export class RepDetector implements Detector {
  private readonly dir: 1 | -1;
  private readonly smooth: Smoother;
  private side: 'left' | 'right' | null = null;
  private track: Track | null = null;
  private reps = 0;
  private counting = false;
  private lastSeenT = 0;
  private lastAnchor: XY | null = null;
  private lastAnchorT = 0;
  private readySince: number | null = null;
  private readyProgress = 0;
  private outSince: number | null = null;
  private leftSent = false;
  private tracking = false;
  private posture = false;
  private atRest = false;
  private signalNow = 0;
  private lastReject = '-';

  constructor(private readonly spec: RepSpec) {
    this.dir = spec.peak >= spec.rest ? 1 : -1;
    this.smooth = new Smoother(spec.smoothMs ?? 80);
  }

  startCounting(): void {
    this.counting = true;
    this.track = null;
    this.outSince = null;
    this.leftSent = false;
  }

  stopCounting(): void {
    this.counting = false;
    this.track = null;
  }

  get view(): LiveView {
    const [seenLabel, shapeLabel, startLabel] = this.spec.checkLabels;
    return {
      tracking: this.tracking,
      ready: this.readyProgress >= 1,
      readyProgress: this.readyProgress,
      count: this.reps,
      checks: [
        { label: seenLabel, ok: this.tracking },
        { label: shapeLabel, ok: this.tracking && this.posture },
        { label: startLabel, ok: this.tracking && this.posture && this.atRest },
      ],
      debug: `signal ${this.tracking ? this.signalNow.toFixed(this.spec.peak <= 2 ? 2 : 0) : '-'} (rest ${this.spec.rest}, peak ${this.spec.peak}) · ${
        this.track ? (this.track.peaked ? 'peaked' : 'moving') : 'rest'
      } · last reject: ${this.lastReject}`,
    };
  }

  /** How far past "rest" the signal is, with "towards the peak" always positive. */
  private toward(value: number): number {
    return (value - this.spec.rest) * this.dir;
  }

  update(frame: Frame): DetectorEvent[] {
    const events: DetectorEvent[] = [];
    const t = frame.t;
    const m = this.read(frame);
    this.tracking = m !== null;

    if (!m) {
      this.readySince = null;
      this.readyProgress = 0;
      if (this.track && t - this.lastSeenT > LOST_MS) this.fail(events, 'lost', 'stay-in-frame');
      this.absent(events, t);
      return events;
    }
    this.lastSeenT = t;

    // A body cannot teleport.
    if (this.lastAnchor && t - this.lastAnchorT < 400) {
      if (Math.hypot(m.anchor.x - this.lastAnchor.x, m.anchor.y - this.lastAnchor.y) > JUMP_SHARE * m.scale) {
        this.smooth.reset();
        if (this.track) this.fail(events, 'jump', 'stay-in-frame');
      }
    }
    this.lastAnchor = m.anchor;
    this.lastAnchorT = t;

    const signal = this.smooth.update(m.signal, t);
    this.signalNow = signal;
    this.posture = m.posture;
    const toward = this.toward(signal);
    this.atRest = toward <= 0;

    // ---- start-position gate
    if (m.posture && this.atRest) {
      this.readySince ??= t;
      this.readyProgress = Math.min(1, (t - this.readySince) / READY_HOLD_MS);
    } else {
      this.readySince = null;
      this.readyProgress = 0;
    }
    if (!this.counting) return events;

    if (m.posture) {
      this.outSince = null;
      this.leftSent = false;
    } else if (!this.track) {
      this.absent(events, t);
    }

    const startAt = this.toward(this.spec.start);
    const peakAt = this.toward(this.spec.peak);

    if (!this.track) {
      if (toward > startAt && m.posture) {
        this.track = {
          startT: t,
          peaked: false,
          peakT: 0,
          extreme: toward,
          pauseMs: 0,
          lastT: t,
          frames: 0,
          postureFrames: 0,
          mover0: m.mover,
          planted0: m.planted,
          travel: 0,
          shift: 0,
          scale: m.scale,
          formMin: Infinity,
          formMax: -Infinity,
          auxMin: Infinity,
          auxMax: -Infinity,
          formPeakMin: Infinity,
          formPeakMax: -Infinity,
          auxPeakMin: Infinity,
          auxPeakMax: -Infinity,
        };
      }
      return events;
    }

    const tr = this.track;
    const dt = Math.min(250, t - tr.lastT);
    tr.lastT = t;
    tr.frames++;
    if (m.posture) tr.postureFrames++;
    tr.extreme = Math.max(tr.extreme, toward);
    tr.travel = Math.max(tr.travel, Math.hypot(m.mover.x - tr.mover0.x, m.mover.y - tr.mover0.y) / tr.scale);
    m.planted.forEach((p, i) => {
      const p0 = tr.planted0[i];
      if (p0) tr.shift = Math.max(tr.shift, Math.hypot(p.x - p0.x, p.y - p0.y) / tr.scale);
    });
    const atPeak = toward >= peakAt;
    if (m.form !== undefined) {
      tr.formMin = Math.min(tr.formMin, m.form);
      tr.formMax = Math.max(tr.formMax, m.form);
      if (atPeak) {
        tr.formPeakMin = Math.min(tr.formPeakMin, m.form);
        tr.formPeakMax = Math.max(tr.formPeakMax, m.form);
      }
    }
    if (m.aux !== undefined) {
      tr.auxMin = Math.min(tr.auxMin, m.aux);
      tr.auxMax = Math.max(tr.auxMax, m.aux);
      if (atPeak) {
        tr.auxPeakMin = Math.min(tr.auxPeakMin, m.aux);
        tr.auxPeakMax = Math.max(tr.auxPeakMax, m.aux);
      }
    }
    if (atPeak) {
      if (!tr.peaked) {
        tr.peaked = true;
        tr.peakT = t;
      } else {
        tr.pauseMs += dt;
      }
    }

    if (t - tr.startT > (this.spec.maxRepMs ?? 12000)) {
      this.track = null;
      return events;
    }
    if (toward <= 0) this.finish(events, tr, t);
    return events;
  }

  private read(frame: Frame): Measure | null {
    if (!frame.pose) return null;
    const sk = readSkeleton(frame.pose, frame.aspect);
    if (this.spec.view === 'front') return this.spec.measure(sk, sk.left, sk.right);
    // Side view: lock onto the side facing the camera, and do not flip mid-rep.
    const l = sideClarity(sk.left);
    const r = sideClarity(sk.right);
    const best = l >= r ? 'left' : 'right';
    if (this.side === null) this.side = best;
    else if (!this.track && best !== this.side && Math.abs(l - r) > 1.2) {
      this.side = best;
      this.smooth.reset();
    }
    return this.side === 'left' ? this.spec.measure(sk, sk.left, sk.right) : this.spec.measure(sk, sk.right, sk.left);
  }

  private absent(events: DetectorEvent[], t: number): void {
    if (!this.counting) return;
    this.outSince ??= t;
    if (!this.leftSent && t - this.outSince > LEFT_MS) {
      this.leftSent = true;
      events.push({ type: 'left' });
    }
  }

  private fail(events: DetectorEvent[], reason: RejectReason, cue: Cue): void {
    this.track = null;
    this.lastReject = reason;
    events.push({ type: 'reject', reason, cue });
  }

  private finish(events: DetectorEvent[], tr: Track, t: number): void {
    const spec = this.spec;
    const durationMs = t - tr.startT;
    if (!tr.peaked) {
      // Dipped part of the way and came back. Only mention real attempts.
      const share = tr.extreme / this.toward(spec.peak);
      if (share >= 0.4 && durationMs >= 250) return this.fail(events, 'shallow', spec.shallowCue);
      this.track = null;
      return;
    }
    if (durationMs < spec.minRepMs) return this.fail(events, 'too-fast', 'slow-down');
    if (tr.postureFrames / Math.max(1, tr.frames) < 0.7) return this.fail(events, 'wrong-shape', 'get-in-position');
    if (tr.shift > spec.maxShift) return this.fail(events, 'moved', 'keep-still');
    if (tr.travel < spec.minTravel) return this.fail(events, 'no-body-movement', spec.shallowCue);

    const fix = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
    const verdict = spec.judge({
      durationMs,
      peak: spec.rest + tr.extreme * this.dir,
      pauseMs: tr.pauseMs,
      toPeakMs: tr.peakT - tr.startT,
      formMin: fix(tr.formMin, 0),
      formMax: fix(tr.formMax, 0),
      auxMin: fix(tr.auxMin, 0),
      auxMax: fix(tr.auxMax, 0),
      formPeakMin: fix(tr.formPeakMin, 0),
      formPeakMax: fix(tr.formPeakMax, 0),
      auxPeakMin: fix(tr.auxPeakMin, 0),
      auxPeakMax: fix(tr.auxPeakMax, 0),
    });
    if (!verdict.ok) return this.fail(events, verdict.reason, verdict.cue);
    this.reps++;
    this.track = null;
    this.lastReject = '-';
    events.push({
      type: 'rep',
      count: this.reps,
      score: Math.round(Math.min(100, Math.max(0, verdict.score))),
      durationMs,
      depthDeg: spec.rest + tr.extreme * this.dir,
      variant: spec.variant,
      cue: verdict.cue,
    });
  }
}

/** Helpers for writing `judge` functions. */
export const scoreParts = { remap, bodyScale };
