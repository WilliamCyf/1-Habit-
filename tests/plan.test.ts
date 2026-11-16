import { describe, expect, it } from 'vitest';
import { EXERCISES, EXERCISE_IDS, type ExerciseId, type Level } from '../src/exercises/library';
import {
  adjust,
  blockSeconds,
  buildSession,
  levelFromTest,
  swapForLimits,
  targetFor,
  weekIndexOf,
  weeklySplit,
  weekStart,
  type PlanInput,
} from '../src/plan/plan';
import { DAY_OPTIONS, GOALS, LIMITS, MINUTE_OPTIONS, type Limit, type Profile } from '../src/profile/profile';

const profile: Profile = {
  gender: 'male',
  age: 21,
  heightCm: 175,
  weightKg: 70,
  goal: 'general',
  experience: 'some',
  daysPerWeek: 4,
  minutesPerSession: 20,
  limits: [],
};

const input = (over: Partial<PlanInput> & { p?: Partial<Profile> } = {}): PlanInput => ({
  profile: { ...profile, ...over.p },
  baseLevel: 2,
  progress: {},
  weekIndex: 0,
  sessionIndex: 0,
  ...over,
});

describe('weekly split', () => {
  it('gives the right number of sessions for every choice', () => {
    for (const days of [1, 2, 3, 4, 5, 6, 7]) expect(weeklySplit(days)).toHaveLength(days);
  });

  it('never puts the same hard focus on two sessions in a row', () => {
    for (const days of [3, 4, 5, 6, 7]) {
      const split = weeklySplit(days);
      for (let i = 1; i < split.length; i++) {
        if (split[i] !== 'full') expect(split[i]).not.toBe(split[i - 1]);
      }
    }
  });

  it('covers push, legs and core within a week of 3 or more days', () => {
    for (const days of [3, 4, 5, 6]) {
      const ids = new Set<ExerciseId>();
      weeklySplit(days).forEach((_f, i) => buildSession(input({ p: { daysPerWeek: days, minutesPerSession: 30 }, sessionIndex: i })).blocks.forEach((b) => ids.add(b.exercise)));
      for (const focus of ['push', 'legs', 'core', 'back'] as const) {
        expect([...ids].some((id) => EXERCISES[id].focus.includes(focus)), `${days} days: no ${focus} work`).toBe(true);
      }
    }
  });
});

describe('every session, for every kind of user', () => {
  const combos: PlanInput[] = [];
  for (const days of DAY_OPTIONS) {
    for (const minutes of MINUTE_OPTIONS) {
      for (const goal of GOALS) {
        for (const level of [1, 2, 3] as Level[]) {
          for (let s = 0; s < days; s++) combos.push(input({ p: { daysPerWeek: days, minutesPerSession: minutes, goal }, baseLevel: level, sessionIndex: s, weekIndex: s % 4 }));
        }
      }
    }
  }

  it(`is sensible across ${combos.length} combinations`, () => {
    for (const c of combos) {
      const s = buildSession(c);
      const label = `${c.profile.daysPerWeek}d ${c.profile.minutesPerSession}min ${c.profile.goal} L${c.baseLevel} #${c.sessionIndex}`;
      // Always a warm-up and a cool-down.
      expect(s.warmup.length, label).toBeGreaterThanOrEqual(3);
      expect(s.cooldown.length, label).toBeGreaterThanOrEqual(2);
      // Real work, but not an absurd amount.
      expect(s.blocks.length, label).toBeGreaterThanOrEqual(2);
      expect(s.blocks.length, label).toBeLessThanOrEqual(6);
      // No exercise twice.
      expect(new Set(s.blocks.map((b) => b.exercise)).size, label).toBe(s.blocks.length);
      for (const b of s.blocks) {
        expect(b.sets, label).toBeGreaterThanOrEqual(2);
        expect(b.sets, label).toBeLessThanOrEqual(4);
        expect(b.target, label).toBeGreaterThanOrEqual(3);
        expect(b.restSec, label).toBeGreaterThanOrEqual(30);
      }
      // Fits the time asked for (a little slack either way is fine).
      expect(s.minutes, label).toBeLessThanOrEqual(c.profile.minutesPerSession * 1.2 + 1);
      expect(s.minutes, label).toBeGreaterThanOrEqual(Math.min(c.profile.minutesPerSession * 0.5, 8));
      // Every session includes some back or posture work.
      expect(s.blocks.some((b) => EXERCISES[b.exercise].focus.includes('back') || b.exercise === 'plank'), label).toBe(true);
      expect(s.kcal, label).toBeGreaterThan(10);
    }
  });
});

