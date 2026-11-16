// The exercise library: every exercise the coach knows.
//
// Each entry says what the exercise is, how to count it with the camera
// (its "spec" for one of the shared engines), how to draw it, and how it
// gets harder across three versions.
//
// Only exercises the camera can judge reliably are here. Left out on
// purpose: superman and reverse snow angels (the lift is too small to
// measure from the side) and side plank (the body hides itself). See
// DECISIONS.md.
import { AlternateDetector } from '../detectors/alternateEngine';
import { HoldDetector } from '../detectors/holdEngine';
import { angle, bodyScale, distance, midpoint, seen, sideOfLine, steepness, type SideJoints } from '../detectors/joints';
import { PushupDetector } from '../detectors/pushup';
import { RepDetector, type RepSpec, type Verdict } from '../detectors/repEngine';
import { remap } from '../detectors/signal';
import type { Cue, Detector, DetectorEvent, Frame, LiveView } from '../detectors/types';
import type { Limit } from '../profile/profile';
import * as M from './models';

export type ExerciseId =
  | 'pushup'
  | 'squat'
  | 'lunge'
  | 'bridge'
  | 'situp'
  | 'plank'
  | 'climber'
  | 'jack'
  | 'highknees'
  | 'birddog'
  | 'goodmorning'
  | 'burpee';

export type Level = 1 | 2 | 3;
export type Focus = 'push' | 'legs' | 'core' | 'cardio' | 'back';

export interface ExerciseDef {
  id: ExerciseId;
  name: string;
  kind: 'reps' | 'hold';
  view: 'side' | 'front';
  focus: Focus[];
  /** Effort compared with sitting still, for calorie estimates. */
  met: number;
  /** How hard one rep (or one second) is, for points later. Push-up = 1. */
  weight: number;
  /** Typical seconds for one rep, for planning how long a session takes. */
  secPerRep: number;
  /** Starting target (reps, or seconds for holds) for each level. */
  base: [number, number, number];
  /** Beginner, standard and advanced versions. */
  versions: [VersionDef, VersionDef, VersionDef];
  tips: string[];
  /** Body areas this exercise loads. If the user protects one, it is swapped. */
  avoid: Limit[];
  detector(level: Level): Detector;
  /**
   * The stick figure at one moment. `phase` runs 0 → 1 over a rep.
   * `amount` 1 is an honest rep; 0.5 would be a half rep (used in tests).
   */
  body(phase: number, level: Level, amount?: number): M.Body;
  /** A natural number of seconds for one rep of this version. */
  repSec(level: Level): number;
}

export interface VersionDef {
  name: string;
  how: string;
}

const PLACE_SIDE = 'Stand side-on to the phone';
const PLACE_FRONT = 'Face the phone';
export const placement = (def: ExerciseDef): string => (def.view === 'side' ? PLACE_SIDE : PLACE_FRONT);

// ------------------------------------------------------------ small helpers

const ease = (k: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, k)))) / 2;

/**
 * The shape of one rep over time: 0 at rest, 1 at the peak.
 * `hold` is the share of the rep spent paused at the peak.
 * `rise` is the share of the moving time spent going TOWARDS the peak.
 */
