// Turns the tracker's 33 dots into a tidy "skeleton" that detectors can
// read by name, in real-world proportions.
import { LM, type Landmark } from '../pose/landmarks';

/** A joint position in "real" units (1 = picture height both ways) plus how clearly it is seen. */
export interface Joint {
  x: number;
  y: number;
  /** Visibility, 0 to 1. */
  v: number;
}

export interface SideJoints {
  shoulder: Joint;
  elbow: Joint;
  wrist: Joint;
  hip: Joint;
  knee: Joint;
  ankle: Joint;
}

export interface Skeleton {
  left: SideJoints;
  right: SideJoints;
  nose: Joint;
}

const HIDDEN: Joint = { x: 0, y: 0, v: 0 };

export function readSkeleton(pose: readonly Landmark[], aspect: number): Skeleton {
  const j = (i: number): Joint => {
    const p = pose[i];
    return p ? { x: p.x * aspect, y: p.y, v: p.visibility ?? 0 } : HIDDEN;
  };
  return {
    left: { shoulder: j(LM.LEFT_SHOULDER), elbow: j(LM.LEFT_ELBOW), wrist: j(LM.LEFT_WRIST), hip: j(LM.LEFT_HIP), knee: j(LM.LEFT_KNEE), ankle: j(LM.LEFT_ANKLE) },
    right: { shoulder: j(LM.RIGHT_SHOULDER), elbow: j(LM.RIGHT_ELBOW), wrist: j(LM.RIGHT_WRIST), hip: j(LM.RIGHT_HIP), knee: j(LM.RIGHT_KNEE), ankle: j(LM.RIGHT_ANKLE) },
    nose: j(LM.NOSE),
  };
}

/** Are all of these joints clearly seen? */
export function seen(min: number, ...joints: Joint[]): boolean {
  for (const joint of joints) if (joint.v < min) return false;
  return true;
}

export function sideClarity(s: SideJoints): number {
  return s.shoulder.v + s.elbow.v + s.wrist.v + s.hip.v + s.knee.v + s.ankle.v;
}

type XY = { x: number; y: number };

/** Angle at b between b→a and b→c, 0 to 180 degrees. */
export function angle(a: XY, b: XY, c: XY): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const l = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (l === 0) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / l))) * 180) / Math.PI;
}

/** How steep the line a→b is: 0 = flat, 90 = straight up. */
export function steepness(a: XY, b: XY): number {
  return (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
}

export function distance(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Joint, b: Joint): Joint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) };
}

/**
 * A measure of the person's size in the picture that does not change when
 * they bend: torso + thigh + shin lengths added up. Used to turn distances
 * into "shares of the body", so near and far people are judged alike.
 */
export function bodyScale(s: SideJoints): number {
  return distance(s.shoulder, s.hip) + distance(s.hip, s.knee) + distance(s.knee, s.ankle);
}

/** Is `hip` below (+1) or above (-1) the straight line from `a` to `b`? */
export function sideOfLine(a: XY, b: XY, hip: XY): 1 | -1 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const cross = (hip.x - a.x) * dy - (hip.y - a.y) * dx;
  const below = dx >= 0 ? -cross : cross;
  return below >= 0 ? 1 : -1;
}
