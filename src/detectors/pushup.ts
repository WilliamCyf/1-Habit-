// The push-up counter.
//
// It watches the body from the side and works like a turnstile with rules:
// one "click" (rep) is only given for the full journey TOP → BOTTOM → TOP,
// and only if the journey looked like a real push-up.
//
//   TOP (arms straight, elbow ≥ 150°)
//     │  elbow drops below 140°: a rep has started
//     ▼
//   GOING DOWN ── never reaches 100° and comes back up ──▶ "go lower" (not counted)
//     │  elbow ≤ 100°
//     ▼
//   BOTTOM REACHED
//     │  elbow back to ≥ 150°
//     ▼
//   CHECKS (tempo, body line, real body movement, nothing slid) ──▶ counted, or rejected with a reason
//
// The gap between 100° and 150° is "hysteresis": two different thresholds
// for down and up. A shaky measurement hovering around one number cannot
// click the turnstile twice, because it would have to travel the whole gap.
//
// Pure logic: no camera, no screen. Feed it frames, get events back.
import { angleAt, type Point, type Side } from '../pose/geometry';
import { LM, vis, type Landmark } from '../pose/landmarks';
import { remap, Smoother } from './signal';
import type { Cue, DetectorEvent, Frame, RejectReason, Variant } from './types';

export const PUSHUP = {
  /** Elbow angle that counts as "arms straight". */
  upDeg: 150,
  /** Dropping below this means a rep has begun. */
  startDeg: 140,
  /** The elbow must bend at least this far for the rep to count. */
  downDeg: 100,
  /**
   * Time from "started bending" to "arms straight again" must be at least
   * this long. Half a second here is about 0.7 s per whole rep: faster than
   * that is bouncing, not a push-up.
   */
  minRepMs: 500,
  /** Give up on a rep that has been "in progress" for this long. */
  maxRepMs: 9000,
  /** How long the body may be unseen mid-rep before the rep is thrown away. */
  lostMs: 500,
  /** Shoulder–hip–ankle angle below this is too bent to count at all. */
  minLineDeg: 152,
  /** Below this the rep still counts, but the coach mentions the hips. */
  cueLineDeg: 163,
  /** Body may tilt this far from flat (standard / knee push-up). */
  maxInclineDeg: 42,
  maxInclineKneeDeg: 52,
  /** Hands and feet may drift this far (as a share of body length) in one rep. */
  maxPlantedShift: 0.14,
  /** The shoulder must really travel down at least this share of body length. */
  minShoulderDrop: 0.055,
  /** A sudden move this big between two looks means "different body". */
  jumpShare: 0.4,
  /** Hold the start position this long before the set may begin. */
  readyHoldMs: 800,
  /** Out of position this long while counting = the person has left. */
  leftMs: 3500,
  /**
   * On toes, the ankle sits clearly lower than the knee. On the knees, the
   * shin lies flat or the feet are up. This is the dividing line, measured
   * as (ankle height below knee) ÷ body length.
   */
  kneeShinDrop: 0.035,
} as const;

interface Features {
  elbow: number;
  /** Shoulder–hip–(ankle or knee) angle. 180 = perfectly straight. */
  line: number;
  /** How far the ankle is below the knee, ÷ body length. Null if the ankle is hidden. */
  shinDrop: number | null;
  /** Tilt of the body from horizontal, in degrees. */
  incline: number;
  inclineKnee: number;
  /** +1 when the hip hangs below the body line (sag), -1 when above (pike). */
  hipSide: number;
  handsDown: boolean;
  shoulder: Point;
  wrist: Point;
  /** The low anchor: ankle if visible, otherwise knee. */
  foot: Point;
  kneePoint: Point;
  bodyLen: number;
  kneeLine: number;
}

