// Small maths helpers for turning body dots into joint angles.
import { LM, vis, type Landmark } from './landmarks';

export interface Point {
  x: number;
  y: number;
}

/**
 * The angle (in degrees, 0 to 180) at point `b`, between the lines b→a and b→c.
 * Example: shoulder, elbow, wrist gives the elbow angle.
 * A straight arm is about 180. A fully bent arm is about 40.
 *
 * `aspect` = picture width ÷ picture height. Landmark x and y both run 0..1,
 * but the picture is not square, so we stretch x back to real proportions
 * first. Without this, angles would be wrong in a wide (landscape) picture.
 */
export function angleAt(a: Point, b: Point, c: Point, aspect = 1): number {
  const v1x = (a.x - b.x) * aspect;
  const v1y = a.y - b.y;
  const v2x = (c.x - b.x) * aspect;
  const v2y = c.y - b.y;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 === 0 || len2 === 0) return 0;
  // The dot product tells us how much two arrows point the same way.
  let cos = (v1x * v2x + v1y * v2y) / (len1 * len2);
  // Rounding can push cos a hair outside -1..1, which would break acos.
  cos = Math.min(1, Math.max(-1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

export type Side = 'left' | 'right';

const JOINTS = {
  left: {
    shoulder: LM.LEFT_SHOULDER,
    elbow: LM.LEFT_ELBOW,
    wrist: LM.LEFT_WRIST,
    hip: LM.LEFT_HIP,
    knee: LM.LEFT_KNEE,
    ankle: LM.LEFT_ANKLE,
  },
  right: {
    shoulder: LM.RIGHT_SHOULDER,
    elbow: LM.RIGHT_ELBOW,
    wrist: LM.RIGHT_WRIST,
    hip: LM.RIGHT_HIP,
    knee: LM.RIGHT_KNEE,
    ankle: LM.RIGHT_ANKLE,
  },
} as const;

/**
 * When you film side-on, one side of the body is hidden behind the other.
 * This picks the side the camera sees best, so we measure the clear one.
 */
export function bestSide(pose: readonly Landmark[]): Side {
  let left = 0;
  let right = 0;
  for (const i of Object.values(JOINTS.left)) left += vis(pose[i]);
  for (const i of Object.values(JOINTS.right)) right += vis(pose[i]);
  return left >= right ? 'left' : 'right';
}

/** Elbow angle on one side, or null if those joints are not clearly seen. */
export function elbowAngle(pose: readonly Landmark[], side: Side, aspect = 1): number | null {
  const j = JOINTS[side];
  return jointAngle(pose, j.shoulder, j.elbow, j.wrist, aspect);
}

/** Knee angle on one side, or null if those joints are not clearly seen. */
export function kneeAngle(pose: readonly Landmark[], side: Side, aspect = 1): number | null {
  const j = JOINTS[side];
  return jointAngle(pose, j.hip, j.knee, j.ankle, aspect);
}

function jointAngle(
  pose: readonly Landmark[],
  ia: number,
  ib: number,
  ic: number,
  aspect: number,
): number | null {
  const a = pose[ia];
  const b = pose[ib];
  const c = pose[ic];
  if (!a || !b || !c) return null;
  if (Math.min(vis(a), vis(b), vis(c)) < 0.5) return null;
  return angleAt(a, b, c, aspect);
}
