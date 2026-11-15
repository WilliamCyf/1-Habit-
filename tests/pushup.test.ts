// The push-up counter's exam. Honest reps must count; every kind of fake
// must not. Each fake below is a "cheating recording" replayed into the detector.
import { describe, expect, it } from 'vitest';
import { pushupFeatures } from '../src/detectors/pushup';
import { pushupPose } from '../src/detectors/pushupModel';
import { LM, type Landmark } from '../src/pose/landmarks';
import { makeClip, pushupClip, rng, runPushups } from './helpers/synth';

describe('the push-up model measures as expected', () => {
  it('reads back the elbow angle it was built with', () => {
    for (const deg of [165, 130, 100, 80]) {
      const f = pushupFeatures(pushupPose({ elbowDeg: deg }), 4 / 3, 'left');
      expect(f).not.toBeNull();
      expect(Math.abs(f!.elbow - deg)).toBeLessThan(2);
    }
  });

  it('sees a straight, roughly horizontal body with hands on the floor', () => {
    const f = pushupFeatures(pushupPose({ elbowDeg: 165 }), 4 / 3, 'left')!;
    expect(f.line).toBeGreaterThan(172);
    expect(f.incline).toBeLessThan(30);
    expect(f.handsDown).toBe(true);
  });

  it('tells sagging hips from piked hips', () => {
    const sag = pushupFeatures(pushupPose({ elbowDeg: 120, sag: 0.08 }), 4 / 3, 'left')!;
    const pike = pushupFeatures(pushupPose({ elbowDeg: 120, sag: -0.08 }), 4 / 3, 'left')!;
    expect(sag.hipSide).toBe(1);
    expect(pike.hipSide).toBe(-1);
    expect(sag.line).toBeLessThan(165);
  });

  it('works the same facing left or right', () => {
    const right = pushupFeatures(pushupPose({ elbowDeg: 95 }), 4 / 3, 'left')!;
    const left = pushupFeatures(pushupPose({ elbowDeg: 95, facingRight: false }), 4 / 3, 'left')!;
    expect(left.elbow).toBeCloseTo(right.elbow, 1);
    expect(left.line).toBeCloseTo(right.line, 1);
    expect(pushupFeatures(pushupPose({ elbowDeg: 120, sag: 0.08, facingRight: false }), 4 / 3, 'left')!.hipSide).toBe(1);
  });
});

describe('honest push-ups are counted', () => {
  it('counts 10 clean reps and scores them highly', () => {
    const r = runPushups(pushupClip({ reps: 10 }));
    expect(r.becameReady).toBe(true);
    expect(r.reps).toHaveLength(10);
    expect(r.rejects).toHaveLength(0);
    expect(r.reps.map((e) => e.count)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const rep of r.reps) {
      expect(rep.score).toBeGreaterThanOrEqual(90);
      expect(rep.cue).toBe('nice');
      expect(rep.variant).toBe('standard');
    }
  });

  it('counts exactly, even with realistic camera jitter', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = runPushups(pushupClip({ reps: 8, jitter: 0.004, seed }));
      expect(r.reps).toHaveLength(8);
    }
  });

  it('counts the same at 10, 15 and 30 looks per second', () => {
    for (const fps of [10, 15, 30]) {
      expect(runPushups(pushupClip({ reps: 6, fps, jitter: 0.003 })).reps).toHaveLength(6);
    }
  });

  it('counts in a tall (portrait) picture and facing either way', () => {
    expect(runPushups(pushupClip({ reps: 5, aspect: 4 / 3, pose: { facingRight: false } })).reps).toHaveLength(5);
    expect(runPushups(pushupClip({ reps: 5, aspect: 1.2, pose: { size: 0.5 } })).reps).toHaveLength(5);
  });

  it('counts slow reps and brisk-but-real reps', () => {
    expect(runPushups(pushupClip({ reps: 3, repSec: 4 })).reps).toHaveLength(3);
    expect(runPushups(pushupClip({ reps: 6, repSec: 1 })).reps).toHaveLength(6);
  });

  it('recognises knee push-ups', () => {
    const r = runPushups(pushupClip({ reps: 6, pose: { knees: true }, jitter: 0.003 }));
    expect(r.reps).toHaveLength(6);
    expect(r.reps.every((e) => e.variant === 'knee')).toBe(true);
  });

  it('survives the camera losing the body for a blink', () => {
    // Two missing frames in the middle of rep 2.
    const r = runPushups(pushupClip({ reps: 4, tweak: (t, base) => (t > 4.3 && t < 4.42 ? null : base) }));
    expect(r.reps).toHaveLength(4);
  });
});

