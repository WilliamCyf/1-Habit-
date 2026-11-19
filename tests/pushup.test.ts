// The push-up counter's exam on SIMULATED bodies: every kind of cheat.
// (Real videos are tested in tests/real.test.ts.)
import { describe, expect, it } from 'vitest';
import { PushupDetector } from '../src/detectors/pushup';
import { pushupPose } from '../src/detectors/pushupModel';
import { LM, type Landmark } from '../src/pose/landmarks';
import { makeClip, pushupClip, rng, runPushups } from './helpers/synth';

describe('honest push-ups are counted', () => {
  it('counts 10 clean side-on reps and scores them well', () => {
    const r = runPushups(pushupClip({ reps: 10 }));
    expect(r.becameReady).toBe(true);
    expect(r.reps.map((e) => e.count)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.rejects).toHaveLength(0);
    for (const rep of r.reps) expect(rep.score).toBeGreaterThanOrEqual(80);
  });

  it('counts exactly, even with realistic camera jitter', () => {
    for (const seed of [1, 2, 3, 4, 5]) expect(runPushups(pushupClip({ reps: 8, jitter: 0.004, seed })).reps).toHaveLength(8);
  });

  it('counts the same at 10, 15 and 30 looks per second', () => {
    for (const fps of [10, 15, 30]) expect(runPushups(pushupClip({ reps: 6, fps, jitter: 0.003 })).reps).toHaveLength(6);
  });

  it('counts facing either way, and in a squarer picture', () => {
    expect(runPushups(pushupClip({ reps: 5, pose: { facingRight: false } })).reps).toHaveLength(5);
    expect(runPushups(pushupClip({ reps: 5, aspect: 1.2, pose: { size: 0.5 } })).reps).toHaveLength(5);
  });

  it('counts slow reps and brisk-but-real reps', () => {
    expect(runPushups(pushupClip({ reps: 3, repSec: 4 })).reps).toHaveLength(3);
    expect(runPushups(pushupClip({ reps: 6, repSec: 1 })).reps).toHaveLength(6);
  });

  it('counts knee push-ups', () => {
    expect(runPushups(pushupClip({ reps: 6, pose: { knees: true }, jitter: 0.003 })).reps).toHaveLength(6);
  });

  it('survives the camera losing the body for a blink', () => {
    expect(runPushups(pushupClip({ reps: 4, tweak: (t, base) => (t > 4.3 && t < 4.42 ? null : base) })).reps).toHaveLength(4);
  });
});

describe('form is scored and coached', () => {
  it('scores deeper reps higher, and says "go lower" for reps that only just make it', () => {
    const deep = runPushups(pushupClip({ reps: 3, bottomDeg: 70 })).reps;
    const shallow = runPushups(pushupClip({ reps: 3, bottomDeg: 100 })).reps;
    expect(shallow).toHaveLength(3);
    expect(deep[0]!.score).toBeGreaterThan(shallow[0]!.score);
    expect(shallow[0]!.cue).toBe('go-lower');
  });

  it('side-on, counts mildly sagging hips but says "hips up"', () => {
    const r = runPushups(pushupClip({ reps: 4, pose: { sag: 0.085 } }));
    expect(r.reps).toHaveLength(4);
    expect(r.reps[0]!.cue).toBe('hips-up');
  });

  it('side-on, says "hips down" for a mild pike', () => {
    const r = runPushups(pushupClip({ reps: 4, pose: { sag: -0.085 } }));
    expect(r.reps).toHaveLength(4);
    expect(r.reps[0]!.cue).toBe('hips-down');
  });

  it('says "slow down" for rushed reps', () => {
    const r = runPushups(pushupClip({ reps: 6, repSec: 0.8 }));
    expect(r.reps.length).toBeGreaterThanOrEqual(5);
    expect(r.reps.at(-1)!.cue).toBe('slow-down');
  });
});

