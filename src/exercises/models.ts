// Stick-figure models of every exercise.
//
// Each model answers: "at this point in the movement, where is every
// joint?" The same models draw the animated demos in the app AND produce
// the fake camera data for the automated tests, so the demo always shows
// exactly the movement the counter expects.
//
// Units: 1.0 = the height of the picture, in both directions. y grows downwards.
import { pushupJoints } from '../detectors/pushupModel';
import { LM, type Landmark } from '../pose/landmarks';

export interface Pt {
  x: number;
  y: number;
}

/** One arm and one leg. */
export interface Limbs {
  shoulder: Pt;
  elbow: Pt;
  wrist: Pt;
  hip: Pt;
  knee: Pt;
  ankle: Pt;
}

export interface Body {
  /** side = filmed from the side. front = facing the camera. */
  view: 'side' | 'front';
  /** Side view: the side nearest the camera. Front view: the person's left. */
  near: Limbs;
  /** Side view: the half-hidden far side. Front view: the person's right. */
  far: Limbs;
  head: Pt;
  /** How clearly the far side is seen (side view only). */
  farVisibility?: number;
}

// Segment lengths (shares of picture height).
const T = 0.19; // shoulder → hip
const TH = 0.155; // hip → knee
const SH = 0.155; // knee → ankle
const UA = 0.105; // shoulder → elbow
const FA = 0.095; // elbow → wrist
const FLOOR = 0.86;

const rad = (deg: number) => (deg * Math.PI) / 180;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mix = (a: Pt, b: Pt, k: number): Pt => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
const add = (a: Pt, dx: number, dy: number): Pt => ({ x: a.x + dx, y: a.y + dy });

/**
 * Where is the middle joint of a two-part limb? Given the two ends (say hip
 * and ankle) and the two bone lengths, there are two possible knee
 * positions, one on each side of the line. `bend` picks which. Animators
 * call this "inverse kinematics".
 */
export function midJoint(a: Pt, b: Pt, len1: number, len2: number, bend: 1 | -1): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.min(Math.hypot(dx, dy), len1 + len2 - 1e-6) || 1e-6;
  const along = (len1 * len1 - len2 * len2 + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, len1 * len1 - along * along));
  const ux = dx / d;
  const uy = dy / d;
  return { x: a.x + ux * along - uy * off * bend, y: a.y + uy * along + ux * off * bend };
}

function limbsFrom(shoulder: Pt, wrist: Pt, hip: Pt, ankle: Pt, armBend: 1 | -1, legBend: 1 | -1): Limbs {
  return {
    shoulder,
    elbow: midJoint(shoulder, wrist, UA, FA, armBend),
    wrist,
    hip,
    knee: midJoint(hip, ankle, TH, SH, legBend),
    ankle,
  };
}

const shiftLimbs = (l: Limbs, dx: number, dy: number): Limbs => ({
  shoulder: add(l.shoulder, dx, dy),
  elbow: add(l.elbow, dx, dy),
  wrist: add(l.wrist, dx, dy),
  hip: add(l.hip, dx, dy),
  knee: add(l.knee, dx, dy),
  ankle: add(l.ankle, dx, dy),
});

/** For side views where both sides do the same thing: the far side sits just behind. */
const sideBody = (near: Limbs, head: Pt, far: Limbs = shiftLimbs(near, 0.012, -0.012), farVisibility = 0.45): Body => ({
  view: 'side',
  near,
  far,
  head,
  farVisibility,
});

// ------------------------------------------------------------------ standing

function standingLimbs(x: number, armsForward = 0): Limbs {
  const ankle = { x, y: FLOOR };
  const hip = { x, y: FLOOR - SH - TH };
  const shoulder = { x, y: hip.y - T };
  const wrist = { x: x + 0.02 + 0.17 * armsForward, y: shoulder.y + (UA + FA - 0.005) * (1 - armsForward) + 0.02 * armsForward };
  return limbsFrom(shoulder, wrist, hip, ankle, -1, 1);
}

export function standing(): Body {
  const near = standingLimbs(0.5);
  return sideBody(near, add(near.shoulder, 0.015, -0.075));
}

// --------------------------------------------------------------------- squat