describe('form is scored and coached', () => {
  it('gives a lower score and "go lower" for reps that only just reach depth', () => {
    const r = runPushups(pushupClip({ reps: 5, bottomDeg: 97 }));
    expect(r.reps).toHaveLength(5);
    expect(r.reps[0]!.score).toBeLessThan(85);
    expect(r.reps[0]!.cue).toBe('go-lower');
  });

  it('counts mildly sagging hips but says "hips up"', () => {
    const r = runPushups(pushupClip({ reps: 4, pose: { sag: 0.085 } }));
    expect(r.reps).toHaveLength(4);
    expect(r.reps[0]!.cue).toBe('hips-up');
    expect(r.reps[0]!.score).toBeLessThan(90);
  });

  it('says "hips down" for a mild pike', () => {
    const r = runPushups(pushupClip({ reps: 4, pose: { sag: -0.085 } }));
    expect(r.reps).toHaveLength(4);
    expect(r.reps[0]!.cue).toBe('hips-down');
  });

  it('says "slow down" for rushed reps', () => {
    const r = runPushups(pushupClip({ reps: 6, repSec: 0.8 }));
    expect(r.reps.length).toBeGreaterThanOrEqual(5);
    expect(r.reps.at(-1)!.cue).toBe('slow-down');
  });

  it('scores better form higher', () => {
    const deep = runPushups(pushupClip({ reps: 3, bottomDeg: 78 })).reps[0]!.score;
    const shallow = runPushups(pushupClip({ reps: 3, bottomDeg: 98 })).reps[0]!.score;
    const saggy = runPushups(pushupClip({ reps: 3, bottomDeg: 78, pose: { sag: 0.085 } })).reps[0]!.score;
    expect(deep).toBeGreaterThan(shallow);
    expect(deep).toBeGreaterThan(saggy);
  });
});

