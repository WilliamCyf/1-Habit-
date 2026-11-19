// The push-up counter. Works facing the phone (head towards the camera) or
// side-on, and works out which by itself.
//
// HOW IT JUDGES A PUSH-UP
// The main signal is how far your SHOULDERS drop towards your HANDS,
// compared with how high they were at the top of your own push-up:
//
//                 shoulder height now
//   depth = 1 −  ─────────────────────────
//                 shoulder height at the top
//
// 0 at the top, about 0.5 to 0.9 at the bottom of a real push-up. Because it
// is compared with YOUR top, it works whatever your size, however far away
// the phone is, and from the front or the side. Tested on real videos (see
// tests/real.test.ts).
//
// The elbow bend is a second signal, because when the phone is very close,
// the camera's angle hides some of the shoulder drop. The two are combined
// into one "progress" number, and a turnstile counts a rep only for the full
// journey: top → deep enough → back to the top.
//
//   TOP ── progress > 0.4 ──▶ GOING DOWN ── progress ≥ 0.9 ──▶ DEEP ENOUGH
//    ▲                                                            │
//    └────────────── progress < 0.3 (back up) ─────────────────────┘
//                   then the rep is checked and counted or rejected
//
// Pure logic: no camera, no screen. Feed it frames, get events back.
import { angle, readSkeleton, seen, steepness, type Joint, type SideJoints } from './joints';
import { MedianFilter, remap, Smoother } from './signal';
import type { Cue, Detector, DetectorEvent, Frame, LiveView, RejectReason } from './types';

export const PUSHUP = {
  /** Hold the start position this long before the set may begin. */
  readyHoldMs: 800,
  /** A whole rep (down and up) faster than this is a bounce, not a push-up. */
  minRepMs: 500,
  /** Give up on a rep that has been "in progress" for this long. */
  maxRepMs: 9000,
  /** How long the body may be unseen mid-rep before the rep is thrown away. */
  lostMs: 600,
  /** Out of position this long while counting = the person has left. */
  leftMs: 3500,
  /** Progress thresholds for the turnstile (see the diagram above). */
  startP: 0.4,
  bottomP: 0.9,
  endP: 0.3,
  /** A counted rep below this progress still gets "go lower" (it only just made it). */
  lowerCueP: 0.95,
  /**
   * A shoulder drop of this share of the top height counts as full depth
   * (90% of it reaches the "deep enough" line). Real push-ups drop 0.5 to 0.9;
   * half reps only about 0.15 to 0.2.
   */
  fullDepth: 0.4,
  /** An elbow angle this small counts as full depth. */
  fullElbow: 95,
  /** Every rep must drop the shoulders at least this much, whatever the elbows say. */
  minDrop: 0.12,
  /** Arms count as straight at or above this angle (real cameras rarely see more than 165°). */
  straightDeg: 140,
  /** At the top, the shoulders must be at least this many arm-lengths above the hands. */
  topHeight: 0.55,
  /** Nose more than this many arm-lengths ABOVE the shoulders = upright, not a push-up. */
  noseAbove: 0.3,
  /**
   * Hips more than this many arm-lengths BELOW the shoulders = upright. Real
   * push-ups measured at most 0.75 from any angle; standing measured 1.1–1.4.
   */
  hipsBelow: 0.95,
  /** Hands may shift this share of the top height during a rep. More = they or the phone moved. */
  maxHandShift: 0.45,
  /**
   * Side-on, the nose sits out in front of the shoulders; facing the phone it
   * is between them. Measured on real videos: facing 0.01–0.06 arm-lengths
   * off-centre, side-on 0.10–0.42.
   */
  sideNose: 0.1,
  /** Without a visible nose: shoulder width ÷ arm length below this = side-on. */
  sideRatio: 0.32,
  /** Side-on only: shoulder–hip–knee angle below this is rejected, below the cue line it is mentioned. */
  lineReject: 142,
  lineCue: 156,
  /** Side-on only: body tilted more than this from flat = not a push-up position. */
  maxTiltDeg: 45,
  /** A sudden move of this share of the top height between two looks = a different body. */
  jumpShare: 0.7,
} as const;

export type PushupView = 'front' | 'side';

