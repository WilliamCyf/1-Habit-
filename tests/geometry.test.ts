import { describe, expect, it } from 'vitest';
import { angleAt, bestSide, elbowAngle, kneeAngle } from '../src/pose/geometry';
import { LM, averageVisibility, isWholeBodyVisible, type Landmark } from '../src/pose/landmarks';

/** A fake standing person, facing the camera, every joint clearly visible. */
function standingPose(visibility = 0.95): Landmark[] {
  const pose: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility }));
  const set = (i: number, x: number, y: number) => {
    pose[i] = { x, y, z: 0, visibility };
  };
  set(LM.LEFT_SHOULDER, 0.58, 0.25);
  set(LM.RIGHT_SHOULDER, 0.42, 0.25);
  set(LM.LEFT_ELBOW, 0.6, 0.4);
  set(LM.RIGHT_ELBOW, 0.4, 0.4);
  set(LM.LEFT_WRIST, 0.62, 0.55);
  set(LM.RIGHT_WRIST, 0.38, 0.55);
  set(LM.LEFT_HIP, 0.55, 0.55);
  set(LM.RIGHT_HIP, 0.45, 0.55);
  set(LM.LEFT_KNEE, 0.55, 0.73);
  set(LM.RIGHT_KNEE, 0.45, 0.73);
  set(LM.LEFT_ANKLE, 0.55, 0.92);
  set(LM.RIGHT_ANKLE, 0.45, 0.92);
  return pose;
}

describe('angleAt', () => {
  it('measures a straight line as 180', () => {
    expect(angleAt({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(180);
  });

  it('measures a right angle as 90', () => {
    expect(angleAt({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90);
  });

  it('measures a folded joint as 0', () => {
    expect(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(0);
  });

  it('corrects for a non-square picture', () => {
    // In a 2:1 wide picture, 0.1 across is as long as 0.2 down.
    const a = { x: 0.5, y: 0.3 };
    const b = { x: 0.5, y: 0.5 };
    const c = { x: 0.6, y: 0.5 };
    expect(angleAt(a, b, c, 2)).toBeCloseTo(90);
    const diagonal = { x: 0.6, y: 0.3 };
    expect(angleAt(diagonal, b, c, 2)).toBeCloseTo(45);
    expect(angleAt(diagonal, b, c, 1)).not.toBeCloseTo(45);
  });

  it('does not crash when two points are the same', () => {
    expect(angleAt({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBe(0);
  });
});

describe('joint angles on a pose', () => {
  it('reads nearly straight arms and legs on a standing person', () => {
    const pose = standingPose();
    expect(elbowAngle(pose, 'left')!).toBeGreaterThan(170);
    expect(kneeAngle(pose, 'left')!).toBeGreaterThan(175);
  });

  it('reads a bent elbow', () => {
    const pose = standingPose();
    // Bring the left wrist up next to the shoulder: a strong bend.
    pose[LM.LEFT_WRIST] = { x: 0.6, y: 0.27, z: 0, visibility: 0.95 };
    expect(elbowAngle(pose, 'left')!).toBeLessThan(30);
  });

  it('refuses to guess when a joint is not clearly visible', () => {
    const pose = standingPose();
    pose[LM.LEFT_ELBOW] = { ...pose[LM.LEFT_ELBOW]!, visibility: 0.2 };
    expect(elbowAngle(pose, 'left')).toBeNull();
    expect(elbowAngle(pose, 'right')).not.toBeNull();
  });

  it('picks the side the camera sees best', () => {
    const pose = standingPose();
    for (const i of [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST, LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE]) {
      pose[i] = { ...pose[i]!, visibility: 0.3 };
    }
    expect(bestSide(pose)).toBe('right');
  });
});

describe('visibility checks', () => {
  it('accepts a fully visible body', () => {
    const pose = standingPose();
    expect(isWholeBodyVisible(pose)).toBe(true);
    expect(averageVisibility(pose)).toBeCloseTo(0.95);
  });

  it('rejects a body with feet cut off by the picture edge', () => {
    const pose = standingPose();
    pose[LM.LEFT_ANKLE] = { ...pose[LM.LEFT_ANKLE]!, y: 1.04 };
    expect(isWholeBodyVisible(pose)).toBe(false);
  });

  it('rejects a body with a hidden joint', () => {
    const pose = standingPose();
    pose[LM.RIGHT_KNEE] = { ...pose[LM.RIGHT_KNEE]!, visibility: 0.1 };
    expect(isWholeBodyVisible(pose)).toBe(false);
  });
});