const SIDES = {
  left: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST, LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
  right: [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
} as const;

/** Score how clearly one side of the body is seen. */
function sideVisibility(pose: readonly Landmark[], side: Side): number {
  let sum = 0;
  for (const i of SIDES[side]) sum += vis(pose[i]);
  return sum;
}

/** Turn 33 dots into the handful of numbers a push-up needs. Null if not clearly seen. */
export function pushupFeatures(pose: readonly Landmark[], aspect: number, side: Side): Features | null {
  const [is, ie, iw, ih, ik, ia] = SIDES[side];
  const s = pose[is];
  const e = pose[ie];
  const w = pose[iw];
  const hp = pose[ih];
  const k = pose[ik];
  const a = pose[ia];
  if (!s || !e || !w || !hp || !k) return null;
  if (Math.min(vis(s), vis(e), vis(w), vis(hp), vis(k)) < 0.5) return null;
  // Work in "real" units where one unit is the picture height both ways.
  const real = (p: Landmark): Point => ({ x: p.x * aspect, y: p.y });
  const S = real(s);
  const E = real(e);
  const W = real(w);
  const H = real(hp);
  const K = real(k);
  const ankleSeen = !!a && vis(a) >= 0.4;
  const A = ankleSeen ? real(a!) : K;

  const tilt = (from: Point, to: Point) => {
    const deg = (Math.atan2(Math.abs(to.y - from.y), Math.abs(to.x - from.x)) * 180) / Math.PI;
    return deg;
  };
  // Which side of the shoulder→foot line is the hip on? The cross product
  // of two arrows tells left from right; we then flip it so "below" is +1.
  const dx = A.x - S.x;
  const dy = A.y - S.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.05) return null;
  const hipOffset = ((H.x - S.x) * dy - (H.y - S.y) * dx) / len; // signed distance from the line
  const below = dx >= 0 ? -hipOffset : hipOffset; // positive when hip is lower on screen than the line

  return {
    elbow: angleAt(S, E, W),
    line: angleAt(S, H, A),
    kneeLine: angleAt(S, H, K),
    shinDrop: ankleSeen ? (A.y - K.y) / len : null,
    incline: tilt(S, A),
    inclineKnee: tilt(S, K),
    hipSide: below >= 0 ? 1 : -1,
    handsDown: W.y > S.y,
    shoulder: S,
    wrist: W,
    foot: A,
    kneePoint: K,
    bodyLen: len,
  };
}

type Phase = 'top' | 'down' | 'bottom';

interface RepTrack {
  startT: number;
  bottomReached: boolean;
  minElbow: number;
  minLine: number;
  hipSideSum: number;
  frames: number;
  horizontalFrames: number;
  shinSum: number;
  shinFrames: number;
  wrist0: Point;
  foot0: Point;
  knee0: Point;
  shoulderY0: number;
  maxShoulderY: number;
  maxShift: number;
  maxKneeShift: number;
  bodyLen: number;
  topElbow: number;
  lineCued: boolean;
}

/** What the screen needs to know right now. */
export interface PushupView {
  /** The body is clearly seen this frame. */
  tracking: boolean;
  /** Checklist for the "get in position" screen. */
  horizontal: boolean;
  armsStraight: boolean;
  handsDown: boolean;
  /** All of the above, held steady. 0 to 1: how much of the hold is done. */
  readyProgress: number;
  ready: boolean;
  phase: Phase;
  reps: number;
  elbowDeg: number | null;
  lineDeg: number | null;
  variant: Variant;
  lastReject: RejectReason | null;
}

export class PushupDetector {
  private side: Side | null = null;
  private readonly elbowSmooth = new Smoother(80);
  private readonly lineSmooth = new Smoother(140);
  private phase: Phase = 'top';
  private rep: RepTrack | null = null;
  private reps = 0;
  private counting = false;
  private lastSeenT = 0;
  private lastShoulder: Point | null = null;
  private lastShoulderT = 0;
  private readySince: number | null = null;
  private outSince: number | null = null;
  private leftSent = false;
  private topElbow = 0;
  private lastVariant: Variant = 'standard';
  private lastReject: RejectReason | null = null;
  private current: Features | null = null;
  private elbowNow: number | null = null;
  private lineNow: number | null = null;
  private readyProgress = 0;

  /** Begin counting reps. Before this, the detector only checks the start position. */
  startCounting(): void {
    this.counting = true;
    this.phase = 'top';
    this.rep = null;
    this.outSince = null;
    this.leftSent = false;
  }

  stopCounting(): void {
    this.counting = false;
    this.rep = null;
  }

  reset(): void {
    this.stopCounting();
    this.side = null;
    this.reps = 0;
    this.readySince = null;
    this.lastShoulder = null;
    this.lastReject = null;
    this.elbowSmooth.reset();
    this.lineSmooth.reset();
    this.readyProgress = 0;
  }

  get view(): PushupView {
    const f = this.current;
    const knee = this.lastVariant === 'knee';
    const horizontal = !!f && (knee ? f.inclineKnee <= PUSHUP.maxInclineKneeDeg : f.incline <= PUSHUP.maxInclineDeg);
    return {
      tracking: f !== null,
      horizontal,
      armsStraight: (this.elbowNow ?? 0) >= PUSHUP.upDeg,
      handsDown: !!f && f.handsDown,
      readyProgress: this.readyProgress,
      ready: this.readyProgress >= 1,
      phase: this.phase,
      reps: this.reps,
      elbowDeg: this.elbowNow,
      lineDeg: this.lineNow,
      variant: this.lastVariant,
      lastReject: this.lastReject,
    };
  }