interface Reading {
  /** Shoulders' height above the hands, in picture units (1 = picture height). */
  h: number;
  /** Combined elbow angle, or null if the arms are not clear. */
  elbow: number | null;
  /** Longest clearly seen arm (shoulder → elbow → wrist), in picture units. */
  arm: number;
  shoulders: Joint;
  hands: Joint;
  /** Each clearly seen wrist on its own, to check the hands stay planted. */
  wrists: Partial<Record<'left' | 'right', Joint>>;
  view: PushupView;
  /** In a push-up position at all (not standing, not sitting). */
  posture: boolean;
  /** Side-on only: shoulder–hip–knee angle, if clearly seen. */
  line: number | null;
  /** Side-on only: which side the hips are on, +1 sagging, -1 piked. */
  hipSide: number;
  /** The arms that are clear in this frame. */
  set: ArmSet;
}

interface Rep {
  startT: number;
  bottomT: number;
  /** When the deepest point was reached (for the slow version's "take your time going down"). */
  deepestT: number;
  maxP: number;
  maxDepth: number;
  minElbow: number;
  minLine: number;
  hipSideSum: number;
  frames: number;
  postureFrames: number;
  /** Where each clearly seen hand was when the rep began, and how far it has moved. */
  wrists0: Partial<Record<'left' | 'right', Joint>>;
  shift: Partial<Record<'left' | 'right' | 'both', number>>;
  hands0: Joint;
  topElbow: number;
}

type Phase = 'top' | 'down' | 'bottom';
/** Which arms the shoulder-height signal is measured from. */
type ArmSet = 'both' | 'left' | 'right';

export class PushupDetector implements Detector {
  private readonly hMedian = new MedianFilter(3);
  private readonly hSmooth = new Smoother(60);
  private readonly elbowMedian = { left: new MedianFilter(5), right: new MedianFilter(5) };
  private readonly elbowSmooth = new Smoother(80);

  private phase: Phase = 'top';
  private rep: Rep | null = null;
  private reps = 0;
  private counting = false;

  /** Calibration, taken while you hold the start position. */
  private hTop = 0;
  private elbowTop = 165;
  private lockedView: PushupView | null = null;
  /**
   * Decided once, at the top, then kept for the whole set. Switching between
   * "both arms" and "one arm" mid-set makes the height jump, because from an
   * angle the two arms look different heights.
   */
  private armSet: ArmSet | null = null;
  /** Highest shoulder position since the last rep, used to keep hTop up to date. */
  private peakSinceRep = 0;

  private hold: { since: number; hs: number[]; arms: number[]; elbows: number[]; views: PushupView[] } | null = null;
  private readyProgress = 0;
  private lastSeenT = 0;
  private lastShoulders: Joint | null = null;
  private lastShouldersT = 0;
  private jumpSuspect: Joint | null = null;
  private setVotes: ArmSet[] = [];
  private outSince: number | null = null;
  private leftSent = false;
  private now: Reading | null = null;
  private progressNow = 0;
  private lastReject: RejectReason | null = null;

  /**
   * @param minDownMs  for the "slow push-up" version: lowering must take at
   *                   least this long, or the rep is not counted.
   */
  constructor(private readonly minDownMs = 0) {}

  startCounting(): void {
    this.counting = true;
    this.phase = 'top';
    this.rep = null;
    this.outSince = null;
    this.leftSent = false;
    this.peakSinceRep = this.hTop;
  }

  stopCounting(): void {
    this.counting = false;
    this.rep = null;
  }

  get view(): LiveView {
    const r = this.now;
    const straight = !!r && r.elbow !== null && r.elbow >= PUSHUP.straightDeg;
    const where = (this.lockedView ?? r?.view) === 'side' ? 'side-on' : 'facing the phone';
    return {
      tracking: r !== null,
      ready: this.readyProgress >= 1,
      readyProgress: this.readyProgress,
      count: this.reps,
      checks: [
        { label: 'I can see your shoulders and arms', ok: r !== null },
        { label: r ? `Push-up position, ${where}` : 'Push-up position, facing the phone or side-on', ok: !!r && r.posture },
        { label: 'Arms straight, hold still', ok: !!r && r.posture && straight },
      ],
      debug: r
        ? `${r.view} · h ${r.h.toFixed(2)}/${this.hTop.toFixed(2)} · elbow ${r.elbow === null ? '-' : r.elbow.toFixed(0)}° · progress ${this.progressNow.toFixed(2)} · ${this.phase}${
            r.line !== null ? ` · line ${r.line.toFixed(0)}°` : ''
          } · last reject: ${this.lastReject ?? '-'}`
        : 'not seen',
    };
  }

