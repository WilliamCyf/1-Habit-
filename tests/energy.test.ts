import { describe, expect, it } from 'vitest';
import {
  activityFactor,
  bmr,
  dailyNeed,
  energyTarget,
  kcalBurned,
  roundKcal,
  startLevel,
  workoutBurn,
} from '../src/profile/energy';
import { isCompleteProfile, profileProblems, type Profile } from '../src/profile/profile';

const base: Profile = {
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

describe('BMR (Mifflin-St Jeor)', () => {
  it('matches a hand calculation for a man', () => {
    // 10*70 + 6.25*175 - 5*21 + 5 = 700 + 1093.75 - 105 + 5
    expect(bmr(base)).toBeCloseTo(1693.75, 2);
  });

  it('matches a hand calculation for a woman', () => {
    // 10*60 + 6.25*165 - 5*30 - 161 = 600 + 1031.25 - 150 - 161
    expect(bmr({ gender: 'female', age: 30, heightCm: 165, weightKg: 60 })).toBeCloseTo(1320.25, 2);
  });

  it('uses the midpoint for "prefer not to say"', () => {
    const p = { age: 30, heightCm: 170, weightKg: 65 };
    const mid = (bmr({ ...p, gender: 'male' }) + bmr({ ...p, gender: 'female' })) / 2;
    expect(bmr({ ...p, gender: 'unspecified' })).toBeCloseTo(mid, 5);
  });
});

describe('daily need', () => {
  it('uses the standard activity multipliers', () => {
    expect(activityFactor(1)).toBe(1.2);
    expect(activityFactor(3)).toBe(1.375);
    expect(activityFactor(4)).toBe(1.55);
    expect(activityFactor(6)).toBe(1.725);
  });

  it('is BMR times the activity factor', () => {
    expect(dailyNeed(base)).toBeCloseTo(1693.75 * 1.55, 2);
  });
});

describe('energy target (kept gentle on purpose)', () => {
  it('keeps maintenance for general fitness and endurance', () => {
    expect(energyTarget(base).change).toBe(0);
    expect(energyTarget({ ...base, goal: 'endurance' }).change).toBe(0);
  });

  it('cuts 15% for fat loss', () => {
    const t = energyTarget({ ...base, goal: 'fat-loss' });
    expect(t.kcal).toBeCloseTo(dailyNeed(base) * 0.85, 2);
  });

  it('never cuts more than 500 kcal', () => {
    const big: Profile = { ...base, goal: 'fat-loss', weightKg: 160, heightCm: 200, daysPerWeek: 6 };
    expect(energyTarget(big).change).toBeCloseTo(-500, 5);
  });

  it('never goes below BMR', () => {
    // Search a wide range of bodies: the target must always stay at or above BMR.
    for (const weightKg of [35, 50, 80, 120]) {
      for (const days of [1, 3, 5, 7]) {
        const p: Profile = { ...base, goal: 'fat-loss', gender: 'female', weightKg, daysPerWeek: days, age: 60 };
        expect(energyTarget(p).kcal).toBeGreaterThanOrEqual(bmr(p));
      }
    }
  });

  it('never suggests a deficit to someone under 18', () => {
    const teen = energyTarget({ ...base, goal: 'fat-loss', age: 16 });
    expect(teen.change).toBe(0);
    expect(teen.kcal).toBeCloseTo(dailyNeed({ ...base, age: 16 }), 5);
  });

  it('adds a small surplus for muscle', () => {
    const t = energyTarget({ ...base, goal: 'muscle' });
    expect(t.change).toBeCloseTo(dailyNeed(base) * 0.08, 2);
  });
});

describe('workout burn (MET method)', () => {
  it('is MET x kg x hours', () => {
    expect(kcalBurned(8, 70, 30)).toBeCloseTo(280, 5);
    // some experience = 5.0 MET, 70 kg, 20 minutes
    expect(workoutBurn(base)).toBeCloseTo(5 * 70 * (20 / 60), 5);
  });

  it('rounds to the nearest 10 for display', () => {
    expect(roundKcal(2137)).toBe(2140);
    expect(roundKcal(116.6)).toBe(120);
  });
});

describe('starting level', () => {
  it('follows experience', () => {
    expect(startLevel({ experience: 'new', age: 25 }, false)).toBe(1);
    expect(startLevel({ experience: 'some', age: 25 }, false)).toBe(2);
    expect(startLevel({ experience: 'experienced', age: 25 }, false)).toBe(3);
  });

  it('starts one step easier at 65+ or with a health flag, never below 1', () => {
    expect(startLevel({ experience: 'experienced', age: 70 }, false)).toBe(2);
    expect(startLevel({ experience: 'some', age: 30 }, true)).toBe(1);
    expect(startLevel({ experience: 'new', age: 80 }, true)).toBe(1);
  });
});

describe('profile validation', () => {
  it('accepts a complete profile', () => {
    expect(profileProblems(base)).toEqual([]);
    expect(isCompleteProfile(base)).toBe(true);
  });

  it('names the fields that are wrong', () => {
    const bad = { ...base, age: 7, weightKg: 900, goal: 'abs' as never };
    expect(profileProblems(bad)).toEqual(['age', 'weightKg', 'goal']);
  });

  it('rejects missing answers and unknown limits', () => {
    expect(isCompleteProfile({})).toBe(false);
    expect(isCompleteProfile(null)).toBe(false);
    expect(profileProblems({ ...base, limits: ['elbows' as never] })).toEqual(['limits']);
  });
});