  update(frame: Frame): DetectorEvent[] {
    const events: DetectorEvent[] = [];
    const t = frame.t;
    const f = this.read(frame);
    this.current = f;

    if (!f) {
      this.elbowNow = null;
      this.lineNow = null;
      this.readySince = null;
      this.readyProgress = 0;
      // Mid-rep and unseen for too long: throw the rep away.
      if (this.rep && t - this.lastSeenT > PUSHUP.lostMs) {
        this.fail(events, 'lost', 'stay-in-frame');
      }
      this.trackAbsence(events, t);
      return events;
    }
    this.lastSeenT = t;

    // A body cannot teleport. If it seems to, the tracker switched person.
    if (this.lastShoulder && t - this.lastShoulderT < 400) {
      const moved = Math.hypot(f.shoulder.x - this.lastShoulder.x, f.shoulder.y - this.lastShoulder.y);
      if (moved > PUSHUP.jumpShare * f.bodyLen) {
        this.elbowSmooth.reset();
        this.lineSmooth.reset();
        if (this.rep) this.fail(events, 'jump', 'stay-in-frame');
      }
    }
    this.lastShoulder = f.shoulder;
    this.lastShoulderT = t;

    // Knees down, or lower legs hidden: judge the line from shoulder to knee.
    const kneeStyle = f.shinDrop === null || f.shinDrop < PUSHUP.kneeShinDrop;
    const line = this.lineSmooth.update(kneeStyle ? f.kneeLine : f.line, t);
    const elbow = this.elbowSmooth.update(f.elbow, t);
    this.elbowNow = elbow;
    this.lineNow = line;
    const horizontal = kneeStyle ? f.inclineKnee <= PUSHUP.maxInclineKneeDeg : f.incline <= PUSHUP.maxInclineDeg;
    if (!this.rep) this.lastVariant = kneeStyle ? 'knee' : 'standard';

    // ---- start-position gate
    const inStartPose = horizontal && f.handsDown && elbow >= PUSHUP.upDeg && line >= 155;
    // Remember how straight the arms get while at the top (for the "lock out" mark).
    if (this.phase === 'top' && elbow >= PUSHUP.upDeg) this.topElbow = Math.max(this.topElbow, elbow);
    if (inStartPose) {
      this.readySince ??= t;
      this.readyProgress = Math.min(1, (t - this.readySince) / PUSHUP.readyHoldMs);
    } else {
      this.readySince = null;
      this.readyProgress = 0;
    }

    if (!this.counting) return events;

    // ---- has the person left the push-up position?
    if (horizontal && f.handsDown) {
      this.outSince = null;
      this.leftSent = false;
    } else {
      this.trackAbsence(events, t);
    }

    // ---- the turnstile
    if (this.phase === 'top') {
      if (elbow < PUSHUP.startDeg && horizontal && f.handsDown) {
        this.phase = 'down';
        this.rep = {
          startT: t,
          bottomReached: false,
          minElbow: elbow,
          minLine: line,
          hipSideSum: 0,
          frames: 0,
          horizontalFrames: 0,
          shinSum: 0,
          shinFrames: 0,
          wrist0: f.wrist,
          foot0: f.foot,
          knee0: f.kneePoint,
          shoulderY0: f.shoulder.y,
          maxShoulderY: f.shoulder.y,
          maxShift: 0,
          maxKneeShift: 0,
          bodyLen: f.bodyLen,
          topElbow: this.topElbow || PUSHUP.upDeg,
          lineCued: false,
        };
      }
      return events;
    }

    const rep = this.rep;
    if (!rep) {
      this.phase = 'top';
      return events;
    }

    // Collect evidence about this rep.
    rep.frames++;
    if (horizontal) rep.horizontalFrames++;
    rep.minElbow = Math.min(rep.minElbow, elbow);
    rep.minLine = Math.min(rep.minLine, line);
    rep.hipSideSum += f.hipSide;
    if (f.shinDrop !== null) {
      rep.shinSum += f.shinDrop;
      rep.shinFrames++;
    }
    rep.maxShoulderY = Math.max(rep.maxShoulderY, f.shoulder.y);
    const shift = (p: Point, p0: Point) => Math.hypot(p.x - p0.x, p.y - p0.y) / rep.bodyLen;
    rep.maxShift = Math.max(rep.maxShift, shift(f.wrist, rep.wrist0), shift(f.foot, rep.foot0));
    rep.maxKneeShift = Math.max(rep.maxKneeShift, shift(f.wrist, rep.wrist0), shift(f.kneePoint, rep.knee0));

    // A nudge during the rep if the body line is clearly off.
    if (!rep.lineCued && line < PUSHUP.minLineDeg + 3 && rep.frames >= 3) {
      rep.lineCued = true;
      events.push({ type: 'cue', cue: f.hipSide > 0 ? 'hips-up' : 'hips-down' });
    }

    if (t - rep.startT > PUSHUP.maxRepMs) {
      // Stuck half-way for ages: quietly forget it.
      this.rep = null;
      this.phase = 'top';
      return events;
    }

    if (this.phase === 'down' && elbow <= PUSHUP.downDeg) {
      this.phase = 'bottom';
      rep.bottomReached = true;
    }

    if (elbow >= PUSHUP.upDeg) {
      this.finish(events, rep, t, elbow);
    }
    return events;
  }

