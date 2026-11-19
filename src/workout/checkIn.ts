// The coach check-in: a gesture only a live person can make on request.
import { readSkeleton } from '../detectors/joints';
import type { Landmark } from '../pose/landmarks';

/** A coach check-in: a gesture only a live person can answer. */
export type CheckIn = 'one-hand' | 'both-hands';

/**
 * Is the requested gesture being made in this frame?
 *
 * One hand counts if it is above the head (standing), OR if one hand is far
 * higher than the other (lifted off the floor in push-up position, facing
 * the phone). Both hands must both be above the head.
 */
export function checkInSeen(pose: readonly Landmark[] | null, aspect: number, kind: CheckIn): boolean {
  if (!pose) return false;
  const sk = readSkeleton(pose, aspect);
  // "Above the head" = above the nose if we can see it, otherwise well above the shoulder.
  const up = (side: 'left' | 'right') => {
    const { wrist, shoulder } = sk[side];
    return wrist.v >= 0.5 && (sk.nose.v >= 0.5 ? wrist.y < sk.nose.y - 0.02 : shoulder.v >= 0.5 && wrist.y < shoulder.y - 0.12);
  };
  if (kind === 'both-hands') return up('left') && up('right');
  // Measured in arm lengths, so distance from the phone does not matter.
  const arm = Math.max(
    ...(['left', 'right'] as const).map((s) => Math.hypot(sk[s].shoulder.x - sk[s].elbow.x, sk[s].shoulder.y - sk[s].elbow.y) + Math.hypot(sk[s].elbow.x - sk[s].wrist.x, sk[s].elbow.y - sk[s].wrist.y)),
  );
  const lifted = sk.left.wrist.v >= 0.5 && sk.right.wrist.v >= 0.5 && arm > 0.03 && Math.abs(sk.left.wrist.y - sk.right.wrist.y) > 0.45 * arm;
  return up('left') || up('right') || lifted;
}
