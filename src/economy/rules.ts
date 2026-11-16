// The points rules: how verified exercise turns into points.
//
// The numbers here are tuned so that one normal planned session comfortably
// pays for a day of pet care with plenty left over. See the table in
// DECISIONS.md.
import type { ExerciseDef, Level } from '../exercises/library';

export const POINTS = {
  /** One push-up with average form is worth this many points. Everything scales from it. */
  perUnit: 2,
  /** Beginner, standard and advanced versions. */
  levelFactor: [0.8, 1, 1.25] as const,
  /** No more workout points than this per day, so grinding and overtraining are not rewarded. */
  dailyCap: 400,
  /** Bonus for the first verified set of the day. */
  dailyBonus: 20,
  /** Streak bonus: this much per day of streak beyond the first, up to the maximum. */
  streakStep: 5,
  streakMax: 25,
  /** Bonus for beating your best set of an exercise. */
  recordBonus: 15,
} as const;

/** Form multiplier: 0.7 for a form score of 50 or less, up to 1.2 for a perfect 100. */
export function formFactor(avgScore: number): number {
  return 0.7 + 0.5 * Math.min(1, Math.max(0, (avgScore - 50) / 50));
}

/**
 * Points for one set, before the daily cap:
 *
 *   reps (or seconds)  x  exercise difficulty  x  version factor  x  form factor  x  2
 */
export function setPoints(def: ExerciseDef, level: Level, count: number, avgScore: number, variant: string): number {
  if (count <= 0) return 0;
  // A knee push-up is paid as the beginner version, whatever the plan asked for.
  const actual: Level = def.id === 'pushup' && variant === 'knee' ? 1 : level;
  return Math.round(count * def.weight * POINTS.levelFactor[actual - 1]! * formFactor(avgScore) * POINTS.perUnit);
}