describe('cheating and bad reps are rejected', () => {
  it('half reps: bending only part-way never counts', () => {
    const r = runPushups(pushupClip({ reps: 8, bottomDeg: 118 }));
    expect(r.reps).toHaveLength(0);
    expect(r.rejects.length).toBeGreaterThanOrEqual(6);
    expect(r.rejects.every((e) => e.reason === 'shallow' && e.cue === 'go-lower')).toBe(true);
  });

  it('fast bouncing: impossible speed never counts', () => {
    for (const fps of [15, 30]) {
      const r = runPushups(pushupClip({ reps: 20, repSec: 0.4, fps }));
      expect(r.reps).toHaveLength(0);
    }
    // Slightly slower bouncing reaches full depth but is still too quick.
    const r = runPushups(pushupClip({ reps: 20, repSec: 0.6, fps: 30 }));
    expect(r.reps).toHaveLength(0);
    expect(r.rejects.some((e) => e.reason === 'too-fast')).toBe(true);
  });

  it('badly sagging hips ("the worm") never counts', () => {
    const r = runPushups(pushupClip({ reps: 6, tweak: (t, base) => ({ ...base, sag: t > 1.5 ? 0.16 : 0 }) }));
    expect(r.reps).toHaveLength(0);
    expect(r.rejects.every((e) => e.reason === 'body-line')).toBe(true);
    expect(r.rejects[0]!.cue).toBe('hips-up');
  });

  it('a badly piked body never counts', () => {
    const r = runPushups(pushupClip({ reps: 6, tweak: (t, base) => ({ ...base, sag: t > 1.5 ? -0.17 : 0 }) }));
    expect(r.reps).toHaveLength(0);
    expect(r.rejects[0]!.cue).toBe('hips-down');
  });

  it('standing still, with camera jitter, never counts', () => {
    const standing = standingPose();
    const r = runPushups(makeClip(20, () => standing, { jitter: 0.01, seed: 7 }));
    expect(r.becameReady).toBe(false);
    expect(r.reps).toHaveLength(0);
  });

  it('holding a plank with heavy jitter never counts', () => {
    const r = runPushups(makeClip(20, () => pushupPose({ elbowDeg: 162 }), { jitter: 0.012, seed: 3 }));
    expect(r.reps).toHaveLength(0);
  });

  it('standing and waving an arm never counts', () => {
    // Upright body; one arm bends and straightens like a push-up would.
    const r = runPushups(
      makeClip(20, (t) => standingPose(90 + 75 * (0.5 + 0.5 * Math.cos((2 * Math.PI * t) / 2))), { jitter: 0.003 }),
    );
    expect(r.reps).toHaveLength(0);
  });

  it('lying still and bending just the arm never counts', () => {
    // The body stays at the bottom height; only the elbow dot moves, as if
    // someone lay on the floor flapping an arm.
    const clip = makeClip(24, (t) => {
      const pose = pushupPose({ elbowDeg: 165 });
      const bend = t > 1.6 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (t - 1.6)) / 2) : 0;
      const wrist = pose[LM.LEFT_WRIST]!;
      const shoulder = pose[LM.LEFT_SHOULDER]!;
      // Slide the hand up towards the shoulder so the elbow angle closes.
      pose[LM.LEFT_WRIST] = { ...wrist, x: wrist.x - 0.07 * bend, y: wrist.y - (wrist.y - shoulder.y) * 0.75 * bend };
      pose[LM.LEFT_ELBOW] = { ...pose[LM.LEFT_ELBOW]!, y: pose[LM.LEFT_ELBOW]!.y + 0.03 * bend };
      return pose;
    });
    const r = runPushups(clip);
    expect(r.reps).toHaveLength(0);
  });

  it('moving or shaking the phone at a still body never counts', () => {
    // The whole picture bobs up and down: every dot moves together.
    const r = runPushups(
      makeClip(20, (t) => pushupPose({ elbowDeg: 162, shiftY: 0.08 * Math.sin((2 * Math.PI * t) / 1.5), shiftX: 0.05 * Math.cos(t * 5) })),
    );
    expect(r.reps).toHaveLength(0);
  });

  it('real reps while the phone slides around are not counted', () => {
    const r = runPushups(
      pushupClip({ reps: 6, tweak: (t, base) => ({ ...base, shiftX: t > 1.5 ? 0.12 * Math.sin((2 * Math.PI * t) / 0.9) : 0 }) }),
    );
    expect(r.reps.length).toBeLessThanOrEqual(1);
    expect(r.rejects.some((e) => e.reason === 'moved')).toBe(true);
  });

  it('a gentle wobble of the phone does not spoil honest reps', () => {
    const r = runPushups(pushupClip({ reps: 6, tweak: (t, base) => ({ ...base, shiftY: 0.006 * Math.sin(t * 9) }) }));
    expect(r.reps).toHaveLength(6);
  });

  it('a rep is thrown away if the body vanishes half-way', () => {
    // Rep 2 runs from 3.6 s to 5.6 s. The body disappears for a full second in it.
    const r = runPushups(pushupClip({ reps: 4, tweak: (t, base) => (t > 4.3 && t < 5.3 ? null : base) }));
    expect(r.reps).toHaveLength(3);
    expect(r.rejects.map((e) => e.reason)).toContain('lost');
  });

  it('a rep is thrown away if the tracked body suddenly jumps (another person)', () => {
    const r = runPushups(pushupClip({ reps: 4, tweak: (t, base) => ({ ...base, shiftX: t > 4.4 && t < 5.2 ? 0.35 : 0 }) }));
    expect(r.reps.length).toBeLessThan(4);
    expect(r.rejects.some((e) => e.reason === 'jump' || e.reason === 'moved')).toBe(true);
  });

  it('missing joints (hidden arm) never count', () => {
    const r = runPushups(
      pushupClip({
        reps: 5,
        tweak: (_t, base) => base,
      }),
    );
    expect(r.reps).toHaveLength(5); // control: same clip counts when visible
    const hidden = pushupClip({ reps: 5 });
    for (const frame of hidden.frames) {
      if (frame.t > 2500 && frame.pose) {
        const pose = [...frame.pose];
        for (const i of [LM.LEFT_ELBOW, LM.RIGHT_ELBOW, LM.LEFT_WRIST, LM.RIGHT_WRIST]) pose[i] = { ...pose[i]!, visibility: 0.1 };
        frame.pose = pose;
      }
    }
    expect(runPushups(hidden).reps).toHaveLength(0);
  });

  it('random noise poses never count', () => {
    const random = rng(42);
    const clip = makeClip(30, () =>
      Array.from({ length: 33 }, () => ({ x: random(), y: random(), z: 0, visibility: 0.5 + random() * 0.5 })),
    );
    expect(runPushups(clip).reps).toHaveLength(0);
  });
});