  /** Which way the person is facing, once the set has started. */
  get facing(): PushupView | null {
    return this.lockedView;
  }

  update(frame: Frame): DetectorEvent[] {
    const events: DetectorEvent[] = [];
    const t = frame.t;
    const r = this.read(frame);
    this.now = r;

    if (!r) {
      this.hold = null;
      this.readyProgress = 0;
      if (this.rep && t - this.lastSeenT > PUSHUP.lostMs) this.fail(events, 'lost', 'stay-in-frame');
      this.absent(events, t);
      return events;
    }
    this.lastSeenT = t;

    // A body cannot teleport. If it seems to, the tracker switched person.
    const scale = this.hTop || r.arm;
    if (this.lastShoulders && t - this.lastShouldersT < 400) {
      const moved = Math.hypot(r.shoulders.x - this.lastShoulders.x, r.shoulders.y - this.lastShoulders.y);
      if (moved > PUSHUP.jumpShare * scale) {
        // One wild frame is the tracker stumbling. Two in a row, staying in
        // the new place, means it is now following someone else.
        if (this.jumpSuspect && Math.hypot(r.shoulders.x - this.jumpSuspect.x, r.shoulders.y - this.jumpSuspect.y) < 0.3 * scale) {
          this.jumpSuspect = null;
          this.resetSmoothing();
          if (this.rep) this.fail(events, 'jump', 'stay-in-frame');
        } else {
          this.jumpSuspect = r.shoulders;
          return events;
        }
      } else {
        this.jumpSuspect = null;
      }
    }
    if (!this.jumpSuspect) {
      this.lastShoulders = r.shoulders;
      this.lastShouldersT = t;
    }

    this.gate(r, t);
    if (!this.counting) return events;

    // Started without the gate (tests can do this): learn the top as we go.
    if (!this.armSet) {
      // Vote over a few frames, so one glitchy frame cannot decide.
      this.setVotes.push(r.set);
      if (this.setVotes.length < 6) return events;
      const count = (x: ArmSet) => this.setVotes.filter((v) => v === x).length;
      this.armSet = (['both', 'left', 'right'] as const).reduce((a, b) => (count(b) > count(a) ? b : a));
      this.setVotes = [];
      this.resetSmoothing();
      return events;
    }
    if (this.hTop === 0) {
      this.hTop = r.h;
    }

    if (r.posture) {
      this.outSince = null;
      this.leftSent = false;
    } else if (!this.rep) {
      this.absent(events, t);
    }

    const depth = Math.max(0, 1 - r.h / this.hTop);
    const elbowPart = r.elbow === null ? 0 : (this.elbowTop - r.elbow) / (this.elbowTop - PUSHUP.fullElbow);
    const p = Math.max(depth / PUSHUP.fullDepth, elbowPart);
    this.progressNow = p;

    if (this.phase === 'top') {
      this.peakSinceRep = Math.max(this.peakSinceRep, r.h);
      if (p > PUSHUP.startP && r.posture) this.begin(r, t);
      return events;
    }

    const rep = this.rep;
    if (!rep) {
      this.phase = 'top';
      return events;
    }
    rep.frames++;
    if (r.posture) rep.postureFrames++;
    if (p > rep.maxP) {
      rep.maxP = p;
      rep.deepestT = t;
    }
    rep.maxDepth = Math.max(rep.maxDepth, depth);
    if (r.elbow !== null) rep.minElbow = Math.min(rep.minElbow, r.elbow);
    if (r.line !== null) {
      rep.minLine = Math.min(rep.minLine, r.line);
      rep.hipSideSum += r.hipSide;
    }
    rep.shift.both = Math.max(rep.shift.both ?? 0, Math.hypot(r.hands.x - rep.hands0.x, r.hands.y - rep.hands0.y) / this.hTop);
    for (const side of ['left', 'right'] as const) {
      const w0 = rep.wrists0[side];
      const w = r.wrists[side];
      if (w0 && w) rep.shift[side] = Math.max(rep.shift[side] ?? 0, Math.hypot(w.x - w0.x, w.y - w0.y) / this.hTop);
    }

    if (t - rep.startT > PUSHUP.maxRepMs) {
      this.rep = null;
      this.phase = 'top';
      return events;
    }
    if (this.phase === 'down' && p >= PUSHUP.bottomP) {
      this.phase = 'bottom';
      rep.bottomT = t;
    }
    if (p < PUSHUP.endP) this.finish(events, rep, t, r);
    return events;
  }

