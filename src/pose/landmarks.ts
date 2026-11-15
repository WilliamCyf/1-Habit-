// The pose model gives us 33 "landmarks" (dots on the body) for each camera
// frame. Each dot always has the same number, so 11 is always the left
// shoulder. This file gives those numbers readable names.

/** One body dot. x and y run from 0 to 1 across the camera picture. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** 0 to 1: how sure the model is that this joint is really visible. */
  visibility?: number;
}

export const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT: 31,
  RIGHT_FOOT: 32,
} as const;

/** The 12 big joints every exercise detector relies on. */
export const MAJOR_JOINTS: readonly number[] = [
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
  LM.LEFT_ELBOW,
  LM.RIGHT_ELBOW,
  LM.LEFT_WRIST,
  LM.RIGHT_WRIST,
  LM.LEFT_HIP,
  LM.RIGHT_HIP,
  LM.LEFT_KNEE,
  LM.RIGHT_KNEE,
  LM.LEFT_ANKLE,
  LM.RIGHT_ANKLE,
];

/** Pairs of joints to connect with a line when drawing the skeleton. */
export const BONES: readonly (readonly [number, number])[] = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  [LM.LEFT_ANKLE, LM.LEFT_FOOT],
  [LM.RIGHT_ANKLE, LM.RIGHT_FOOT],
  [LM.LEFT_ANKLE, LM.LEFT_HEEL],
  [LM.RIGHT_ANKLE, LM.RIGHT_HEEL],
];

/** Below this confidence we treat a joint as "not really seen". */
export const VISIBLE = 0.5;

export function vis(lm: Landmark | undefined): number {
  return lm?.visibility ?? 0;
}

/** Average confidence across the 12 big joints (0 to 1). */
export function averageVisibility(pose: readonly Landmark[]): number {
  let sum = 0;
  for (const i of MAJOR_JOINTS) sum += vis(pose[i]);
  return sum / MAJOR_JOINTS.length;
}

/**
 * True when every big joint is confidently seen AND inside the picture.
 * `margin` keeps a small safety border so joints are not right on the edge.
 */
export function isWholeBodyVisible(pose: readonly Landmark[], margin = 0.02): boolean {
  for (const i of MAJOR_JOINTS) {
    const p = pose[i];
    if (!p || vis(p) < VISIBLE) return false;
    if (p.x < margin || p.x > 1 - margin || p.y < margin || p.y > 1 - margin) return false;
  }
  return true;
}