describe('cheating and bad reps are rejected', () => {
  it('half reps: bending only part-way never counts', () => {
    const r = runPushups(pushupClip({ reps: 8, bottomDeg: 125 }));
    expect(r.reps).toHaveLength(0);
    expect(r.rejects.length).toBeGreaterThanOrEqual(6);
    expect(r.rejects.every((e) => e.reason === 'shallow' && e.cue === 'go-lower')).toBe(true);
  });

  it('fast bouncing: impossible speed never counts', () => {
    for (const fps of [15, 30]) expect(runPushups(pushupClip({ reps: 20, repSec: 0.4, fps })).reps).toHaveLength(0);
    const r = runPushups(pushupClip({ reps: 20, repSec: 0.6, fps: 30 }));
    expect(r.reps).toHaveLength(0);
    expect(r.rejects.some((e) => e.reason === 'too-fast')).toBe(true);
  });

  it('side-on, badly sagging hips ("the worm") never count', () => {
    const r = runPushups(pushupClip({ reps: 6, tweak: (t, base) => ({ ...base, sag: t > 1.5 ? 0.18 : 0 }) }));
    expect(r.reps).toHaveLength(0);
    expect(r.rejects[0]!.cue).toBe('hips-up');
  });

  it('side-on, a badly piked body never counts', () => {
    const r = runPushups(pushupClip({ reps: 6, tweak: (t, base) => ({ ...base, sag: t > 1.5 ? -0.19 : 0 }) }));
    expect(r.reps).toHaveLength(0);
    expect(r.rejects[0]!.cue).toBe('hips-down');
  });

  it('standing still, with camera jitter, never counts', () => {
    const r = runPushups(makeClip(20, () => standingPose(), { jitter: 0.01, seed: 7 }));
    expect(r.becameReady).toBe(false);
    expect(r.reps).toHaveLength(0);
  });

  it('holding a plank with heavy jitter never counts', () => {
    expect(runPushups(makeClip(20, () => pushupPose({ elbowDeg: 162 }), { jitter: 0.012, seed: 3 })).reps).toHaveLength(0);
  });

  it('standing and waving an arm never counts, from the front or the side', () => {
    const wave = (t: number) => 90 + 75 * (0.5 + 0.5 * Math.cos((2 * Math.PI * t) / 2));
    expect(runPushups(makeClip(20, (t) => standingPose(wave(t)), { jitter: 0.003 })).reps).toHaveLength(0);
    // Even with the face hidden: the hips give it away.
    expect(runPushups(makeClip(20, (t) => standingPose(wave(t), false), { jitter: 0.003 })).reps).toHaveLength(0);
  });

  it('standing and pumping BOTH arms never counts, even if counting is forced on', () => {
    const d = new PushupDetector();
    d.startCounting();
    let reps = 0;
    for (const f of makeClip(20, (t) => standingPose(90 + 75 * (0.5 + 0.5 * Math.cos((2 * Math.PI * t) / 2)), true, true)).frames) reps += d.update(f).filter((e) => e.type === 'rep').length;
    expect(reps).toBe(0);
  });

  it('lying still and bending just the arm never counts', () => {
    const clip = makeClip(24, (t) => {
      const pose = pushupPose({ elbowDeg: 165 });
      const bend = t > 1.6 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (t - 1.6)) / 2) : 0;
      const wrist = pose[LM.LEFT_WRIST]!;
      const shoulder = pose[LM.LEFT_SHOULDER]!;
      pose[LM.LEFT_WRIST] = { ...wrist, x: wrist.x - 0.07 * bend, y: wrist.y - (wrist.y - shoulder.y) * 0.75 * bend };
      pose[LM.LEFT_ELBOW] = { ...pose[LM.LEFT_ELBOW]!, y: pose[LM.LEFT_ELBOW]!.y + 0.03 * bend };
      return pose;
    });
    expect(runPushups(clip).reps).toHaveLength(0);
  });

  it('moving or shaking the phone at a still body never counts', () => {
    const r = runPushups(makeClip(20, (t) => pushupPose({ elbowDeg: 162, shiftY: 0.08 * Math.sin((2 * Math.PI * t) / 1.5), shiftX: 0.05 * Math.cos(t * 5) })));
    expect(r.reps).toHaveLength(0);
  });

  it('real reps while the phone slides around are not counted', () => {
    const r = runPushups(pushupClip({ reps: 6, tweak: (t, base) => ({ ...base, shiftX: t > 1.5 ? 0.12 * Math.sin((2 * Math.PI * t) / 0.9) : 0 }) }));
    expect(r.reps.length).toBeLessThanOrEqual(1);
    expect(r.rejects.some((e) => e.reason === 'moved' || e.reason === 'jump')).toBe(true);
  });

  it('a gentle wobble of the phone does not spoil honest reps', () => {
    expect(runPushups(pushupClip({ reps: 6, tweak: (t, base) => ({ ...base, shiftY: 0.006 * Math.sin(t * 9) }) })).reps).toHaveLength(6);
  });

  it('a rep is thrown away if the body vanishes half-way', () => {
    const r = runPushups(pushupClip({ reps: 4, tweak: (t, base) => (t > 4.3 && t < 5.3 ? null : base) }));
    expect(r.reps).toHaveLength(3);
    expect(r.rejects.map((e) => e.reason)).toContain('lost');
  });

  it('a rep is thrown away if the tracked body suddenly jumps (another person)', () => {
    const r = runPushups(pushupClip({ reps: 4, tweak: (t, base) => ({ ...base, shiftX: t > 4.4 && t < 5.2 ? 0.45 : 0 }) }));
    expect(r.reps.length).toBeLessThan(4);
    expect(r.rejects.some((e) => e.reason === 'jump' || e.reason === 'moved')).toBe(true);
  });

  it('hidden arms never count', () => {
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
    const clip = makeClip(30, () => Array.from({ length: 33 }, () => ({ x: random(), y: random(), z: 0, visibility: 0.5 + random() * 0.5 })));
    expect(runPushups(clip).reps).toHaveLength(0);
  });
});