  // ------------------------------------------------------------- internals

  private resetSmoothing(): void {
    this.hMedian.reset();
    this.hSmooth.reset();
    this.elbowMedian.left.reset();
    this.elbowMedian.right.reset();
    this.elbowSmooth.reset();
  }

  /** Turn 33 dots into the few numbers a push-up needs. Null if the arms are not clearly seen. */
  private read(frame: Frame): Reading | null {
    if (!frame.pose) return null;
    const sk = readSkeleton(frame.pose, frame.aspect);
    const arms = (['left', 'right'] as const)
      .map((side) => ({ side, j: sk[side], v: Math.min(sk[side].shoulder.v, sk[side].elbow.v, sk[side].wrist.v) }))
      .filter((a) => a.v >= 0.5);
    if (arms.length === 0) return null;

    const mean = (pts: Joint[]): Joint => ({
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
      v: Math.min(...pts.map((p) => p.v)),
    });
    // The arms measured: the locked set if there is one (accepting a little
    // less confidence, so a briefly fuzzy arm does not switch sets), otherwise
    // whatever is clear right now.
    let measured = arms;
    if (this.armSet) {
      const wanted = this.armSet === 'both' ? (['left', 'right'] as const) : [this.armSet];
      const loose = wanted.map((side) => ({ side, j: sk[side], v: Math.min(sk[side].shoulder.v, sk[side].elbow.v, sk[side].wrist.v) })).filter((a) => a.v >= 0.3);
      if (loose.length === wanted.length) measured = loose;
    }
    const shoulders = mean(measured.map((a) => a.j.shoulder));
    const hands = mean(measured.map((a) => a.j.wrist));
    const armLength = (s: SideJoints) => Math.hypot(s.shoulder.x - s.elbow.x, s.shoulder.y - s.elbow.y) + Math.hypot(s.elbow.x - s.wrist.x, s.elbow.y - s.wrist.y);
    const arm = Math.max(...arms.map((a) => armLength(a.j)));
    if (arm < 0.03) return null;

    // Shoulder height above the hands, with one-frame spikes removed, then smoothed.
    const h = this.hSmooth.update(this.hMedian.update(hands.y - shoulders.y), frame.t);

    // Elbows: each arm is spike-filtered on its own. If both are clear (facing
    // the phone) use their average; otherwise use the clearer one (side-on,
    // where the far arm is mostly a guess).
    const angles: number[] = [];
    const clear = arms.filter((a) => a.v >= 0.7);
    for (const a of clear.length ? clear : [arms.reduce((best, x) => (x.v > best.v ? x : best))]) {
      angles.push(this.elbowMedian[a.side].update(angle(a.j.shoulder, a.j.elbow, a.j.wrist)));
    }
    const elbow = this.elbowSmooth.update(angles.reduce((s, x) => s + x, 0) / angles.length, frame.t);

    // Which way are you facing? Side-on the nose is out in front of the
    // shoulders; facing the phone it is between them.
    const midX = (sk.left.shoulder.x + sk.right.shoulder.x) / 2;
    const shoulderWidth = seen(0.5, sk.left.shoulder, sk.right.shoulder) ? Math.abs(sk.left.shoulder.x - sk.right.shoulder.x) : 0;
    const view: PushupView =
      sk.nose.v >= 0.5 ? (Math.abs(sk.nose.x - midX) / arm > PUSHUP.sideNose ? 'side' : 'front') : shoulderWidth / arm < PUSHUP.sideRatio ? 'side' : 'front';

    // Posture: hands below the shoulders, and the head not held high above
    // them (which is what standing or kneeling upright looks like).
    let posture = hands.y - shoulders.y > -0.1 * arm;
    if (sk.nose.v >= 0.5 && (shoulders.y - sk.nose.y) / arm > PUSHUP.noseAbove) posture = false;
    const hipY = (sk.left.hip.y + sk.right.hip.y) / 2;
    if (Math.min(sk.left.hip.v, sk.right.hip.v) >= 0.7 && (hipY - shoulders.y) / arm > PUSHUP.hipsBelow) posture = false;

    // Side-on we can also see the hips: check the body is roughly flat, and
    // measure how straight the shoulder–hip–knee line is.
    let line: number | null = null;
    let hipSide = 0;
    const near = arms.reduce((best, x) => (x.v > best.v ? x : best)).j;
    if (view === 'side' && seen(0.6, near.hip, near.knee)) {
      if (steepness(near.hip, near.shoulder) > PUSHUP.maxTiltDeg) posture = false;
      line = angle(near.shoulder, near.hip, near.knee);
      const dx = near.knee.x - near.shoulder.x;
      const dy = near.knee.y - near.shoulder.y;
      const cross = (near.hip.x - near.shoulder.x) * dy - (near.hip.y - near.shoulder.y) * dx;
      hipSide = (dx >= 0 ? -cross : cross) >= 0 ? 1 : -1;
    }
    // Facing the phone, always follow both arms: the tracker sometimes swaps
    // left and right, and the average of both does not care.
    const bothLoose = Math.min(sk.left.shoulder.v, sk.left.wrist.v) >= 0.3 && Math.min(sk.right.shoulder.v, sk.right.wrist.v) >= 0.3;
    const set: ArmSet =
      clear.length === 2 || (view === 'front' && bothLoose) ? 'both' : (clear[0] ?? arms.reduce((best, x) => (x.v > best.v ? x : best))).side;
    const wrists: Reading['wrists'] = {};
    for (const a of clear) wrists[a.side] = a.j.wrist;
    return { h, elbow, arm, shoulders, hands, wrists, view, posture, line, hipSide, set };
  }

