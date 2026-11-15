// Calorie estimates. These are standard textbook formulas, and they are
// ESTIMATES: real people vary by 10% or more either way. Everything here is
// plain maths with no screen code, so it is easy to test.
import type { Experience, Gender, Goal, Profile } from './profile';

/**
 * BMR (basal metabolic rate): the energy your body burns in a day just
 * staying alive, as if you lay in bed all day. Like a car's fuel use while
 * idling. We use the Mifflin-St Jeor formula, the one dietitians most often
 * use today:
 *
 *   BMR = 10 x weight(kg) + 6.25 x height(cm) - 5 x age + offset
 *
 * The offset is +5 for men and -161 for women. For "prefer not to say" we
 * use the midpoint, -78.
 */
export function bmr(p: Pick<Profile, 'gender' | 'age' | 'heightCm' | 'weightKg'>): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + GENDER_OFFSET[p.gender];
}

const GENDER_OFFSET: Record<Gender, number> = { male: 5, female: -161, unspecified: -78 };

/**
 * Activity factor: how much more than "idling" you burn, based on how many
 * days a week you train. These are the usual published multipliers.
 */
export function activityFactor(daysPerWeek: number): number {
  if (daysPerWeek <= 1) return 1.2;
  if (daysPerWeek <= 3) return 1.375;
  if (daysPerWeek <= 5) return 1.55;
  return 1.725;
}

/** Daily energy need to stay the same weight: BMR x activity factor. */
export function dailyNeed(p: Pick<Profile, 'gender' | 'age' | 'heightCm' | 'weightKg' | 'daysPerWeek'>): number {
  return bmr(p) * activityFactor(p.daysPerWeek);
}

export interface EnergyTarget {
  kcal: number;
  /** Difference from the daily need. Negative means eating a little less. */
  change: number;
  note: string;
}

/**
 * A gentle daily target for the goal. Deliberately mild:
 *  - fat loss: 15% below need, never more than 500 kcal below, and never
 *    below BMR. No crash diets.
 *  - muscle: about 8% above need.
 *  - under 18: no deficit at all. Growing bodies should not diet from an app.
 */
export function energyTarget(p: Profile): EnergyTarget {
  const need = dailyNeed(p);
  if (p.goal === 'fat-loss') {
    if (p.age < 18) {
      return { kcal: need, change: 0, note: 'Under 18, we never suggest eating less. Moving more is enough.' };
    }
    const cut = Math.min(need * 0.15, 500);
    const kcal = Math.max(need - cut, bmr(p));
    return { kcal, change: kcal - need, note: 'A small, steady gap. No crash diets.' };
  }
  if (p.goal === 'muscle') {
    const kcal = need * 1.08;
    return { kcal, change: kcal - need, note: 'A little extra fuel, with enough protein, helps muscle grow.' };
  }
  return { kcal: need, change: 0, note: 'Eating about what you burn keeps your energy steady.' };
}

/**
 * MET (metabolic equivalent): how many times harder than resting an activity
 * is. Sitting still is 1 MET. These values come from the Compendium of
 * Physical Activities: light-to-moderate calisthenics is 3.8 and vigorous
 * calisthenics is 8.0. Sessions include rests, so the middle level sits between.
 */
export const SESSION_MET: Record<Experience, number> = { new: 3.8, some: 5.0, experienced: 6.5 };

/**
 * Energy burned in one activity:
 *
 *   kcal = MET x weight(kg) x hours
 */
export function kcalBurned(met: number, weightKg: number, minutes: number): number {
  return met * weightKg * (minutes / 60);
}

export function workoutBurn(p: Pick<Profile, 'experience' | 'weightKg' | 'minutesPerSession'>): number {
  return kcalBurned(SESSION_MET[p.experience], p.weightKg, p.minutesPerSession);
}

export type StartLevel = 1 | 2 | 3;

export const LEVEL_NAMES: Record<StartLevel, string> = { 1: 'Gentle start', 2: 'Steady', 3: 'Strong' };

/**
 * A first guess at difficulty, before the camera fitness test fine-tunes it.
 * Experience sets the base. We start one step easier for people aged 65+ or
 * anyone who answered "yes" on the health check, because starting too easy
 * costs a week, while starting too hard can cost an injury.
 */
export function startLevel(p: Pick<Profile, 'experience' | 'age'>, healthFlag: boolean): StartLevel {
  let level = p.experience === 'new' ? 1 : p.experience === 'some' ? 2 : 3;
  if (p.age >= 65 || healthFlag) level -= 1;
  return Math.max(1, level) as StartLevel;
}

/** Round to the nearest 10 for display: showing "2,137 kcal" would fake precision. */
export function roundKcal(kcal: number): number {
  return Math.round(kcal / 10) * 10;
}

export function goalBlurb(goal: Goal): string {
  switch (goal) {
    case 'fat-loss':
      return 'More total work, shorter rests, and full-body sessions.';
    case 'muscle':
      return 'Harder exercise versions, slower reps, and longer rests.';
    case 'endurance':
      return 'Higher reps, timed sets, and steady cardio moves.';
    default:
      return 'A balanced mix of strength, cardio and mobility.';
  }
}