describe('the start gate and leaving', () => {
  it('is not ready until the start position is held still', () => {
    expect(runPushups(pushupClip({ reps: 0, leadIn: 0.4 })).becameReady).toBe(true);
    expect(runPushups(makeClip(0.5, () => pushupPose({ elbowDeg: 165 }))).becameReady).toBe(false);
  });

  it('is not ready with bent arms', () => {
    expect(runPushups(makeClip(4, () => pushupPose({ elbowDeg: 110 }))).becameReady).toBe(false);
  });

  it('notices when the person gets up and walks away', () => {
    const clip = makeClip(14, (t) => (t < 6 ? pushupPose({ elbowDeg: 165 }) : t < 10 ? standingPose() : null));
    expect(runPushups(clip).events.filter((e) => e.type === 'left')).toHaveLength(1);
  });
});

/**
 * An upright person facing the camera. `elbowDeg` bends the left arm (or
 * both). `face` false hides the face, as if looking away.
 */
function standingPose(elbowDeg = 175, face = true, bothArms = false): Landmark[] {
  const pose: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  const set = (i: number, x: number, y: number, v = 0.95) => void (pose[i] = { x, y, z: 0, visibility: v });
  set(LM.NOSE, 0.5, 0.15, face ? 0.98 : 0.1);
  set(LM.LEFT_EAR, 0.53, 0.14, face ? 0.9 : 0.1);
  set(LM.RIGHT_EAR, 0.47, 0.14, face ? 0.9 : 0.1);
  set(LM.LEFT_SHOULDER, 0.56, 0.25);
  set(LM.RIGHT_SHOULDER, 0.44, 0.25);
  set(LM.LEFT_HIP, 0.54, 0.55);
  set(LM.RIGHT_HIP, 0.46, 0.55);
  set(LM.LEFT_KNEE, 0.54, 0.73);
  set(LM.RIGHT_KNEE, 0.46, 0.73);
  set(LM.LEFT_ANKLE, 0.54, 0.92);
  set(LM.RIGHT_ANKLE, 0.46, 0.92);
  const upper = 0.15;
  const arm = (side: 1 | -1, deg: number) => {
    const ex = 0.5 + side * 0.08;
    const ey = 0.25 + upper;
    set(side > 0 ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW, ex, ey);
    const a = ((180 - deg) * Math.PI) / 180;
    set(side > 0 ? LM.LEFT_WRIST : LM.RIGHT_WRIST, ex + (side * upper * Math.sin(a)) / (4 / 3), ey + upper * Math.cos(a));
  };
  arm(1, elbowDeg);
  arm(-1, bothArms ? elbowDeg : 175);
  return pose;
}