describe('the start gate and leaving', () => {
  it('is not ready until the start position is held still', () => {
    const r = runPushups(pushupClip({ reps: 0, leadIn: 0.4 }));
    // Only 0.4 s + 1.2 s of top hold in total: just enough to become ready once.
    expect(r.becameReady).toBe(true);
    const tooShort = runPushups(makeClip(0.5, () => pushupPose({ elbowDeg: 165 })));
    expect(tooShort.becameReady).toBe(false);
  });

  it('is not ready with bent arms or a hanging body', () => {
    expect(runPushups(makeClip(4, () => pushupPose({ elbowDeg: 120 }))).becameReady).toBe(false);
    expect(runPushups(makeClip(4, () => pushupPose({ elbowDeg: 165, sag: 0.16 }))).becameReady).toBe(false);
  });

  it('notices when the person gets up and walks away', () => {
    const standing = standingPose();
    const clip = makeClip(14, (t) => (t < 6 ? pushupPose({ elbowDeg: 165 }) : t < 10 ? standing : null));
    const r = runPushups(clip);
    expect(r.events.filter((e) => e.type === 'left')).toHaveLength(1);
  });
});

/** An upright person facing the camera; `elbowDeg` bends the left arm. */
function standingPose(elbowDeg = 175): Landmark[] {
  const pose: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  const set = (i: number, x: number, y: number) => void (pose[i] = { x, y, z: 0, visibility: 0.95 });
  set(LM.LEFT_SHOULDER, 0.56, 0.25);
  set(LM.RIGHT_SHOULDER, 0.44, 0.25);
  set(LM.LEFT_HIP, 0.54, 0.55);
  set(LM.RIGHT_HIP, 0.46, 0.55);
  set(LM.LEFT_KNEE, 0.54, 0.73);
  set(LM.RIGHT_KNEE, 0.46, 0.73);
  set(LM.LEFT_ANKLE, 0.54, 0.92);
  set(LM.RIGHT_ANKLE, 0.46, 0.92);
  set(LM.RIGHT_ELBOW, 0.42, 0.4);
  set(LM.RIGHT_WRIST, 0.41, 0.55);
  // Left arm: upper arm hangs down, forearm swings by the elbow angle.
  const upper = 0.15;
  const ex = 0.58;
  const ey = 0.25 + upper;
  set(LM.LEFT_ELBOW, ex, ey);
  const a = ((180 - elbowDeg) * Math.PI) / 180;
  set(LM.LEFT_WRIST, ex + (upper * Math.sin(a)) / (4 / 3), ey + upper * Math.cos(a));
  return pose;
}