describe('short sessions', () => {
  it('a 10-minute full-body session still trains legs, push and back', () => {
    const plan = buildSession(input({ p: { daysPerWeek: 2, minutesPerSession: 10 } }));
    expect(plan.blocks.map((b) => b.exercise)).toEqual(['squat', 'pushup', 'bridge']);
    expect(plan.warmup).toHaveLength(3);
    expect(plan.cooldown).toHaveLength(2);
  });

  it('longer sessions get the full warm-up and cool-down', () => {
    const plan = buildSession(input({ p: { minutesPerSession: 30 } }));
    expect(plan.warmup).toHaveLength(5);
    expect(plan.cooldown).toHaveLength(4);
  });
});

describe('protecting sore areas', () => {
  it('never schedules an exercise that loads a protected area, for any combination', () => {
    // Every possible set of limits (16 of them), every focus, short and long.
    for (let mask = 0; mask < 16; mask++) {
      const limits = LIMITS.filter((_l, i) => mask & (1 << i)) as Limit[];
      for (let s = 0; s < 6; s++) {
        for (const minutes of [10, 45]) {
          const plan = buildSession(input({ p: { limits, daysPerWeek: 6, minutesPerSession: minutes }, sessionIndex: s }));
          for (const b of plan.blocks) {
            const bad = EXERCISES[b.exercise].avoid.filter((l) => limits.includes(l));
            expect(bad, `${b.exercise} with limits ${limits.join('+')}`).toEqual([]);
          }
          expect(plan.blocks.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('swaps squats for a knee-friendly move', () => {
    expect(swapForLimits('squat', ['knees'], [])).toBe('bridge');
    expect(swapForLimits('squat', ['knees'], ['bridge'])).toBe('goodmorning');
    expect(swapForLimits('squat', [], [])).toBe('squat');
  });

  it('keeps push-ups for sore wrists but one version easier', () => {
    const plan = buildSession(input({ p: { limits: ['wrists'], minutesPerSession: 30 }, sessionIndex: 0 }));
    const pushup = plan.blocks.find((b) => b.exercise === 'pushup');
    expect(pushup?.level).toBe(1);
    expect(plan.warmup.some((s) => s.name === 'Cat and cow')).toBe(false);
  });

  it('avoids kneeling stretches for sore knees', () => {
    const plan = buildSession(input({ p: { limits: ['knees'], minutesPerSession: 30 } }));
    expect(plan.cooldown.some((s) => s.name.includes('Child'))).toBe(false);
    expect(plan.warmup.some((s) => s.name.includes('squat'))).toBe(false);
  });
});

describe('progressive overload and deload', () => {
  it('asks for more in weeks 2 and 3, then less in week 4', () => {
    const t = [0, 1, 2, 3].map((w) => targetFor('squat', 2, 0, w, 'general'));
    expect(t[1]).toBeGreaterThan(t[0]!);
    expect(t[2]).toBeGreaterThan(t[1]!);
    expect(t[3]).toBeLessThan(t[0]!);
  });

  it('marks week 4 as a deload with fewer sets', () => {
    const normal = buildSession(input({ weekIndex: 0, p: { minutesPerSession: 30 } }));
    const deload = buildSession(input({ weekIndex: 3, p: { minutesPerSession: 30 } }));
    expect(deload.deload).toBe(true);
    expect(deload.week).toBe(4);
    expect(deload.blocks[0]!.sets).toBeLessThan(normal.blocks[0]!.sets);
  });

  it('rounds plank targets to tidy five-second steps', () => {
    for (const w of [0, 1, 2, 3]) expect(targetFor('plank', 2, 1, w, 'general') % 5).toBe(0);
  });

  it('gives endurance more reps and muscle longer rests', () => {
    expect(targetFor('squat', 2, 0, 0, 'endurance')).toBeGreaterThan(targetFor('squat', 2, 0, 0, 'general'));
    const muscle = buildSession(input({ p: { goal: 'muscle' } }));
    const fat = buildSession(input({ p: { goal: 'fat-loss' } }));
    expect(muscle.blocks[0]!.restSec).toBeGreaterThan(fat.blocks[0]!.restSec);
  });

  it('never produces a silly target for any exercise, level or week', () => {
    for (const id of EXERCISE_IDS) {
      for (const level of [1, 2, 3] as Level[]) {
        for (const steps of [-3, 0, 8]) {
          for (const w of [0, 1, 2, 3]) {
            const target = targetFor(id, level, steps, w, 'endurance');
            expect(target).toBeGreaterThanOrEqual(3);
            expect(target).toBeLessThanOrEqual(90);
          }
        }
      }
    }
  });
});

describe('auto-adjust from real performance', () => {
  const hit = { count: 10, target: 10, avgScore: 90 };
  const sloppy = { count: 10, target: 10, avgScore: 60 };
  const short = { count: 5, target: 10, avgScore: 85 };
  const close = { count: 8, target: 10, avgScore: 85 };

  it('goes up a step when every set hits the target with good form', () => {
    expect(adjust({ level: 2, steps: 0 }, [hit, hit, hit])).toEqual({ level: 2, steps: 1 });
  });

  it('holds steady when reps were hit with poor form: quality first', () => {
    expect(adjust({ level: 2, steps: 0 }, [sloppy, sloppy])).toEqual({ level: 2, steps: 0 });
  });

  it('holds steady for a near miss, and eases off for a clear struggle', () => {
    expect(adjust({ level: 2, steps: 1 }, [hit, close])).toEqual({ level: 2, steps: 1 });
    expect(adjust({ level: 2, steps: 1 }, [hit, short])).toEqual({ level: 2, steps: 0 });
  });

  it('promotes to the next version after six steps up', () => {
    let p = { level: 1 as Level, steps: 0 };
    for (let i = 0; i < 6; i++) p = adjust(p, [hit, hit]);
    expect(p).toEqual({ level: 2, steps: 0 });
  });

  it('drops back a version after three steps down, and never below level 1', () => {
    let p = { level: 2 as Level, steps: 0 };
    for (let i = 0; i < 3; i++) p = adjust(p, [short]);
    expect(p).toEqual({ level: 1, steps: 2 });
    let bottom = { level: 1 as Level, steps: 0 };
    for (let i = 0; i < 10; i++) bottom = adjust(bottom, [short]);
    expect(bottom).toEqual({ level: 1, steps: -3 });
  });

  it('stops climbing at the top', () => {
    let p = { level: 3 as Level, steps: 0 };
    for (let i = 0; i < 20; i++) p = adjust(p, [hit]);
    expect(p).toEqual({ level: 3, steps: 8 });
  });

  it('uses the adjusted level and steps in the next plan', () => {
    const before = buildSession(input({ sessionIndex: 1 })).blocks.find((b) => b.exercise === 'squat')!;
    const after = buildSession(input({ sessionIndex: 1, progress: { squat: { level: 2, steps: 4 } } })).blocks.find((b) => b.exercise === 'squat')!;
    expect(after.target).toBeGreaterThan(before.target);
    const promoted = buildSession(input({ sessionIndex: 1, progress: { squat: { level: 3, steps: 0 } } })).blocks.find((b) => b.exercise === 'squat')!;
    expect(promoted.level).toBe(3);
  });
});

describe('calendar and placement', () => {
  it('finds the Monday of any week', () => {
    // 15 November 2026 is a Sunday; its week began on Monday the 9th.
    expect(weekStart(new Date(2026, 10, 15, 21, 30)).getDate()).toBe(9);
    expect(weekStart(new Date(2026, 10, 9, 0, 5)).getDate()).toBe(9);
    expect(weekStart(new Date(2026, 10, 16)).getDate()).toBe(16);
  });

  it('cycles through a four-week block', () => {
    const start = new Date(2026, 10, 11); // a Wednesday
    expect(weekIndexOf(start, new Date(2026, 10, 15))).toBe(0);
    expect(weekIndexOf(start, new Date(2026, 10, 16))).toBe(1);
    expect(weekIndexOf(start, new Date(2026, 10, 30))).toBe(3);
    expect(weekIndexOf(start, new Date(2026, 11, 7))).toBe(0);
  });

  it('places people from the fitness test', () => {
    expect(levelFromTest(3, true, 10)).toBe(1);
    expect(levelFromTest(12, false, 22)).toBe(2);
    expect(levelFromTest(25, false, 35)).toBe(3);
    // Twenty knee push-ups are worth twelve full ones: level 2, not 3.
    expect(levelFromTest(20, true, 35)).toBe(2);
    // Strong arms but weak legs is still not level 3.
    expect(levelFromTest(30, false, 20)).toBe(2);
  });

  it('estimates block time from reps, holds and rests', () => {
    // 3 sets of 10 squats at 2.2 s each, 45 s rests, 12 s set-up per set.
    expect(blockSeconds({ exercise: 'squat', level: 2, sets: 3, target: 10, restSec: 45 })).toBeCloseTo(3 * (22 + 12) + 2 * 45, 5);
    expect(blockSeconds({ exercise: 'plank', level: 2, sets: 2, target: 30, restSec: 30 })).toBe(2 * 42 + 30);
  });
});
