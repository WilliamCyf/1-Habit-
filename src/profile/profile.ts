// What the app knows about the user, and the rules for valid values.

export type Gender = 'male' | 'female' | 'unspecified';
export type Goal = 'fat-loss' | 'muscle' | 'general' | 'endurance';
export type Experience = 'new' | 'some' | 'experienced';
export type Limit = 'wrists' | 'knees' | 'back' | 'shoulders';

export interface Profile {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  experience: Experience;
  daysPerWeek: number;
  minutesPerSession: number;
  limits: Limit[];
}

export const GENDERS: readonly Gender[] = ['male', 'female', 'unspecified'];
export const GOALS: readonly Goal[] = ['fat-loss', 'muscle', 'general', 'endurance'];
export const EXPERIENCES: readonly Experience[] = ['new', 'some', 'experienced'];
export const LIMITS: readonly Limit[] = ['wrists', 'knees', 'back', 'shoulders'];
export const DAY_OPTIONS: readonly number[] = [2, 3, 4, 5, 6];
export const MINUTE_OPTIONS: readonly number[] = [10, 15, 20, 30, 45];

/** Sensible limits. Outside these a typo is far more likely than a real value. */
export const RANGE = {
  age: { min: 13, max: 100 },
  heightCm: { min: 120, max: 230 },
  weightKg: { min: 30, max: 250 },
} as const;

export const LABELS = {
  gender: { male: 'Male', female: 'Female', unspecified: 'Prefer not to say' },
  goal: {
    'fat-loss': 'Lose fat',
    muscle: 'Build muscle',
    general: 'General fitness',
    endurance: 'Endurance',
  },
  experience: { new: 'New to exercise', some: 'Some experience', experienced: 'Experienced' },
  limit: { wrists: 'Wrists', knees: 'Knees', back: 'Lower back', shoulders: 'Shoulders' },
} as const;

function inRange(value: unknown, range: { min: number; max: number }): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max;
}

function oneOf<T>(value: unknown, options: readonly T[]): value is T {
  return options.includes(value as T);
}

export type ProfileField = keyof Profile;

/** Returns the names of the fields that are missing or not valid. */
export function profileProblems(p: Partial<Profile>): ProfileField[] {
  const bad: ProfileField[] = [];
  if (!oneOf(p.gender, GENDERS)) bad.push('gender');
  if (!inRange(p.age, RANGE.age) || !Number.isInteger(p.age)) bad.push('age');
  if (!inRange(p.heightCm, RANGE.heightCm)) bad.push('heightCm');
  if (!inRange(p.weightKg, RANGE.weightKg)) bad.push('weightKg');
  if (!oneOf(p.goal, GOALS)) bad.push('goal');
  if (!oneOf(p.experience, EXPERIENCES)) bad.push('experience');
  if (!inRange(p.daysPerWeek, { min: 1, max: 7 }) || !Number.isInteger(p.daysPerWeek)) bad.push('daysPerWeek');
  if (!inRange(p.minutesPerSession, { min: 5, max: 90 })) bad.push('minutesPerSession');
  if (!Array.isArray(p.limits) || !p.limits.every((l) => oneOf(l, LIMITS))) bad.push('limits');
  return bad;
}

export function isCompleteProfile(p: Partial<Profile> | null | undefined): p is Profile {
  return !!p && profileProblems(p).length === 0;
}