/** `kneeDeg`: 172 standing, about 95 at the bottom of a full squat. */
export function squat(kneeDeg: number): Body {
  const d = Math.min(1.2, Math.max(0, (172 - kneeDeg) / 102));
  const ankle = { x: 0.5, y: FLOOR };
  const shin = rad(4 + 24 * d);
  const knee = { x: ankle.x + SH * Math.sin(shin), y: ankle.y - SH * Math.cos(shin) };
  const thigh = rad(4 + 78 * d);
  const hip = { x: knee.x - TH * Math.sin(thigh), y: knee.y - TH * Math.cos(thigh) };
  const lean = rad(38 * d);
  const shoulder = { x: hip.x + T * Math.sin(lean), y: hip.y - T * Math.cos(lean) };
  // Arms swing forward for balance as you go down.
  const wrist = { x: shoulder.x + 0.02 + 0.16 * Math.min(1, d), y: shoulder.y + (UA + FA - 0.01) * (1 - Math.min(1, d)) + 0.01 };
  const near: Limbs = { shoulder, elbow: midJoint(shoulder, wrist, UA, FA, -1), wrist, hip, knee, ankle };
  return sideBody(near, add(shoulder, 0.02 + 0.03 * d, -0.075));
}

// --------------------------------------------------------------------- lunge

/** `depth`: 0 standing, 1 = both knees bent to about a right angle. */
export function lunge(depth: number): Body {
  const d = Math.min(1.1, Math.max(0, depth));
  const step = Math.min(1, d * 2.2); // the back foot steps away first, then you sink
  const front = { x: 0.58, y: FLOOR };
  const back = { x: 0.58 - 0.34 * step, y: FLOOR - 0.012 * step };
  const hip = { x: 0.58 - 0.15 * step, y: FLOOR - SH - TH + 0.135 * d + 0.0005 };
  const shoulder = { x: hip.x + 0.015, y: hip.y - T };
  const wrist = { x: hip.x + 0.03, y: hip.y - 0.01 }; // hands on hips
  const near: Limbs = { shoulder, elbow: midJoint(shoulder, wrist, UA, FA, 1), wrist, hip, knee: midJoint(hip, front, TH, SH, -1), ankle: front };
  const far: Limbs = { ...near, knee: midJoint(hip, back, TH, SH, -1), ankle: back };
  return sideBody(near, add(shoulder, 0.015, -0.075), far, 0.75);
}

// -------------------------------------------------------------- glute bridge

/** `up`: 0 = hips on the floor, 1 = hips lifted into a straight line. */
export function bridge(up: number): Body {
  const u = Math.min(1.05, Math.max(0, up));
  const shoulder = { x: 0.28, y: 0.83 };
  const knee = { x: 0.6, y: 0.715 };
  const ankle = { x: 0.66, y: FLOOR };
  const hipDown = { x: 0.46, y: 0.845 };
  const hipUp = mix(shoulder, knee, T / (T + TH));
  const hip = mix(hipDown, hipUp, u);
  const near: Limbs = { shoulder, elbow: { x: 0.36, y: 0.85 }, wrist: { x: 0.45, y: 0.855 }, hip, knee, ankle };
  return sideBody(near, { x: 0.2, y: 0.82 });
}

// -------------------------------------------------------------------- sit-up

/** `torsoDeg`: 5 = lying flat, 75 = sitting up. */
export function situp(torsoDeg: number): Body {
  const g = rad(torsoDeg);
  const hip = { x: 0.5, y: 0.84 };
  const knee = { x: 0.61, y: 0.7 };
  const ankle = { x: 0.7, y: 0.855 };
  const shoulder = { x: hip.x - T * Math.cos(g), y: hip.y - T * Math.sin(g) };
  const wrist = { x: shoulder.x + 0.15, y: shoulder.y + 0.03 };
  const near: Limbs = { shoulder, elbow: midJoint(shoulder, wrist, UA, FA, 1), wrist, hip, knee, ankle };
  return sideBody(near, { x: shoulder.x - 0.075 * Math.cos(g), y: shoulder.y - 0.075 * Math.sin(g) - 0.01 });
}

// --------------------------------------------------------------------- plank

