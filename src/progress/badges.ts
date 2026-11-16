// Achievements. Each badge is one line of data with a rule. Whether a badge
// is unlocked is always worked out from the real history, never stored, so
// a badge cannot be "given" by editing a flag.
import { lifetimeEarned } from '../economy/ledger';
import type { SaveData } from '../state/save';
import { playerLevel } from '../world/world';
import { lifetime, type Lifetime } from './stats';

export type Tier = 'bronze' | 'silver' | 'gold';

export interface Badge {
  id: string;
  name: string;
  how: string;
  tier: Tier;
  /** Which little picture is drawn on the medal. */
  art: 'rep' | 'flame' | 'calendar' | 'star' | 'leaf' | 'clock' | 'heart' | 'trophy';
  /** [how far, how far needed]. Unlocked when the first reaches the second. */
  measure(c: BadgeContext): [number, number];
}

export interface BadgeContext {
  life: Lifetime;
  bestStreak: number;
  level: number;
  harvests: number;
  hasPet: boolean;
  tookTest: boolean;
}

export function badgeContext(state: Readonly<SaveData>): BadgeContext {
  return {
    life: lifetime(state),
    bestStreak: Math.max(state.streak.best, state.streak.count),
    level: playerLevel(lifetimeEarned(state.ledger)),
    harvests: state.harvests,
    hasPet: state.pet !== null,
    tookTest: state.fitness !== null,
  };
}

const b = (id: string, name: string, how: string, tier: Tier, art: Badge['art'], measure: Badge['measure']): Badge => ({ id, name, how, tier, art, measure });

export const BADGES: Badge[] = [
  b('first-rep', 'First rep', 'Do your first camera-counted rep.', 'bronze', 'rep', (c) => [c.life.reps, 1]),
  b('reps-100', 'Century', '100 verified reps.', 'bronze', 'rep', (c) => [c.life.reps, 100]),
  b('reps-500', 'Five hundred', '500 verified reps.', 'silver', 'rep', (c) => [c.life.reps, 500]),
  b('reps-2000', 'Two thousand', '2,000 verified reps.', 'gold', 'rep', (c) => [c.life.reps, 2000]),
  b('session-1', 'Showed up', 'Finish your first session.', 'bronze', 'calendar', (c) => [c.life.sessions, 1]),
  b('session-10', 'Regular', 'Finish 10 sessions.', 'silver', 'calendar', (c) => [c.life.sessions, 10]),
  b('session-50', 'Habit formed', 'Finish 50 sessions.', 'gold', 'calendar', (c) => [c.life.sessions, 50]),
  b('streak-3', 'Three in a row', 'Train 3 days in a row.', 'bronze', 'flame', (c) => [c.bestStreak, 3]),
  b('streak-7', 'Full week', 'Train 7 days in a row.', 'silver', 'flame', (c) => [c.bestStreak, 7]),
  b('streak-30', 'Unstoppable', 'Train 30 days in a row.', 'gold', 'flame', (c) => [c.bestStreak, 30]),
  b('clean-form', 'Clean form', 'Average 95 or more for form on a set of 8 or more reps.', 'silver', 'star', (c) => [c.life.bestSetScore, 95]),
  b('all-rounder', 'All-rounder', 'Try 8 different exercises.', 'silver', 'star', (c) => [c.life.exercisesTried, 8]),
  b('plank-60', 'Steady as a rock', 'Hold a plank for 60 seconds in one set.', 'silver', 'clock', (c) => [c.life.bestPlank, 60]),
  b('tested', 'Know your level', 'Complete the fitness test.', 'bronze', 'trophy', (c) => [c.tookTest ? 1 : 0, 1]),
  b('companion', 'Companion', 'Adopt a pet.', 'bronze', 'heart', (c) => [c.hasPet ? 1 : 0, 1]),
  b('harvest-1', 'First harvest', 'Grow and harvest a plant.', 'bronze', 'leaf', (c) => [c.harvests, 1]),
  b('harvest-10', 'Green fingers', 'Harvest 10 plants.', 'silver', 'leaf', (c) => [c.harvests, 10]),
  b('level-5', 'Level five', 'Reach level 5.', 'gold', 'trophy', (c) => [c.level, 5]),
];

export interface BadgeStatus {
  badge: Badge;
  unlocked: boolean;
  /** 0 to 1. */
  progress: number;
  have: number;
  need: number;
}

export function badgeStatuses(state: Readonly<SaveData>): BadgeStatus[] {
  const ctx = badgeContext(state);
  return BADGES.map((badge) => {
    const [have, need] = badge.measure(ctx);
    return { badge, unlocked: have >= need, progress: Math.min(1, have / need), have: Math.min(have, need), need };
  });
}

/** Badges that are unlocked but have not been celebrated yet. */
export function newBadges(state: Readonly<SaveData>): Badge[] {
  return badgeStatuses(state)
    .filter((s) => s.unlocked && !state.seenBadges.includes(s.badge.id))
    .map((s) => s.badge);
}
