// A simple geometric model of a person doing a push-up, seen from the side.
//
// Give it an elbow angle and it places every joint where a real body would
// be. It has two jobs:
//  1. Drawing the animated demo figure in the app.
//  2. Producing fake camera data for the automated tests ("synthetic poses").
import type { Landmark } from '../pose/landmarks';
import { LM } from '../pose/landmarks';

export interface PushupPoseOptions {
  /** Elbow angle in degrees: about 165 at the top, about 80 at the bottom. */
  elbowDeg: number;
  /** Picture width ÷ height. */
  aspect?: number;
  /** Knees on the floor instead of toes. */
  knees?: boolean;
  /** Hip offset as a share of body length. Positive = sagging, negative = piked. */
  sag?: number;
  /** Shift the whole body (as if the phone moved). In picture-height units. */
  shiftX?: number;
  shiftY?: number;
  /** Head towards the right of the picture (true) or the left (false). */
  facingRight?: boolean;
  /** Body length (shoulder to ankle) as a share of picture height. */
  size?: number;
}

interface P {
  x: number;
  y: number;
}

/** Joint positions in "real" units (1 unit = picture height in both directions). */
export function pushupJoints(o: PushupPoseOptions): Record<'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle' | 'head' | 'toe', P> {
  const B = o.size ?? 0.62; // shoulder → ankle
  const L = 0.21 * B; // upper arm = forearm
  const floor = 0.8;
  const theta = (o.elbowDeg * Math.PI) / 180;
  // With the hand planted, shoulder height above the hand follows from the
  // elbow angle: two equal sticks hinged at the elbow.
  const reach = 2 * L * Math.sin(theta / 2);
  const reachTop = 2 * L * Math.sin((165 * Math.PI) / 180 / 2);

  const pivotLen = o.knees ? 0.76 * B : B; // the body swings about the knees or the toes
  const pivot: P = { x: 0.2, y: floor - (o.knees ? 0.03 : 0.04) * B };
  const handY = floor - 0.01;
  const shoulderAt = (r: number): P => {
    const y = handY - r;
    const dy = y - pivot.y;
    return { x: pivot.x + Math.sqrt(Math.max(0, pivotLen * pivotLen - dy * dy)), y };
  };
  const shoulder = shoulderAt(reach);
  // The hand stays where it was at the top of the movement.
  const wrist: P = { x: shoulderAt(reachTop).x, y: handY };

  // Elbow: the hinge point, sticking out towards the feet.
  const mx = (shoulder.x + wrist.x) / 2;
  const my = (shoulder.y + wrist.y) / 2;
  const half = Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y) / 2;
  const out = Math.sqrt(Math.max(0, L * L - half * half));
  const ux = (wrist.x - shoulder.x) / (2 * half || 1);
  const uy = (wrist.y - shoulder.y) / (2 * half || 1);
  // Perpendicular to shoulder→wrist, choosing the direction that points back to the feet.
  let px = uy;
  let py = -ux;
  if (px > 0) {
    px = -px;
    py = -py;
  }
  const elbow: P = { x: mx + px * out, y: my + py * out };

  let knee: P;
  let ankle: P;
  if (o.knees) {
    knee = pivot;
    ankle = { x: pivot.x - 0.24 * B, y: floor - 0.02 * B }; // shins resting on the floor
  } else {
    ankle = pivot;
    knee = { x: shoulder.x + (ankle.x - shoulder.x) * 0.76, y: shoulder.y + (ankle.y - shoulder.y) * 0.76 };
  }
  const lineEnd = o.knees ? knee : ankle;
  const share = o.knees ? 0.52 / 0.76 : 0.52;
  const hip: P = {
    x: shoulder.x + (lineEnd.x - shoulder.x) * share,
    // Sag pushes the hip towards the floor (larger y).
    y: shoulder.y + (lineEnd.y - shoulder.y) * share + (o.sag ?? 0) * B,
  };
  const head: P = { x: shoulder.x + 0.13 * B, y: shoulder.y - 0.05 * B };
  const toe: P = { x: ankle.x - 0.02 * B, y: floor };

  const joints = { shoulder, elbow, wrist, hip, knee, ankle, head, toe };
  const width = o.aspect ?? 4 / 3;
  for (const p of Object.values(joints)) {
    if (o.facingRight === false) p.x = width - p.x - (width - 1.1); // mirror within the frame
    p.x += o.shiftX ?? 0;
    p.y += o.shiftY ?? 0;
  }
  return joints;
}

/** The same pose as 33 camera-style landmarks (x and y from 0 to 1). */
export function pushupPose(o: PushupPoseOptions): Landmark[] {
  const aspect = o.aspect ?? 4 / 3;
  const j = pushupJoints(o);
  const pose: Landmark[] = Array.from({ length: 33 }, () => ({ x: j.shoulder.x / aspect, y: j.shoulder.y, z: 0, visibility: 0.2 }));
  const put = (index: number, p: P, visibility: number) => {
    pose[index] = { x: p.x / aspect, y: p.y, z: 0, visibility };
  };
  // The side facing the camera is clearly seen...
  put(LM.LEFT_SHOULDER, j.shoulder, 0.97);
  put(LM.LEFT_ELBOW, j.elbow, 0.95);
  put(LM.LEFT_WRIST, j.wrist, 0.93);
  put(LM.LEFT_HIP, j.hip, 0.96);
  put(LM.LEFT_KNEE, j.knee, 0.94);
  put(LM.LEFT_ANKLE, j.ankle, 0.9);
  put(LM.LEFT_HEEL, j.ankle, 0.85);
  put(LM.LEFT_FOOT, j.toe, 0.85);
  // ...and the far side is mostly hidden behind the body.
  const far = (p: P): P => ({ x: p.x + 0.012, y: p.y - 0.012 });
  put(LM.RIGHT_SHOULDER, far(j.shoulder), 0.55);
  put(LM.RIGHT_ELBOW, far(j.elbow), 0.35);
  put(LM.RIGHT_WRIST, far(j.wrist), 0.4);
  put(LM.RIGHT_HIP, far(j.hip), 0.5);
  put(LM.RIGHT_KNEE, far(j.knee), 0.4);
  put(LM.RIGHT_ANKLE, far(j.ankle), 0.35);
  put(LM.RIGHT_HEEL, far(j.ankle), 0.3);
  put(LM.RIGHT_FOOT, far(j.toe), 0.3);
  put(LM.NOSE, j.head, 0.9);
  put(LM.LEFT_EAR, j.head, 0.9);
  put(LM.RIGHT_EAR, j.head, 0.3);
  return pose;
}

/** Elbow angle for a smooth rep: `phase` runs 0 → 1 over one full rep. */
export function repElbow(phase: number, topDeg = 165, bottomDeg = 80): number {
  // A cosine gives a gentle ease at the top and bottom, like real movement.
  const k = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  return topDeg - (topDeg - bottomDeg) * k;
}