export interface PlankOptions {
  /** Hip offset as a share of body length. Positive sags, negative pikes. */
  sag?: number;
  knees?: boolean;
  /** Lying flat on the floor instead of holding the body up (a cheat to reject). */
  collapsed?: boolean;
}

/** Forearm plank: elbows under shoulders, body in one line. */
export function plank(o: PlankOptions = {}): Body {
  const pivot = o.knees ? { x: 0.36, y: 0.835 } : { x: 0.2, y: 0.84 };
  const span = o.knees ? T + TH : T + TH + SH;
  const lift = o.collapsed ? 0.012 : UA;
  const shoulderY = 0.85 - lift;
  const shoulder = { x: pivot.x + Math.sqrt(span * span - (shoulderY - pivot.y) ** 2), y: shoulderY };
  const elbow = o.collapsed ? { x: shoulder.x - 0.02, y: 0.85 } : { x: shoulder.x, y: 0.85 };
  const wrist = { x: elbow.x + FA, y: 0.85 };
  const knee = o.knees ? pivot : mix(shoulder, pivot, (T + TH) / span);
  const ankle = o.knees ? { x: pivot.x - SH, y: 0.845 } : pivot;
  const end = o.knees ? knee : ankle;
  const share = T / span;
  const hip = { x: lerp(shoulder.x, end.x, share), y: lerp(shoulder.y, end.y, share) + (o.sag ?? 0) * span };
  const near: Limbs = { shoulder, elbow, wrist, hip, knee, ankle };
  return sideBody(near, add(shoulder, 0.07, -0.03));
}

// ---------------------------------------------------------- mountain climber

function fromPushup(elbowDeg: number): Limbs {
  const j = pushupJoints({ elbowDeg, size: T + TH + SH });
  return { shoulder: j.shoulder, elbow: j.elbow, wrist: j.wrist, hip: j.hip, knee: j.knee, ankle: j.ankle };
}

/** `drive`: 0 = both legs back, 1 = knee pulled to the chest. `leg` says which one. */
export function climber(drive: number, leg: 'near' | 'far' = 'near'): Body {
  const base = fromPushup(165);
  const k = Math.min(1.1, Math.max(0, drive));
  const driven: Limbs = {
    ...base,
    knee: mix(base.knee, add(base.hip, 0.12, 0.085), k),
    ankle: mix(base.ankle, add(base.hip, 0.04, 0.2), k),
  };
  const near = leg === 'near' ? driven : base;
  const far = shiftLimbs(leg === 'far' ? driven : base, 0.012, -0.012);
  return sideBody(near, add(base.shoulder, 0.08, -0.03), far, 0.6);
}

// -------------------------------------------------------------- jumping jack

/** `open`: 0 = feet together, arms down. 1 = feet wide, hands overhead. */
export function jack(open: number): Body {
  const o = Math.min(1.1, Math.max(0, open));
  const hipY = FLOOR - SH - TH;
  const shoulderY = hipY - T;
  const arm = rad(172 * o);
  const side = (sign: 1 | -1): Limbs => {
    const shoulder = { x: 0.5 + sign * 0.06, y: shoulderY };
    const hip = { x: 0.5 + sign * 0.045, y: hipY };
    const ankle = { x: 0.5 + sign * (0.04 + 0.12 * o), y: FLOOR - 0.01 * o };
    const reach = UA + FA - 0.004;
    const wrist = { x: shoulder.x + sign * reach * Math.sin(arm), y: shoulder.y + reach * Math.cos(arm) };
    return { shoulder, elbow: mix(shoulder, wrist, UA / (UA + FA)), wrist, hip, knee: mix(hip, ankle, 0.5), ankle };
  };
  return { view: 'front', near: side(1), far: side(-1), head: { x: 0.5, y: shoulderY - 0.075 } };
}

// ---------------------------------------------------------------- high knees