  /**
   * The start-position gate. Arms straight, in position, shoulders well above
   * the hands, held still for a moment. While held, it also measures YOUR
   * top position, which every rep is then compared with.
   */
  private gate(r: Reading, t: number): void {
    const ok = r.posture && r.elbow !== null && r.elbow >= PUSHUP.straightDeg && r.h >= PUSHUP.topHeight * r.arm;
    if (!ok || this.counting) {
      if (!ok) {
        this.hold = null;
        this.readyProgress = 0;
        if (!this.counting) this.armSet = null;
      }
      return;
    }
    if (!this.hold) {
      // Lock the arms for this hold, and start the shoulder signal afresh.
      this.armSet = r.set;
      this.hMedian.reset();
      this.hSmooth.reset();
      this.hold = { since: t, hs: [], arms: [], elbows: [], views: [] };
      return;
    }
    const hold = this.hold;
    hold.hs.push(r.h);
    hold.arms.push(r.arm);
    hold.elbows.push(r.elbow!);
    hold.views.push(r.view);
    // Moving a lot while "holding" restarts the hold.
    const hi = Math.max(...hold.hs);
    const lo = Math.min(...hold.hs);
    if (hi - lo > 0.15 * hi) {
      this.hold = { since: t, hs: [r.h], arms: [r.arm], elbows: [r.elbow!], views: [r.view] };
    }
    this.readyProgress = Math.min(1, (t - this.hold.since) / PUSHUP.readyHoldMs);
    if (this.readyProgress >= 1) {
      const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
      this.hTop = avg(this.hold.hs);
      this.elbowTop = Math.min(178, Math.max(150, avg(this.hold.elbows)));
      const sides = this.hold.views.filter((v) => v === 'side').length;
      this.lockedView = sides > this.hold.views.length / 2 ? 'side' : 'front';
    }
  }

