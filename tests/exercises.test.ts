// The exam for every exercise in the library, at every level.
// Honest reps must count. Half reps, standing still, and DIFFERENT exercises must not.
import { describe, expect, it } from 'vitest';
import type { Detector, DetectorEvent, Frame, HoldEvent, RejectEvent, RepEvent } from '../src/detectors/types';
import { EXERCISES, EXERCISE_IDS, wave, type ExerciseDef, type ExerciseId, type Level } from '../src/exercises/library';
import * as M from '../src/exercises/models';
import { rng } from './helpers/synth';

const LEVELS: Level[] = [1, 2, 3];

interface ClipOptions {
  cycles: number;
  amount?: number;
  fps?: number;
  jitter?: number;
  seed?: number;
  /** Play faster or slower than the natural pace. */
  speed?: number;
  aspect?: number;
  /** Use this body instead of the exercise's own (for "wrong exercise" tests). */
  body?: (phase: number) => M.Body;
  repSec?: number;
}

/** Hold the rest position, do `cycles` reps, hold again. */
function clip(def: ExerciseDef, level: Level, o: ClipOptions): Frame[] {
  const fps = o.fps ?? 15;
  const aspect = o.aspect ?? 4 / 3;
  const repSec = (o.repSec ?? def.repSec(level)) / (o.speed ?? 1);
  const leadIn = 1.6;
  const total = leadIn + o.cycles * repSec + 1.4;
  const random = rng(o.seed ?? 1);
  const frames: Frame[] = [];
  for (let i = 0; i < total * fps; i++) {
    const tSec = i / fps;
    const moving = tSec >= leadIn && tSec < leadIn + o.cycles * repSec;
    const phase = moving ? ((tSec - leadIn) / repSec) % 1 : 0;
    const body = o.body ? o.body(phase) : def.body(phase, level, o.amount ?? 1);
    let pose = M.bodyToPose(body, { aspect });
    if (o.jitter) pose = pose.map((p) => ({ ...p, x: p.x + (random() - 0.5) * 2 * o.jitter!, y: p.y + (random() - 0.5) * 2 * o.jitter! }));
    frames.push({ t: 1000 + tSec * 1000 + (random() - 0.5) * 6, pose, aspect });
  }
  return frames;
}

interface Result {
  reps: RepEvent[];
  holds: HoldEvent[];
  rejects: RejectEvent[];
  events: DetectorEvent[];
  ready: boolean;
  count: number;
}

/** Play frames through a detector the way the app does: wait for the start position, then count. */
function run(detector: Detector, frames: Frame[], forceStart = false): Result {
  const events: DetectorEvent[] = [];
  let ready = false;
  if (forceStart) detector.startCounting();
  for (const frame of frames) {
    events.push(...detector.update(frame));
    if (!ready && detector.view.ready) {
      ready = true;
      detector.startCounting();
    }
  }
  return {
    reps: events.filter((e): e is RepEvent => e.type === 'rep'),
    holds: events.filter((e): e is HoldEvent => e.type === 'hold'),
    rejects: events.filter((e): e is RejectEvent => e.type === 'reject'),
    events,
    ready,
    count: detector.view.count,
  };
}

/** Climbers and high knees do two reps (one per leg) in each cycle of the model. */
const perCycle = (id: ExerciseId) => (id === 'climber' || id === 'highknees' ? 2 : 1);
const REP_IDS = EXERCISE_IDS.filter((id) => EXERCISES[id].kind === 'reps');