  // ------------------------------------------------------------- internals

  private read(frame: Frame): Features | null {
    const pose = frame.pose;
    if (!pose) return null;
    // Pick the side facing the camera once, and stick with it. Flipping
    // sides mid-rep would make the angles jump.
    if (this.side === null || !this.rep) {
      const left = sideVisibility(pose, 'left');
      const right = sideVisibility(pose, 'right');
      const best: Side = left >= right ? 'left' : 'right';
      if (this.side === null) this.side = best;
      else if (best !== this.side && Math.abs(left - right) > 1.2) {
        this.side = best;
        this.elbowSmooth.reset();
        this.lineSmooth.reset();
      }
    }
    return pushupFeatures(pose, frame.aspect, this.side);
  }

  private trackAbsence(events: DetectorEvent[], t: number): void {
    if (!this.counting) return;
    this.outSince ??= t;
    if (!this.leftSent && t - this.outSince > PUSHUP.leftMs) {
      this.leftSent = true;
      events.push({ type: 'left' });
    }
  }

  private fail(events: DetectorEvent[], reason: RejectReason, cue: Cue): void {
    this.rep = null;
    this.phase = 'top';
    this.lastReject = reason;
    events.push({ type: 'reject', reason, cue });
  }

  private finish(events: DetectorEvent[], rep: RepTrack, t: number, elbowNow: number): void {
    const durationMs = t - rep.startT;
    const variant: Variant =
      rep.shinFrames === 0 || rep.shinSum / rep.shinFrames < PUSHUP.kneeShinDrop ? 'knee' : 'standard';
    const shift = variant === 'knee' ? rep.maxKneeShift : rep.maxShift;
    const sag = rep.hipSideSum >= 0;
    const lineCue: Cue = sag ? 'hips-up' : 'hips-down';

    if (!rep.bottomReached) {
      // Dipped a little and came back. Only mention it if it was a real attempt.
      if (rep.minElbow < 132 && durationMs >= 300) return this.fail(events, 'shallow', 'go-lower');
      this.rep = null;
      this.phase = 'top';
      return;
    }
    if (durationMs < PUSHUP.minRepMs) return this.fail(events, 'too-fast', 'slow-down');
    if (rep.horizontalFrames / Math.max(1, rep.frames) < 0.8) return this.fail(events, 'not-horizontal', 'get-horizontal');
    if (shift > PUSHUP.maxPlantedShift) return this.fail(events, 'moved', 'keep-still');
    const drop = (rep.maxShoulderY - rep.shoulderY0) / rep.bodyLen;
    if (drop < PUSHUP.minShoulderDrop) return this.fail(events, 'no-body-movement', 'go-lower');
    if (rep.minLine < PUSHUP.minLineDeg) return this.fail(events, 'body-line', lineCue);

    // ---- form score: four ingredients, weighted like marks in an exam.
    const depth = remap(rep.minElbow, 100, 85, 0.55, 1); // deeper is better
    const line = remap(rep.minLine, PUSHUP.minLineDeg, 170, 0.3, 1); // straighter is better
    const lockout = remap(Math.max(rep.topElbow, elbowNow), 150, 165, 0.6, 1); // full extension at the top
    const tempo = remap(durationMs, PUSHUP.minRepMs, 1000, 0.6, 1); // controlled, not rushed
    const score = Math.round(100 * (0.4 * depth + 0.35 * line + 0.15 * lockout + 0.1 * tempo));

    // The weakest ingredient decides what the coach says.
    let cue: Cue = 'nice';
    if (rep.minLine < PUSHUP.cueLineDeg) cue = lineCue;
    else if (depth < 0.75) cue = 'go-lower';
    else if (tempo < 0.75) cue = 'slow-down';
    else if (lockout < 0.8) cue = 'lock-out';

    this.reps++;
    this.rep = null;
    this.phase = 'top';
    this.lastVariant = variant;
    this.lastReject = null;
    // Start measuring the next top position from scratch.
    this.topElbow = 0;
    events.push({ type: 'rep', count: this.reps, score, durationMs, depthDeg: rep.minElbow, variant, cue });
  }
}