  private begin(r: Reading, t: number): void {
    // Keep the "top" up to date: you may have shuffled closer or further,
    // or be tiring so your top is a little lower. Rise at once, sink gently.
    if (this.peakSinceRep > 0.5 * this.hTop) {
      this.hTop = this.peakSinceRep > this.hTop ? this.peakSinceRep : 0.7 * this.hTop + 0.3 * this.peakSinceRep;
    }
    // If the set began without the gate, decide the view now, at the top.
    this.lockedView ??= r.view;
    this.phase = 'down';
    this.rep = {
      startT: t,
      bottomT: 0,
      deepestT: t,
      maxP: 0,
      maxDepth: 0,
      minElbow: r.elbow ?? 180,
      minLine: 180,
      hipSideSum: 0,
      frames: 0,
      postureFrames: 0,
      wrists0: { ...r.wrists },
      shift: {},
      hands0: r.hands,
      topElbow: r.elbow ?? this.elbowTop,
    };
  }

  private absent(events: DetectorEvent[], t: number): void {
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
    this.peakSinceRep = 0;
    this.lastReject = reason;
    events.push({ type: 'reject', reason, cue });
  }

  private finish(events: DetectorEvent[], rep: Rep, t: number, r: Reading): void {
    const durationMs = t - rep.startT;
    const sideOn = (this.lockedView ?? r.view) === 'side';
    const lineCue: Cue = rep.hipSideSum >= 0 ? 'hips-up' : 'hips-down';

    if (rep.maxP < PUSHUP.bottomP) {
      // Went part of the way and came back. Only mention it if it was a real attempt.
      if (rep.maxP >= 0.5 && durationMs >= 300) return this.fail(events, 'shallow', 'go-lower');
      this.rep = null;
      this.phase = 'top';
      this.peakSinceRep = 0;
      return;
    }
    if (rep.maxDepth < PUSHUP.minDrop) return this.fail(events, 'no-body-movement', 'go-lower');
    if (durationMs < PUSHUP.minRepMs) return this.fail(events, 'too-fast', 'slow-down');
    if (rep.deepestT - rep.startT < this.minDownMs) return this.fail(events, 'too-fast', 'slow-down');
    if (rep.postureFrames / Math.max(1, rep.frames) < 0.7) return this.fail(events, 'not-horizontal', 'get-horizontal');
    // Hands should stay planted. The steadiest measurement counts: side-on the
    // far hand is mostly a guess and wanders, and from the front the tracker
    // sometimes swaps left and right, which the average of both hands ignores.
    const shifts = Object.values(rep.shift);
    if (shifts.length && Math.min(...shifts) > PUSHUP.maxHandShift) return this.fail(events, 'moved', 'keep-still');
    if (sideOn && rep.minLine < PUSHUP.lineReject) return this.fail(events, 'body-line', lineCue);

    // ---- form score: weighted like marks in an exam.
    // Measured on real videos: a full-depth rep reaches a progress of about
    // 1.0 or more, and fully straight arms often read only 125-140 degrees
    // (the tracker puts the elbow slightly off the line, and a phone on the
    // floor can lose the shoulders at the top). So these are generous.
    const depth = remap(rep.maxP, PUSHUP.bottomP, 1.3, 0.7, 1); // deeper is better
    const lockout = remap(Math.max(rep.topElbow, r.elbow ?? 0), 115, 150, 0.6, 1); // straight arms at the top
    const tempo = remap(durationMs, PUSHUP.minRepMs, 1000, 0.6, 1); // controlled, not rushed
    const line = sideOn && rep.minLine < 180 ? remap(rep.minLine, PUSHUP.lineReject, 170, 0.4, 1) : 0.9;
    const score = Math.round(100 * (0.45 * depth + 0.25 * line + 0.15 * lockout + 0.15 * tempo));

    // The weakest part decides what the coach says.
    let cue: Cue = 'nice';
    if (sideOn && rep.minLine < PUSHUP.lineCue) cue = lineCue;
    else if (rep.maxP < PUSHUP.lowerCueP) cue = 'go-lower';
    else if (tempo < 0.75) cue = 'slow-down';
    else if (lockout < 0.7) cue = 'lock-out'; // only when the arms stayed clearly bent (below about 120 degrees)

    this.reps++;
    this.rep = null;
    this.phase = 'top';
    this.peakSinceRep = r.h;
    this.lastReject = null;
    // From the front, knees and toes look the same, so the version is taken on trust.
    events.push({ type: 'rep', count: this.reps, score, durationMs, depthDeg: rep.minElbow, variant: 'standard', cue });
  }
}