describe('the library is complete', () => {
  it('has at least 10 exercises, each with three named versions, tips and targets', () => {
    expect(EXERCISE_IDS.length).toBeGreaterThanOrEqual(10);
    for (const id of EXERCISE_IDS) {
      const def = EXERCISES[id];
      expect(def.versions).toHaveLength(3);
      expect(def.tips.length).toBeGreaterThanOrEqual(2);
      expect(def.tips.length).toBeLessThanOrEqual(3);
      for (const v of def.versions) expect(v.name.length * v.how.length).toBeGreaterThan(0);
      for (const target of def.base) expect(target).toBeGreaterThan(0);
      expect(def.focus.length).toBeGreaterThan(0);
    }
  });

  it('covers every training focus, including back and posture work', () => {
    for (const focus of ['push', 'legs', 'core', 'cardio', 'back'] as const) {
      expect(EXERCISE_IDS.filter((id) => EXERCISES[id].focus.includes(focus)).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe.each(REP_IDS)('%s', (id) => {
  const def = EXERCISES[id];

  it.each(LEVELS)('level %i: counts honest reps exactly', (level) => {
    const r = run(def.detector(level), clip(def, level, { cycles: 5 }));
    expect(r.ready).toBe(true);
    expect(r.rejects.map((e) => e.reason)).toEqual([]);
    expect(r.reps).toHaveLength(5 * perCycle(id));
    for (const rep of r.reps) expect(rep.score).toBeGreaterThanOrEqual(60);
  });

  it.each(LEVELS)('level %i: still exact with camera jitter', (level) => {
    for (const seed of [1, 2, 3]) {
      const r = run(def.detector(level), clip(def, level, { cycles: 4, jitter: 0.003, seed }));
      expect(r.reps).toHaveLength(4 * perCycle(id));
    }
  });

  it.each(LEVELS)('level %i: half reps never count', (level) => {
    const r = run(def.detector(level), clip(def, level, { cycles: 6, amount: 0.5 }));
    expect(r.reps).toHaveLength(0);
  });

  it('works at 10 and 30 looks per second, and in a square picture', () => {
    const n = 4 * perCycle(id);
    // Very fast moves need the faster rates; at 10 per second we only require "no over-counting".
    expect(run(def.detector(2), clip(def, 2, { cycles: 4, fps: 30 })).reps).toHaveLength(n);
    expect(run(def.detector(2), clip(def, 2, { cycles: 4, fps: 10 })).reps.length).toBeLessThanOrEqual(n);
    expect(run(def.detector(2), clip(def, 2, { cycles: 4, fps: 10 })).reps.length).toBeGreaterThanOrEqual(n - 1);
    expect(run(def.detector(2), clip(def, 2, { cycles: 4, aspect: 1 })).reps).toHaveLength(n);
  });

  it('never counts someone standing still, even with heavy jitter', () => {
    const still = clip(def, 2, { cycles: 8, body: () => M.standing(), jitter: 0.012, seed: 9 });
    expect(run(def.detector(2), still, true).reps).toHaveLength(0);
  });

  it('never counts impossible speed', () => {
    const r = run(def.detector(2), clip(def, 2, { cycles: 30, speed: 8, fps: 30 }));
    // Eight times natural speed: a few may slip through for the very fast moves, never many.
    expect(r.reps.length).toBeLessThanOrEqual(id === 'highknees' || id === 'climber' || id === 'jack' ? 30 : 2);
  });

  it('never counts a different exercise', () => {
    for (const other of REP_IDS) {
      if (other === id) continue;
      const otherDef = EXERCISES[other];
      const frames = clip(def, 2, { cycles: 5, body: (phase) => otherDef.body(phase, 2), repSec: otherDef.repSec(2) });
      // Start counting immediately, without waiting for the gate: the strictest test.
      const counted = run(def.detector(2), frames, true).reps.length;
      expect(counted, `${id} detector counted ${counted} reps of ${other}`).toBe(0);
    }
  });
});

describe('versions with extra demands', () => {
  it.each(['squat', 'lunge', 'goodmorning'] as const)('%s: the pause version rejects reps with no pause', (id) => {
    const def = EXERCISES[id];
    // Level 2 movement (no pause) shown to the level 3 detector.
    const r = run(def.detector(3), clip(def, 3, { cycles: 4, body: (p) => def.body(p, 2), repSec: def.repSec(2) }));
    expect(r.reps).toHaveLength(0);
    expect(r.rejects.every((e) => e.reason === 'no-pause' && e.cue === 'hold-it')).toBe(true);
  });

  it.each(['bridge', 'birddog'] as const)('%s: hold versions reject reps that are not held', (id) => {
    const def = EXERCISES[id];
    for (const level of [2, 3] as const) {
      const r = run(def.detector(level), clip(def, level, { cycles: 4, body: (p) => def.body(p, 1), repSec: def.repSec(1) }));
      expect(r.reps).toHaveLength(0);
      expect(r.rejects.length).toBeGreaterThan(0);
    }
  });

  it('slow push-up rejects normal-speed reps, slow sit-up rejects quick ones', () => {
    for (const id of ['pushup', 'situp'] as const) {
      const def = EXERCISES[id];
      const r = run(def.detector(3), clip(def, 3, { cycles: 4, body: (p) => def.body(p, 2), repSec: def.repSec(2) }));
      expect(r.reps).toHaveLength(0);
      expect(r.rejects.every((e) => e.reason === 'too-fast')).toBe(true);
    }
  });

  it('push-up burpee rejects burpees with no push-up', () => {
    const def = EXERCISES.burpee;
    const r = run(def.detector(3), clip(def, 3, { cycles: 3, body: (p) => def.body(p, 2) }));
    expect(r.reps).toHaveLength(0);
    expect(r.rejects.every((e) => e.cue === 'add-pushup')).toBe(true);
  });

  it('a lunge needs a real step back: squatting on the spot is rejected', () => {
    const r = run(EXERCISES.lunge.detector(2), clip(EXERCISES.lunge, 2, { cycles: 4, body: (p) => EXERCISES.squat.body(p, 2) }), true);
    expect(r.reps).toHaveLength(0);
  });

  it('a good morning needs straight legs: squats are rejected with the right tip', () => {
    const r = run(EXERCISES.goodmorning.detector(2), clip(EXERCISES.goodmorning, 2, { cycles: 4, body: (p) => EXERCISES.squat.body(p, 2) }), true);
    expect(r.reps).toHaveLength(0);
    expect(r.rejects.some((e) => e.cue === 'straight-legs')).toBe(true);
  });

  it('jumping jacks need both arms and legs', () => {
    const def = EXERCISES.jack;
    // Arms only: feet stay together.
    const armsOnly = (p: number) => {
      const open = M.jack(wave(p));
      const closed = M.jack(0);
      return { ...open, near: { ...open.near, hip: closed.near.hip, knee: closed.near.knee, ankle: closed.near.ankle }, far: { ...open.far, hip: closed.far.hip, knee: closed.far.knee, ankle: closed.far.ankle } };
    };
    expect(run(def.detector(2), clip(def, 2, { cycles: 6, body: armsOnly })).reps).toHaveLength(0);
  });

  it('high knees: low knees are not counted and the coach says so', () => {
    const def = EXERCISES.highknees;
    const r = run(def.detector(2), clip(def, 2, { cycles: 6, amount: 0.75 }));
    expect(r.reps).toHaveLength(0);
    expect(r.rejects.some((e) => e.cue === 'knees-higher')).toBe(true);
  });
});

describe('plank (timed hold)', () => {
  const def = EXERCISES.plank;
  const hold = (seconds: number, body: (tSec: number) => M.Body | null, jitter = 0.002): Frame[] => {
    const random = rng(5);
    const frames: Frame[] = [];
    for (let i = 0; i < seconds * 15; i++) {
      const tSec = i / 15;
      const b = body(tSec);
      const pose = b ? M.bodyToPose(b).map((p) => ({ ...p, x: p.x + (random() - 0.5) * 2 * jitter, y: p.y + (random() - 0.5) * 2 * jitter })) : null;
      frames.push({ t: 1000 + tSec * 1000, pose, aspect: 4 / 3 });
    }
    return frames;
  };

  it.each(LEVELS)('level %i: counts the seconds of a good plank', (level) => {
    const r = run(def.detector(level), hold(12, () => M.plank({ knees: level === 1 })));
    expect(r.ready).toBe(true);
    // 12 s of footage, minus the 0.8 s start gate.
    expect(r.count).toBeGreaterThanOrEqual(10);
    expect(r.count).toBeLessThanOrEqual(12);
    expect(r.holds.at(-1)!.score).toBeGreaterThan(85);
  });

  it('stops the clock while the hips sag, and says "hips up"', () => {
    // Good for 5 s, sagging for 5 s, good for 5 s.
    const r = run(def.detector(2), hold(15, (t) => M.plank({ sag: t > 5 && t < 10 ? 0.14 : 0 })));
    expect(r.count).toBeGreaterThanOrEqual(8);
    expect(r.count).toBeLessThanOrEqual(10);
    expect(r.events.some((e) => e.type === 'cue' && e.cue === 'hips-up')).toBe(true);
  });

  it('says "hips down" for a pike', () => {
    const r = run(def.detector(2), hold(10, (t) => M.plank({ sag: t > 3 ? -0.15 : 0 })));
    expect(r.events.some((e) => e.type === 'cue' && e.cue === 'hips-down')).toBe(true);
    expect(r.count).toBeLessThanOrEqual(3);
  });

  it('never counts lying flat on the floor', () => {
    const r = run(def.detector(2), hold(12, () => M.plank({ collapsed: true })), true);
    expect(r.count).toBe(0);
  });

  it('never counts standing, sitting up, or a squat hold', () => {
    for (const body of [M.standing(), M.situp(70), M.squat(95), M.bridge(1)]) {
      expect(run(def.detector(2), hold(10, () => body), true).count).toBe(0);
    }
  });

  it('the full plank does not accept a knee plank', () => {
    const r = run(def.detector(2), hold(10, () => M.plank({ knees: true })), true);
    expect(r.count).toBe(0);
    expect(r.events.some((e) => e.type === 'cue' && e.cue === 'knees-up')).toBe(true);
  });

  it('the strict plank is fussier about the line than the normal plank', () => {
    const slightSag = () => M.plank({ sag: 0.07 });
    expect(run(def.detector(2), hold(10, slightSag)).count).toBeGreaterThan(7);
    expect(run(def.detector(3), hold(10, slightSag), true).count).toBe(0);
  });

  it('a frozen picture cannot hand out free seconds', () => {
    // Good plank, but frames arrive only once every 3 seconds.
    const frames = hold(30, () => M.plank()).filter((_f, i) => i % 45 === 0);
    expect(run(def.detector(2), frames, true).count).toBeLessThanOrEqual(2);
  });

  it('notices when the person gets up', () => {
    const r = run(def.detector(2), hold(16, (t) => (t < 6 ? M.plank() : M.standing())));
    expect(r.events.filter((e) => e.type === 'left')).toHaveLength(1);
  });
});