/** `lift`: 0 = standing, 1 = knee at hip height. `leg`: which knee is up. */
export function highKnee(lift: number, leg: 'near' | 'far' = 'near'): Body {
  const l = Math.min(1.15, Math.max(0, lift));
  const hipY = FLOOR - SH - TH;
  const shoulderY = hipY - T;
  const side = (sign: 1 | -1, up: number): Limbs => {
    const shoulder = { x: 0.5 + sign * 0.06, y: shoulderY };
    const hip = { x: 0.5 + sign * 0.045, y: hipY };
    // Facing the camera, a raised thigh points at us, so it looks shorter.
    const knee = { x: hip.x + sign * 0.005, y: hip.y + 0.02 + (TH - 0.02) * (1 - up) };
    const ankle = { x: knee.x, y: knee.y + SH * (1 - 0.3 * up) };
    const wrist = { x: shoulder.x + sign * 0.03, y: shoulder.y + 0.17 - 0.05 * up };
    return { shoulder, elbow: midJoint(shoulder, wrist, UA, FA, sign), wrist, hip, knee, ankle };
  };
  return {
    view: 'front',
    near: side(1, leg === 'near' ? l : 0),
    far: side(-1, leg === 'far' ? l : 0),
    head: { x: 0.5, y: shoulderY - 0.075 },
  };
}

// ------------------------------------------------------------------ bird-dog

/** `reach`: 0 = on all fours, 1 = one arm forward and the opposite leg back. */
export function birdDog(reach: number): Body {
  const e = Math.min(1.05, Math.max(0, reach));
  const shoulder = { x: 0.62, y: 0.61 };
  const hip = { x: 0.43, y: 0.61 };
  const hand = { x: 0.62, y: 0.61 + UA + FA - 0.002 };
  const kneeDown = { x: 0.43, y: 0.61 + TH };
  const ankleDown = { x: 0.43 - SH, y: 0.8 };
  // Near arm reaches forward; the far arm stays planted.
  const reachWrist = mix(hand, { x: shoulder.x + UA + FA - 0.004, y: shoulder.y - 0.01 }, e);
  const near: Limbs = { shoulder, elbow: midJoint(shoulder, reachWrist, UA, FA, 1), wrist: reachWrist, hip, knee: kneeDown, ankle: ankleDown };
  // Far leg extends back; the near leg stays planted.
  const far: Limbs = {
    shoulder: add(shoulder, 0.01, -0.01),
    elbow: mix(shoulder, hand, 0.52),
    wrist: add(hand, 0.01, 0),
    hip: add(hip, 0.01, -0.01),
    knee: mix(add(kneeDown, 0.01, 0), { x: hip.x - TH, y: hip.y + 0.005 }, e),
    ankle: mix(add(ankleDown, 0.01, 0), { x: hip.x - TH - SH + 0.002, y: hip.y + 0.005 }, e),
  };
  return sideBody(near, add(shoulder, 0.075, -0.02), far, 0.7);
}

// -------------------------------------------------------------- good morning

/** `hipDeg`: 175 = standing tall, about 100 = torso bowed forward. */
export function goodMorning(hipDeg: number): Body {
  const h = Math.min(1.1, Math.max(0, (175 - hipDeg) / 78));
  const ankle = { x: 0.5, y: FLOOR };
  const knee = { x: 0.5 + 0.008 * h, y: FLOOR - SH };
  const back = rad(7 * h);
  const hip = { x: knee.x - TH * Math.sin(back), y: knee.y - TH * Math.cos(back) };
  const bow = rad(72 * h);
  const shoulder = { x: hip.x + T * Math.sin(bow), y: hip.y - T * Math.cos(bow) };
  const wrist = { x: shoulder.x + 0.03, y: shoulder.y + 0.03 }; // hands across the chest
  const near: Limbs = { shoulder, elbow: midJoint(shoulder, wrist, UA, FA, 1), wrist, hip, knee, ankle };
  return sideBody(near, { x: shoulder.x + 0.075 * Math.sin(bow), y: shoulder.y - 0.075 * Math.cos(bow) });
}

// -------------------------------------------------------------------- burpee

function blend(a: Limbs, b: Limbs, k: number): Limbs {
  return {
    shoulder: mix(a.shoulder, b.shoulder, k),
    elbow: mix(a.elbow, b.elbow, k),
    wrist: mix(a.wrist, b.wrist, k),
    hip: mix(a.hip, b.hip, k),
    knee: mix(a.knee, b.knee, k),
    ankle: mix(a.ankle, b.ankle, k),
  };
}

