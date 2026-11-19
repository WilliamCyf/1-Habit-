import { describe, expect, it } from 'vitest';
import { LM, type Landmark } from '../src/pose/landmarks';
import { checkInSeen } from '../src/workout/checkIn';
import { loadFixture } from './helpers/fixtures';

/** A real face-on push-up frame (top position) from a real video. */
function realPushupTop(): { pose: Landmark[]; aspect: number } {
  const fx = loadFixture('24273');
  return { pose: [...fx.frames[10]!.pose!], aspect: fx.aspect };
}

describe('coach check-in', () => {
  it('is not passed by simply holding a push-up position', () => {
    const { pose, aspect } = realPushupTop();
    expect(checkInSeen(pose, aspect, 'one-hand')).toBe(false);
  });

  it('is passed by lifting one hand off the floor in push-up position, facing the phone', () => {
    const { pose, aspect } = realPushupTop();
    const shoulder = pose[LM.RIGHT_SHOULDER]!;
    // Lift the right hand to about shoulder height.
    pose[LM.RIGHT_WRIST] = { ...pose[LM.RIGHT_WRIST]!, y: shoulder.y };
    pose[LM.RIGHT_ELBOW] = { ...pose[LM.RIGHT_ELBOW]!, y: (pose[LM.RIGHT_ELBOW]!.y + shoulder.y) / 2 };
    expect(checkInSeen(pose, aspect, 'one-hand')).toBe(true);
  });

  it('standing: one hand above the head passes one-hand, but not both-hands', () => {
    const pose: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
    const set = (i: number, x: number, y: number) => void (pose[i] = { x, y, z: 0, visibility: 0.95 });
    set(LM.NOSE, 0.5, 0.2);
    set(LM.LEFT_SHOULDER, 0.56, 0.3);
    set(LM.RIGHT_SHOULDER, 0.44, 0.3);
    set(LM.LEFT_ELBOW, 0.6, 0.2);
    set(LM.LEFT_WRIST, 0.6, 0.08);
    set(LM.RIGHT_ELBOW, 0.42, 0.42);
    set(LM.RIGHT_WRIST, 0.41, 0.55);
    expect(checkInSeen(pose, 1, 'one-hand')).toBe(true);
    expect(checkInSeen(pose, 1, 'both-hands')).toBe(false);
    set(LM.RIGHT_ELBOW, 0.4, 0.2);
    set(LM.RIGHT_WRIST, 0.4, 0.08);
    expect(checkInSeen(pose, 1, 'both-hands')).toBe(true);
  });

  it('is never passed by nobody', () => {
    expect(checkInSeen(null, 1, 'one-hand')).toBe(false);
  });
});