export function wave(phase: number, hold = 0, rise = 0.5): number {
  const p = ((phase % 1) + 1) % 1;
  const moving = 1 - hold;
  const up = moving * rise;
  if (p < up) return ease(p / up);
  if (p < up + hold) return 1;
  return ease((1 - p) / (moving - up));
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const good = (score: number, cue: Cue = 'nice'): Verdict => ({ ok: true, score, cue });
const pick = <T>(level: Level, values: readonly [T, T, T]): T => values[level - 1]!;

const CHECK_SIDE: [string, string] = ['I can see your whole body', 'Side-on to the phone'];
const CHECK_FRONT: [string, string] = ['I can see your whole body', 'Facing the phone, standing tall'];

// --------------------------------------------------------------- push-up
// The push-up has its own detector (written first, with extra checks), so
// here it is wrapped to look like every other detector.

class PushupAdapter implements Detector {
  private readonly inner: PushupDetector;
  constructor(level: Level) {
    this.inner = new PushupDetector(level === 3 ? 900 : 0);
  }
  update(frame: Frame): DetectorEvent[] {
    return this.inner.update(frame);
  }
  startCounting(): void {
    this.inner.startCounting();
  }
  stopCounting(): void {
    this.inner.stopCounting();
  }
  get view(): LiveView {
    const v = this.inner.view;
    return {
      tracking: v.tracking,
      ready: v.ready,
      readyProgress: v.readyProgress,
      count: v.reps,
      checks: [
        { label: 'I can see your whole body', ok: v.tracking },
        { label: 'Side-on, body flat like a plank', ok: v.tracking && v.horizontal },
        { label: 'Arms straight, hands on the floor', ok: v.tracking && v.armsStraight && v.handsDown },
      ],
      debug: `elbow ${v.elbowDeg === null ? '-' : v.elbowDeg.toFixed(0)}° line ${v.lineDeg === null ? '-' : v.lineDeg.toFixed(0)}° · ${v.phase} · ${
        v.variant
      } · last reject: ${v.lastReject ?? '-'}`,
    };
  }
}

// ----------------------------------------------------------------- squat

function squatSpec(level: Level): RepSpec {
  const peak = pick(level, [125, 102, 102]);
  const pause = level === 3 ? 1200 : 0;
  return {
    variant: pick(level, ['half', 'standard', 'pause']),
    view: 'side',
    rest: 158,
    start: 150,
    peak,
    minRepMs: 600,
    minTravel: 0.07,
    maxShift: 0.12,
    shallowCue: 'go-lower',
    checkLabels: [...CHECK_SIDE, 'Standing tall, legs straight'],
    measure(_sk, n, f) {
      if (!seen(0.5, n.shoulder, n.hip, n.knee, n.ankle)) return null;
      const scale = bodyScale(n);
      const torso = steepness(n.hip, n.shoulder);
      return {
        signal: angle(n.hip, n.knee, n.ankle),
        // Upright-ish torso, and hips above the feet (not lying down).
        posture: torso >= 30 && n.hip.y < n.ankle.y - 0.15 * scale,
        mover: n.hip,
        planted: [n.ankle],
        anchor: n.ankle,
        scale,
        form: torso,
        // How far apart the feet are front-to-back: small for a squat, large for a lunge.
        aux: seen(0.35, f.ankle) ? Math.abs(n.ankle.x - f.ankle.x) / scale : 0,
      };
    },
    judge(e) {
      if (e.auxMax > 0.25) return { ok: false, reason: 'wrong-shape', cue: 'get-in-position' };
      if (pause && e.pauseMs < pause) return { ok: false, reason: 'no-pause', cue: 'hold-it' };
      const depth = remap(e.peak, peak, peak - 15, 0.6, 1);
      const chest = remap(e.formMin, 30, 50, 0.5, 1);
      const tempo = remap(e.durationMs, 600, 1300, 0.6, 1);
      const cue: Cue = chest < 0.7 ? 'chest-up' : depth < 0.75 ? 'go-lower' : tempo < 0.75 ? 'slow-down' : 'nice';
      return good(100 * (0.5 * depth + 0.3 * chest + 0.2 * tempo), cue);
    },
  };
}

// ----------------------------------------------------------------- lunge

function lungeSpec(level: Level): RepSpec {
  const peak = pick(level, [128, 108, 108]);
  const pause = level === 3 ? 1200 : 0;
  return {
    variant: pick(level, ['half', 'standard', 'pause']),
    view: 'side',
    rest: 160,
    start: 150,
    peak,
    minRepMs: 700,
    minTravel: 0.05,
    maxShift: 10, // the back foot is meant to move
    shallowCue: 'go-lower',
    checkLabels: [...CHECK_SIDE, 'Standing tall, feet together'],
    measure(_sk, n, f) {
      if (!seen(0.5, n.shoulder, n.hip, n.knee, n.ankle)) return null;
      const scale = bodyScale(n);
      const farSeen = seen(0.35, f.hip, f.knee, f.ankle);
      const nearKnee = angle(n.hip, n.knee, n.ankle);
      const farKnee = farSeen ? angle(f.hip, f.knee, f.ankle) : 180;
      const torso = steepness(n.hip, n.shoulder);
      return {
        signal: Math.min(nearKnee, farKnee),
        posture: torso >= 55 && n.hip.y < n.ankle.y - 0.15 * scale,
        mover: n.hip,
        planted: [],
        anchor: n.hip,
        scale,
        form: torso,
        // How far apart the feet are: a lunge has a long stance, a squat does not.
        aux: farSeen ? Math.abs(n.ankle.x - f.ankle.x) / scale : 0,
      };
    },
    judge(e) {
      if (e.auxMax < 0.3) return { ok: false, reason: 'wrong-shape', cue: 'step-back' };
      if (pause && e.pauseMs < pause) return { ok: false, reason: 'no-pause', cue: 'hold-it' };
      const depth = remap(e.peak, peak, peak - 12, 0.6, 1);
      const tall = remap(e.formMin, 55, 75, 0.5, 1);
      const cue: Cue = tall < 0.7 ? 'chest-up' : depth < 0.75 ? 'go-lower' : 'nice';
      return good(100 * (0.55 * depth + 0.45 * tall), cue);
    },
  };
}

// ---------------------------------------------------------------- bridge

function bridgeSpec(level: Level): RepSpec {
  const peak = pick(level, [160, 165, 165]);
  const pause = pick(level, [0, 800, 2500]);
  return {
    variant: pick(level, ['standard', 'squeeze', 'long-hold']),
    view: 'side',
    rest: 148,
    start: 153,
    peak,
    minRepMs: 600,
    minTravel: 0.04,
    maxShift: 0.12,
    shallowCue: 'hips-up',
    checkLabels: [...CHECK_SIDE, 'On your back, knees bent, hips down'],
    measure(_sk, n) {
      if (!seen(0.5, n.shoulder, n.hip, n.knee, n.ankle)) return null;
      const scale = bodyScale(n);
      return {
        signal: angle(n.shoulder, n.hip, n.knee),
        // Lying on the back: knees are the highest point, shoulders are low.
        posture: n.knee.y < n.hip.y - 0.03 * scale && n.shoulder.y > n.knee.y && steepness(n.shoulder, n.hip) <= 40,
        mover: n.hip,
        planted: [n.ankle, n.shoulder],
        anchor: n.shoulder,
        scale,
      };
    },
    judge(e) {
      if (pause && e.pauseMs < pause) return { ok: false, reason: 'no-pause', cue: 'hold-it' };
      const height = remap(e.peak, peak, 175, 0.65, 1);
      return good(100 * height, height < 0.8 ? 'hips-up' : 'nice');
    },
  };
}

// ---------------------------------------------------------------- sit-up

function situpSpec(level: Level): RepSpec {
  const peak = pick(level, [35, 58, 58]);
  const slow = level === 3 ? 2800 : 0;
  return {
    variant: pick(level, ['crunch', 'standard', 'slow']),
    view: 'side',
    rest: 22,
    start: 28,
    peak,
    minRepMs: 700,
    minTravel: 0.07,
    maxShift: 0.12,
    shallowCue: 'go-higher',
    checkLabels: [...CHECK_SIDE, 'On your back, knees bent'],
    measure(_sk, n) {
      if (!seen(0.5, n.shoulder, n.hip, n.knee, n.ankle)) return null;
      const scale = bodyScale(n);
      return {
        // How far the torso has risen off the floor, in degrees.
        signal: steepness(n.hip, n.shoulder),
        // Hips on the floor with knees bent up.
        posture: n.knee.y < n.hip.y - 0.08 * scale && n.ankle.y > n.hip.y - 0.1 * scale,
        mover: n.shoulder,
        planted: [n.hip, n.ankle],
        anchor: n.hip,
        scale,
      };
    },
    judge(e) {
      if (slow && e.durationMs < slow) return { ok: false, reason: 'too-fast', cue: 'slow-down' };
      const height = remap(e.peak, peak, peak + 15, 0.65, 1);
      const tempo = remap(e.durationMs, 700, 1500, 0.6, 1);
      return good(100 * (0.7 * height + 0.3 * tempo), height < 0.8 ? 'go-higher' : tempo < 0.75 ? 'slow-down' : 'nice');
    },
  };
}

// ---------------------------------------------------------- good morning

function goodMorningSpec(level: Level): RepSpec {
  const peak = pick(level, [138, 118, 118]);
  const pause = level === 3 ? 1200 : 0;
  return {
    variant: pick(level, ['shallow', 'standard', 'pause']),
    view: 'side',
    rest: 160,
    start: 152,
    peak,
    minRepMs: 700,
    minTravel: 0.08,
    maxShift: 0.1,
    shallowCue: 'go-lower',
    checkLabels: [...CHECK_SIDE, 'Standing tall'],
    measure(_sk, n) {
      if (!seen(0.5, n.shoulder, n.hip, n.knee, n.ankle)) return null;
      const scale = bodyScale(n);
      return {
        signal: angle(n.shoulder, n.hip, n.knee),
        posture: n.hip.y < n.ankle.y - 0.4 * scale,
        mover: n.shoulder,
        planted: [n.ankle],
        anchor: n.ankle,
        scale,
        // Knee angle: must stay nearly straight, or it is a squat.
        aux: angle(n.hip, n.knee, n.ankle),
      };
    },
    judge(e) {
      if (e.auxMin < 140) return { ok: false, reason: 'wrong-shape', cue: 'straight-legs' };
      if (pause && e.pauseMs < pause) return { ok: false, reason: 'no-pause', cue: 'hold-it' };
      const depth = remap(e.peak, peak, peak - 15, 0.65, 1);
      const legs = remap(e.auxMin, 140, 160, 0.6, 1);
      return good(100 * (0.6 * depth + 0.4 * legs), legs < 0.75 ? 'straight-legs' : depth < 0.8 ? 'go-lower' : 'nice');
    },
  };
}

// ---------------------------------------------------------------- burpee

function burpeeSpec(level: Level): RepSpec {
  return {
    variant: pick(level, ['walk-out', 'standard', 'with-pushup']),
    view: 'side',
    rest: 62,
    start: 55,
    peak: 32,
    minRepMs: 1200,
    maxRepMs: 15000,
    minTravel: 0.15,
    maxShift: 10,
    smoothMs: 100,
    shallowCue: 'get-horizontal',
    checkLabels: [...CHECK_SIDE, 'Standing tall'],
    measure(_sk, n) {
      if (!seen(0.5, n.shoulder, n.hip, n.ankle)) return null;
      const scale = distance(n.shoulder, n.hip) + (seen(0.4, n.knee) ? distance(n.hip, n.knee) + distance(n.knee, n.ankle) : distance(n.hip, n.ankle));
      const armsSeen = seen(0.4, n.elbow, n.wrist);
      return {
        // How upright the whole body is: about 90 standing, about 20 in a plank.
        signal: steepness(n.ankle, n.shoulder),
        posture: true,
        mover: n.shoulder,
        planted: [],
        anchor: n.hip,
        scale,
        // Hands below the shoulders (on the floor), as a share of body size.
        form: armsSeen ? (n.wrist.y - n.shoulder.y) / scale : 0,
        aux: armsSeen ? angle(n.shoulder, n.elbow, n.wrist) : 180,
      };
    },
    judge(e) {
      if (e.formPeakMax < 0.1) return { ok: false, reason: 'wrong-shape', cue: 'get-horizontal' };
      if (level === 3 && e.auxPeakMin > 115) return { ok: false, reason: 'shallow', cue: 'add-pushup' };
      const flat = remap(e.peak, 32, 22, 0.75, 1);
      return good(100 * flat);
    },
  };
}

// ------------------------------------------------------ mountain climber

function climberSpec(level: Level): RepSpec {
  const peak = pick(level, [122, 108, 92]);
  return {
    variant: pick(level, ['slow', 'standard', 'deep']),
    view: 'side',
    rest: 150,
    start: 140,
    peak,
    minRepMs: 250,
    minTravel: 0.06,
    maxShift: 0.12,
    smoothMs: 60,
    shallowCue: 'knee-in',
    checkLabels: [...CHECK_SIDE, 'High plank, both legs back'],
    measure(_sk, n, f) {
      if (!seen(0.5, n.shoulder, n.hip, n.knee, n.wrist)) return null;
      const scale = seen(0.4, n.ankle) ? bodyScale(n) : distance(n.shoulder, n.hip) * 2.6;
      const nearHip = angle(n.shoulder, n.hip, n.knee);
      const farSeen = seen(0.35, f.hip, f.knee);
      const farHip = farSeen ? angle(n.shoulder, f.hip, f.knee) : 180;
      return {
        // The more a knee drives towards the chest, the smaller this angle.
        signal: Math.min(nearHip, farHip),
        posture: steepness(n.hip, n.shoulder) <= 40 && n.wrist.y > n.shoulder.y + 0.1 * scale,
        mover: farSeen && farHip < nearHip ? f.knee : n.knee,
        planted: [n.wrist],
        anchor: n.shoulder,
        scale,
      };
    },
    judge(e) {
      const drive = remap(e.peak, peak, peak - 20, 0.7, 1);
      return good(100 * drive, drive < 0.8 ? 'knee-in' : 'nice');
    },
  };
}

// --------------------------------------------------------- jumping jack

function facingFront(l: SideJoints, r: SideJoints): { ok: boolean; torso: number; shoulders: { x: number; y: number } } {
  const sm = midpoint(l.shoulder, r.shoulder);
  const hm = midpoint(l.hip, r.hip);
  const torso = distance(sm, hm);
  // Shoulders well apart = facing us. Hips clearly below shoulders = upright.
  const ok = Math.abs(l.shoulder.x - r.shoulder.x) >= 0.35 * torso && hm.y > sm.y + 0.5 * torso;
  return { ok, torso, shoulders: sm };
}

function jackSpec(level: Level): RepSpec {
  const peak = pick(level, [0.5, 0.72, 0.88]);
  return {
    variant: pick(level, ['half', 'standard', 'wide']),
    view: 'front',
    rest: 0.2,
    start: 0.3,
    peak,
    minRepMs: 300,
    minTravel: 0.2,
    maxShift: 10,
    smoothMs: 60,
    shallowCue: 'arms-up',
    checkLabels: [...CHECK_FRONT, 'Feet together, arms down'],
    measure(_sk, l, r) {
      if (!seen(0.5, l.shoulder, r.shoulder, l.hip, r.hip, l.wrist, r.wrist, l.ankle, r.ankle)) return null;
      const face = facingFront(l, r);
      const wrists = midpoint(l.wrist, r.wrist);
      // Arms: -1 hanging down, 0 at shoulder height, +1 straight overhead.
      const arms = (face.shoulders.y - wrists.y) / face.torso;
      // Feet: distance apart, measured in shoulder widths.
      const feet = Math.abs(l.ankle.x - r.ankle.x) / Math.max(Math.abs(l.shoulder.x - r.shoulder.x), 0.3 * face.torso);
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      return {
        signal: 0.5 * clamp((arms + 0.8) / 1.7) + 0.5 * clamp((feet - 0.9) / 1.3),
        posture: face.ok,
        mover: wrists,
        planted: [],
        anchor: midpoint(l.hip, r.hip),
        scale: bodyScale(l),
        form: arms,
        aux: feet,
      };
    },
    judge(e) {
      if (e.auxMax < (level === 1 ? 1.15 : 1.5)) return { ok: false, reason: 'shallow', cue: 'feet-wider' };
      if (level > 1 && e.formMax < 0.55) return { ok: false, reason: 'shallow', cue: 'arms-up' };
      const open = remap(e.peak, peak, Math.min(1, peak + 0.15), 0.75, 1);
      return good(100 * open, level > 1 && e.formMax < 0.8 ? 'arms-up' : 'nice');
    },
  };
}

// ----------------------------------------------------------- bird-dog

function birdDogSpec(level: Level): RepSpec {
  const pause = pick(level, [0, 1500, 3000]);
  return {
    variant: pick(level, ['standard', 'hold', 'long-hold']),
    view: 'side',
    rest: 118,
    start: 126,
    peak: level === 1 ? 145 : 150,
    minRepMs: 700,
    minTravel: 0.15,
    maxShift: 10,
    shallowCue: 'reach-long',
    checkLabels: [...CHECK_SIDE, 'On hands and knees'],
    measure(_sk, n, f) {
      if (!seen(0.5, n.shoulder, n.hip)) return null;
      const scale = distance(n.shoulder, n.hip) * 2.6;
      const sides = [n, f];
      let arm = 0;
      let leg = 0;
      let lowestWrist = -Infinity;
      let lowestKnee = -Infinity;
      let highWrist: { x: number; y: number } | null = null;
      for (const s of sides) {
        if (seen(0.35, s.wrist)) {
          arm = Math.max(arm, angle(n.hip, n.shoulder, s.wrist));
          lowestWrist = Math.max(lowestWrist, s.wrist.y);
          if (!highWrist || s.wrist.y < highWrist.y) highWrist = s.wrist;
        }
        if (seen(0.35, s.ankle)) leg = Math.max(leg, angle(n.shoulder, n.hip, s.ankle));
        if (seen(0.35, s.knee)) lowestKnee = Math.max(lowestKnee, s.knee.y);
      }
      if (!highWrist) return null;
      return {
        // Both the arm AND the opposite leg must stretch out, so we take the weaker of the two.
        signal: Math.min(arm, leg),
        // All fours: flat back, one knee and one hand on the floor.
        posture: steepness(n.hip, n.shoulder) <= 30 && lowestKnee > n.hip.y + 0.15 * scale && lowestWrist > n.shoulder.y + 0.2 * scale,
        mover: highWrist,
        planted: [],
        anchor: n.hip,
        scale,
      };
    },
    judge(e) {
      if (pause && e.pauseMs < pause) return { ok: false, reason: 'no-pause', cue: 'hold-it' };
      const reach = remap(e.peak, 145, 170, 0.7, 1);
      return good(100 * reach, reach < 0.8 ? 'reach-long' : 'nice');
    },
  };
}

// ------------------------------------------------------------- plank

function plankDetector(level: Level): Detector {
  const minLine = level === 3 ? 166 : 158;
  return new HoldDetector({
    variant: pick(level, ['knee', 'standard', 'strict']),
    checkLabels: ['I can see your whole body', 'Side-on, propped on your forearms', 'Body in one straight line'],
    measure(_sk, n) {
      if (!seen(0.5, n.shoulder, n.elbow, n.hip, n.knee)) return null;
      const ankleSeen = seen(0.4, n.ankle);
      const scale = ankleSeen ? bodyScale(n) : distance(n.shoulder, n.hip) * 2.6;
      // On the knees the shin lies flat, so the ankle is not below the knee.
      const onKnees = !ankleSeen || (n.ankle.y - n.knee.y) / scale < 0.035;
      const end = onKnees ? n.knee : n.ankle;
      const line = angle(n.shoulder, n.hip, end);
      const tilt = steepness(end, n.shoulder);
      // The arms must really hold the body up: elbow (or hand) well below the shoulder.
      const support = Math.max(n.elbow.y, seen(0.4, n.wrist) ? n.wrist.y : 0) - n.shoulder.y >= 0.12 * scale;
      const posture = tilt <= (onKnees ? 48 : 38) && support;
      let cue: Cue | null = null;
      if (!posture) cue = 'get-in-position';
      else if (level > 1 && onKnees) cue = 'knees-up';
      else if (line < minLine) cue = sideOfLine(n.shoulder, end, n.hip) > 0 ? 'hips-up' : 'hips-down';
      return {
        posture,
        valid: cue === null,
        cue,
        quality: remap(line, minLine, 176, 0.6, 1),
        debug: `line ${line.toFixed(0)}° tilt ${tilt.toFixed(0)}° ${onKnees ? 'knees' : 'toes'}`,
      };
    },
  });
}

// --------------------------------------------------------- high knees

function highKneesDetector(level: Level): Detector {
  return new AlternateDetector({
    variant: pick(level, ['march', 'standard', 'sprint']),
    peakDiff: pick(level, [0.3, 0.45, 0.55]),
    minHeight: pick(level, [-0.5, -0.27, -0.12]),
    minGapMs: 170,
    shallowCue: 'knees-higher',
    checkLabels: [...CHECK_FRONT, 'Both feet on the floor'],
    measure(sk) {
      const l = sk.left;
      const r = sk.right;
      if (!seen(0.5, l.shoulder, r.shoulder, l.hip, r.hip, l.knee, r.knee)) return null;
      const face = facingFront(l, r);
      // Knee height compared with the hip: about -0.8 standing, 0 at hip level.
      const left = (l.hip.y - l.knee.y) / face.torso;
      const right = (r.hip.y - r.knee.y) / face.torso;
      return { diff: left - right, height: Math.max(left, right), posture: face.ok, resting: Math.abs(left - right) < 0.15 && Math.max(left, right) < -0.6 };
    },
  });
}

// ------------------------------------------------------------ the library

const rep = (spec: (level: Level) => RepSpec) => (level: Level) => new RepDetector(spec(level));

export const EXERCISES: Record<ExerciseId, ExerciseDef> = {
  pushup: {
    id: 'pushup',
    name: 'Push-up',
    kind: 'reps',
    view: 'side',
    focus: ['push', 'core'],
    met: 8,
    weight: 1,
    secPerRep: 2.2,
    base: [6, 8, 6],
    versions: [
      { name: 'Knee push-up', how: 'Knees on the mat, body straight from knees to shoulders.' },
      { name: 'Push-up', how: 'On your toes, body in one straight line.' },
      { name: 'Slow push-up', how: 'Take three slow seconds to lower, then push up.' },
    ],
    tips: [
      'Hands under your shoulders, body in one straight line.',
      'Lower your chest until your elbows bend to about a right angle.',
      'Push back up until your arms are straight.',
    ],
    avoid: [],
    detector: (level) => new PushupAdapter(level),
    body: (phase, level, amount = 1) => M.pushupBody(lerp(165, lerp(165, 80, amount), wave(phase, 0, level === 3 ? 0.7 : 0.5)), level === 1),
    repSec: (level) => (level === 3 ? 4.5 : 2),
  },
  squat: {
    id: 'squat',
    name: 'Squat',
    kind: 'reps',
    view: 'side',
    focus: ['legs'],
    met: 5.5,
    weight: 0.7,
    secPerRep: 2.2,
    base: [10, 12, 10],
    versions: [
      { name: 'Half squat', how: 'Sit back about half-way, as if towards a high stool.' },
      { name: 'Squat', how: 'Sit back and down until your thighs are about level with the floor.' },
      { name: 'Pause squat', how: 'Full squat, and hold the bottom for a slow count of one.' },
    ],
    tips: ['Feet shoulder-width apart, weight in your heels.', 'Push your hips back as if sitting on a chair.', 'Keep your chest up and your knees in line with your toes.'],
    avoid: ['knees'],
    detector: rep(squatSpec),
    body: (phase, level, amount = 1) => M.squat(lerp(172, lerp(172, pick(level, [112, 88, 88]), amount), wave(phase, level === 3 ? 0.4 : 0))),
    repSec: (level) => (level === 3 ? 4.2 : 2.2),
  },
  lunge: {
    id: 'lunge',
    name: 'Reverse lunge',
    kind: 'reps',
    view: 'side',
    focus: ['legs'],
    met: 5.5,
    weight: 0.8,
    secPerRep: 2.6,
    base: [8, 10, 8],
    versions: [
      { name: 'Half reverse lunge', how: 'Step back and lower half-way.' },
      { name: 'Reverse lunge', how: 'Step back and lower until both knees are about a right angle.' },
      { name: 'Pause lunge', how: 'Full lunge, and hold the bottom for a slow count of one.' },
    ],
    tips: ['Step one foot straight back, then lower your back knee towards the mat.', 'Keep your body tall, like sliding down a wall.', 'Push through your front heel to stand, then change legs.'],
    avoid: ['knees'],
    detector: rep(lungeSpec),
    body: (phase, level, amount = 1) => M.lunge(pick(level, [0.62, 1, 1]) * amount * wave(phase, level === 3 ? 0.4 : 0)),
    repSec: (level) => (level === 3 ? 4.4 : 2.6),
  },
  bridge: {
    id: 'bridge',
    name: 'Glute bridge',
    kind: 'reps',
    view: 'side',
    focus: ['back', 'legs'],
    met: 3.5,
    weight: 0.5,
    secPerRep: 2.4,
    base: [10, 12, 8],
    versions: [
      { name: 'Glute bridge', how: 'Lift your hips until knees, hips and shoulders line up.' },
      { name: 'Bridge with squeeze', how: 'Hold the top for one second and squeeze.' },
      { name: 'Long-hold bridge', how: 'Hold the top for three slow seconds every rep.' },
    ],
    tips: ['Lie on your back, knees bent, feet flat and hip-width apart.', 'Push through your heels and lift your hips.', 'Squeeze your bottom at the top. Do not arch your lower back.'],
    avoid: [],
    detector: rep(bridgeSpec),
    body: (phase, level, amount = 1) => M.bridge(amount * wave(phase, pick(level, [0, 0.35, 0.6]))),
    repSec: (level) => pick(level, [2.2, 3.4, 6]),
  },
  situp: {
    id: 'situp',
    name: 'Sit-up',
    kind: 'reps',
    view: 'side',
    focus: ['core'],
    met: 4,
    weight: 0.6,
    secPerRep: 2.6,
    base: [8, 10, 8],
    versions: [
      { name: 'Crunch', how: 'Curl your shoulders off the mat. Your lower back stays down.' },
      { name: 'Sit-up', how: 'Sit all the way up, then lower with control.' },
      { name: 'Slow sit-up', how: 'Sit up, then take three slow seconds to lower.' },
    ],
    tips: ['Lie on your back with your knees bent and feet flat.', 'Curl up using your tummy, not by pulling on your neck.', 'Lower slowly. The way down is half the work.'],
    avoid: ['back'],
    detector: rep(situpSpec),
    body: (phase, level, amount = 1) => M.situp(lerp(6, lerp(6, pick(level, [46, 74, 74]), amount), wave(phase, 0, level === 3 ? 0.3 : 0.5))),
    repSec: (level) => (level === 3 ? 5 : 2.4),
  },
  plank: {
    id: 'plank',
    name: 'Plank',
    kind: 'hold',
    view: 'side',
    focus: ['core', 'push'],
    met: 3.8,
    weight: 0.25,
    secPerRep: 1,
    base: [15, 25, 25],
    versions: [
      { name: 'Knee plank', how: 'Forearms and knees on the mat, body straight from knees to shoulders.' },
      { name: 'Plank', how: 'Forearms and toes on the mat, body in one straight line.' },
      { name: 'Strict plank', how: 'As the plank, held perfectly straight. The clock stops if you sag.' },
    ],
    tips: ['Elbows under your shoulders, forearms flat.', 'Squeeze your tummy and bottom so your hips do not sag or stick up.', 'Breathe steadily. The clock only runs while your form is good.'],
    avoid: [],
    detector: plankDetector,
    body: (_phase, level) => M.plank({ knees: level === 1 }),
    repSec: () => 1,
  },
  climber: {
    id: 'climber',
    name: 'Mountain climber',
    kind: 'reps',
    view: 'side',
    focus: ['cardio', 'core'],
    met: 8,
    weight: 0.4,
    secPerRep: 0.9,
    base: [12, 20, 20],
    versions: [
      { name: 'Slow climber', how: 'Step one knee forward at a time, without rushing.' },
      { name: 'Mountain climber', how: 'Drive your knees towards your chest, one after the other.' },
      { name: 'Deep climber', how: 'Bring each knee right up to your chest.' },
    ],
    tips: ['Start in a high plank, hands under your shoulders.', 'Pull one knee towards your chest, then swap.', 'Keep your hips low and your shoulders over your hands.'],
    avoid: ['wrists', 'shoulders'],
    detector: rep(climberSpec),
    // Legs take turns: the near leg on even reps, the far leg on odd reps.
    body: (phase, level, amount = 1) => M.climber(pick(level, [0.62, 0.8, 1]) * amount * wave(phase * 2), Math.floor((((phase % 1) + 1) % 1) * 2) === 0 ? 'near' : 'far'),
    repSec: () => 1.8, // two knee drives
  },
  jack: {
    id: 'jack',
    name: 'Jumping jack',
    kind: 'reps',
    view: 'front',
    focus: ['cardio'],
    met: 8,
    weight: 0.3,
    secPerRep: 1.1,
    base: [15, 25, 25],
    versions: [
      { name: 'Half jack', how: 'Step your feet out and raise your arms to shoulder height. No jump needed.' },
      { name: 'Jumping jack', how: 'Jump your feet wide and bring your hands overhead.' },
      { name: 'Wide jack', how: 'Jump extra wide with your arms fully overhead, every rep.' },
    ],
    tips: ['Stand tall, facing the phone.', 'Jump your feet apart as your arms go up.', 'Land softly on the balls of your feet.'],
    avoid: ['knees', 'shoulders'],
    detector: rep(jackSpec),
    body: (phase, level, amount = 1) => M.jack(pick(level, [0.62, 0.9, 1.05]) * amount * wave(phase)),
    repSec: () => 1.1,
  },
  highknees: {
    id: 'highknees',
    name: 'High knees',
    kind: 'reps',
    view: 'front',
    focus: ['cardio', 'legs'],
    met: 8,
    weight: 0.3,
    secPerRep: 0.5,
    base: [20, 30, 40],
    versions: [
      { name: 'Marching', how: 'March on the spot, lifting each knee clearly.' },
      { name: 'High knees', how: 'Run on the spot, lifting each knee towards hip height.' },
      { name: 'Sprint knees', how: 'As fast as you can, knees all the way to hip height.' },
    ],
    tips: ['Stand tall, facing the phone.', 'Lift one knee, then the other, like running on the spot.', 'Stay light on your feet and pump your arms.'],
    avoid: ['knees'],
    detector: highKneesDetector,
    body: (phase, level, amount = 1) => M.highKnee(pick(level, [0.62, 0.92, 1.1]) * amount * wave(phase * 2), Math.floor((((phase % 1) + 1) % 1) * 2) === 0 ? 'near' : 'far'),
    repSec: (level) => pick(level, [1.6, 1.0, 0.8]), // two knee lifts
  },
  birddog: {
    id: 'birddog',
    name: 'Bird-dog',
    kind: 'reps',
    view: 'side',
    focus: ['back', 'core'],
    met: 3,
    weight: 0.5,
    secPerRep: 3,
    base: [8, 8, 6],
    versions: [
      { name: 'Bird-dog', how: 'Reach one arm forward and the opposite leg back, then return.' },
      { name: 'Bird-dog hold', how: 'Hold the stretched position for two seconds.' },
      { name: 'Long bird-dog hold', how: 'Hold the stretched position for four seconds.' },
    ],
    tips: ['Start on hands and knees, back flat like a table.', 'Reach one arm forward and the opposite leg back until both are level with your body.', 'Do not let your hips twist. Swap sides each rep.'],
    avoid: ['wrists'],
    detector: rep(birdDogSpec),
    body: (phase, level, amount = 1) => M.birdDog(amount * wave(phase, pick(level, [0, 0.45, 0.62]))),
    repSec: (level) => pick(level, [2.6, 4.6, 7]),
  },
  goodmorning: {
    id: 'goodmorning',
    name: 'Good morning',
    kind: 'reps',
    view: 'side',
    focus: ['back', 'legs'],
    met: 3.5,
    weight: 0.5,
    secPerRep: 2.6,
    base: [8, 10, 8],
    versions: [
      { name: 'Small hip hinge', how: 'Bow forward a little from the hips, back straight.' },
      { name: 'Good morning', how: 'Bow forward until your chest is nearly level with the floor.' },
      { name: 'Pause good morning', how: 'Bow fully and hold for a slow count of one.' },
    ],
    tips: ['Stand tall, hands across your chest, knees soft.', 'Push your hips back and bow forward with a straight back.', 'Feel the stretch behind your thighs, then stand by squeezing your bottom.'],
    avoid: ['back'],
    detector: rep(goodMorningSpec),
    body: (phase, level, amount = 1) => M.goodMorning(lerp(175, lerp(175, pick(level, [128, 104, 104]), amount), wave(phase, level === 3 ? 0.4 : 0))),
    repSec: (level) => (level === 3 ? 4.4 : 2.6),
  },
  burpee: {
    id: 'burpee',
    name: 'Burpee',
    kind: 'reps',
    view: 'side',
    focus: ['cardio', 'push', 'legs'],
    met: 9,
    weight: 1.5,
    secPerRep: 3.5,
    base: [4, 6, 6],
    versions: [
      { name: 'Walk-out burpee', how: 'Crouch, step your feet back to a plank one at a time, step in, stand. No jumping.' },
      { name: 'Burpee', how: 'Crouch, kick both feet back to a plank, hop in, stand tall.' },
      { name: 'Push-up burpee', how: 'Add one push-up while you are in the plank.' },
    ],
    tips: ['Crouch and put your hands on the mat.', 'Get your feet back into a straight plank.', 'Bring your feet in and stand all the way up.'],
    avoid: ['wrists', 'knees', 'back', 'shoulders'],
    detector: rep(burpeeSpec),
    body: (phase, level, amount = 1) => (amount < 1 ? M.squat(lerp(172, 100, wave(phase))) : M.burpee(phase, level === 3)),
    repSec: () => 3.6,
  },
};

export const EXERCISE_IDS = Object.keys(EXERCISES) as ExerciseId[];

/** The words for one count: "rep", "reps", "second", "seconds". */
export function unit(def: ExerciseDef, n: number): string {
  if (def.kind === 'hold') return n === 1 ? 'second' : 'seconds';
  return n === 1 ? 'rep' : 'reps';
}