/**
 * `phase` 0 → 1 is one burpee: stand, crouch, kick back to a plank, (push-up),
 * hop in, stand. `pushup` adds the push-up in the middle.
 */
export function burpee(phase: number, pushup = false): Body {
  const p = ((phase % 1) + 1) % 1;
  const stand = standingLimbs(0.5);
  const crouchBody = squat(78).near;
  const crouch: Limbs = { ...crouchBody, wrist: { x: 0.64, y: 0.85 }, elbow: midJoint(crouchBody.shoulder, { x: 0.64, y: 0.85 }, UA, FA, -1) };
  const smooth = (k: number) => k * k * (3 - 2 * k);
  let near: Limbs;
  if (p < 0.18) near = blend(stand, crouch, smooth(p / 0.18));
  else if (p < 0.34) near = blend(crouch, fromPushup(165), smooth((p - 0.18) / 0.16));
  else if (p < 0.66) {
    const k = (p - 0.34) / 0.32;
    near = fromPushup(pushup ? 165 - 80 * Math.sin(Math.PI * k) : 165);
  } else if (p < 0.82) near = blend(fromPushup(165), crouch, smooth((p - 0.66) / 0.16));
  else near = blend(crouch, stand, smooth((p - 0.82) / 0.18));
  return sideBody(near, add(near.shoulder, 0.05, -0.06));
}

// ------------------------------------------------------- body → camera dots

export interface PoseOptions {
  aspect?: number;
  /** Move the whole body, as if the phone shifted. */
  shiftX?: number;
  shiftY?: number;
}

/** Turn a stick figure into the 33 landmarks the tracker would report. */
export function bodyToPose(body: Body, o: PoseOptions = {}): Landmark[] {
  const aspect = o.aspect ?? 4 / 3;
  // Bodies are drawn around x = 0.5. Re-centre them in a wider picture.
  const dx = (o.shiftX ?? 0) + (aspect - 1) / 2;
  const dy = o.shiftY ?? 0;
  const pose: Landmark[] = Array.from({ length: 33 }, () => ({ x: (body.head.x + dx) / aspect, y: body.head.y + dy, z: 0, visibility: 0.2 }));
  const put = (index: number, p: Pt, visibility: number) => {
    pose[index] = { x: (p.x + dx) / aspect, y: p.y + dy, z: 0, visibility };
  };
  const nearV = 0.95;
  const farV = body.view === 'front' ? 0.95 : (body.farVisibility ?? 0.45);
  const sides: [Limbs, number, number[]][] = [
    [body.near, nearV, [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST, LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.LEFT_HEEL, LM.LEFT_FOOT]],
    [body.far, farV, [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_HEEL, LM.RIGHT_FOOT]],
  ];
  for (const [l, v, idx] of sides) {
    put(idx[0]!, l.shoulder, v);
    put(idx[1]!, l.elbow, v);
    put(idx[2]!, l.wrist, v);
    put(idx[3]!, l.hip, v);
    put(idx[4]!, l.knee, v);
    put(idx[5]!, l.ankle, v);
    put(idx[6]!, l.ankle, v * 0.9);
    put(idx[7]!, add(l.ankle, 0.02, 0.01), v * 0.9);
  }
  put(LM.NOSE, body.head, 0.9);
  put(LM.LEFT_EAR, body.head, 0.9);
  put(LM.RIGHT_EAR, body.head, body.view === 'front' ? 0.9 : 0.3);
  return pose;
}

/** The push-up as a `Body`, so one drawing routine can show every exercise. */
export function pushupBody(elbowDeg: number, knees = false): Body {
  const j = pushupJoints({ elbowDeg, knees, size: 0.56 });
  const near: Limbs = { shoulder: j.shoulder, elbow: j.elbow, wrist: j.wrist, hip: j.hip, knee: j.knee, ankle: j.ankle };
  // The push-up model starts at x = 0.2; nudge it so it is centred like the others.
  const centred = shiftLimbs(near, -0.03, 0.05);
  return sideBody(centred, add(j.head, -0.03, 0.05));
}
