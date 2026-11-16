// The pet and garden rules. Pure logic: every function takes "now" as an
// input instead of reading the clock, which makes it testable.
//
// KEY IDEA: no timers run in the background. The pet's needs are not ticked
// down every second. Instead we store WHEN the numbers were last correct,
// and work out how much time has passed whenever the app is opened. It is
// how a bank works out interest: from two dates, not by watching the clock.
import { CAN_CHARGES, ITEM, MOIST_HOURS, PLANTS, START_PLOTS, type Effect, type PlantId, type SpeciesId } from './catalog';

export interface Pet {
  species: SpeciesId;
  name: string;
  adoptedAt: string;
  /** Each need runs from 0 (empty) to 100 (full). */
  food: number;
  water: number;
  happy: number;
  energy: number;
  /** The moment the four numbers above were last correct. */
  at: string;
  /** When the pet last played with a toy. */
  playedAt: string | null;
}

export interface Plot {
  plant: PlantId | null;
  /** Watered until this moment (ISO text). Growth only happens while watered. */
  moistUntil: string | null;
  /** Watered growing time so far, in milliseconds. */
  grownMs: number;
  /** The moment grownMs was last correct. */
  at: string;
}

export const emptyPlot = (now: Date): Plot => ({ plant: null, moistUntil: null, grownMs: 0, at: now.toISOString() });
export const startingPlots = (now: Date): Plot[] => Array.from({ length: START_PLOTS }, () => emptyPlot(now));

// -------------------------------------------------------------------- pet

/** How fast each need fades, in points per hour. A full day drops food by 60. */
export const FADE_PER_HOUR = { food: 2.5, water: 3, happy: 1.5, energy: 1.2 } as const;
const HOUR = 3_600_000;
const clamp = (v: number) => Math.min(100, Math.max(0, v));

export function adopt(species: SpeciesId, name: string, now: Date): Pet {
  return { species, name: name.trim().slice(0, 14) || 'Buddy', adoptedAt: now.toISOString(), food: 80, water: 80, happy: 90, energy: 70, at: now.toISOString(), playedAt: null };
}

/**
 * Bring the pet's needs up to date. `decorCount` is how many decorations
 * are owned: each one makes happiness fade a little slower.
 */
export function fade(pet: Pet, now: Date, decorCount = 0): Pet {
  // Never count more than two weeks, and never go backwards if the clock changed.
  const hours = Math.min(24 * 14, Math.max(0, (now.getTime() - Date.parse(pet.at)) / HOUR));
  const happyRate = FADE_PER_HOUR.happy * Math.max(0.8, 1 - 0.05 * decorCount);
  return {
    ...pet,
    food: clamp(pet.food - FADE_PER_HOUR.food * hours),
    water: clamp(pet.water - FADE_PER_HOUR.water * hours),
    happy: clamp(pet.happy - happyRate * hours),
    energy: clamp(pet.energy - FADE_PER_HOUR.energy * hours),
    at: now.toISOString(),
  };
}

export function applyEffect(pet: Pet, effect: Effect): Pet {
  return {
    ...pet,
    food: clamp(pet.food + (effect.food ?? 0)),
    water: clamp(pet.water + (effect.water ?? 0)),
    happy: clamp(pet.happy + (effect.happy ?? 0)),
    energy: clamp(pet.energy + (effect.energy ?? 0)),
  };
}

export type Mood = 'happy' | 'okay' | 'sleepy' | 'sad';

/**
 * How the pet feels. Kind by design: the worst it gets is sleepy or sad.
 * It never gets ill and never dies, however long you are away.
 */
export function moodOf(pet: Pet): Mood {
  if (Math.min(pet.food, pet.water) < 20 || pet.happy < 20) return 'sad';
  if (pet.energy < 25) return 'sleepy';
  return (pet.food + pet.water + pet.happy + pet.energy) / 4 >= 60 ? 'happy' : 'okay';
}

/** What a finished workout does for the pet: a lift in spirits, energy, and a free snack. */
export const WORKOUT_BOOST: Effect = { happy: 30, energy: 40, food: 25, water: 25 };

/** The pet grows up as you train: baby, youngster, grown. */
export function stageFor(totalVerifiedReps: number): 1 | 2 | 3 {
  return totalVerifiedReps >= 1500 ? 3 : totalVerifiedReps >= 300 ? 2 : 1;
}

export const PLAY_COOLDOWN_HOURS = 3;

export function canPlay(pet: Pet, now: Date): boolean {
  return !pet.playedAt || now.getTime() - Date.parse(pet.playedAt) >= PLAY_COOLDOWN_HOURS * HOUR;
}

// ----------------------------------------------------------------- garden

/** Bring one plot's growth up to date: it only grows during watered time. */
export function grow(plot: Plot, now: Date): Plot {
  if (!plot.plant) return { ...plot, at: now.toISOString() };
  const from = Date.parse(plot.at);
  const to = now.getTime();
  const moistUntil = plot.moistUntil ? Date.parse(plot.moistUntil) : 0;
  const wateredMs = Math.max(0, Math.min(to, moistUntil) - from);
  const need = PLANTS[plot.plant].growHours * HOUR;
  return { ...plot, grownMs: Math.min(need, plot.grownMs + wateredMs), at: now.toISOString() };
}

/** 0 to 1: how grown the plant is. */
export function progress(plot: Plot): number {
  return plot.plant ? Math.min(1, plot.grownMs / (PLANTS[plot.plant].growHours * HOUR)) : 0;
}

/** 0 seed, 1 sprout, 2 growing, 3 nearly there, 4 ready to harvest. */
export function plantStage(plot: Plot): 0 | 1 | 2 | 3 | 4 {
  const p = progress(plot);
  return p >= 1 ? 4 : p >= 0.66 ? 3 : p >= 0.33 ? 2 : p > 0 ? 1 : 0;
}

export function isThirsty(plot: Plot, now: Date): boolean {
  return !!plot.plant && progress(plot) < 1 && (!plot.moistUntil || Date.parse(plot.moistUntil) <= now.getTime());
}

export function waterPlot(plot: Plot, now: Date): Plot {
  const grown = grow(plot, now);
  return { ...grown, moistUntil: new Date(now.getTime() + MOIST_HOURS * HOUR).toISOString() };
}

/** Hours of watered time still needed. */
export function hoursLeft(plot: Plot): number {
  return plot.plant ? Math.max(0, PLANTS[plot.plant].growHours - plot.grownMs / HOUR) : 0;
}

// ---------------------------------------------------- the player's level

/**
 * Level from every point ever earned. Each level needs more than the last:
 * level 2 at 120 points, 3 at 480, 4 at 1,080, 5 at 1,920 ...
 */
export function playerLevel(lifetimePoints: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, lifetimePoints) / 120));
}

export function pointsForLevel(level: number): number {
  return 120 * (level - 1) ** 2;
}

export { CAN_CHARGES, ITEM };
