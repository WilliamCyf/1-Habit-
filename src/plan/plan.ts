// The plan engine: the "coach's brain". Given who you are and how you have
// been doing, it decides what today's session contains.
//
// Pure logic: no screen, no storage. Same input, same plan, so it is easy
// to test. Coaching ideas used here:
//
//  - A weekly SPLIT: different sessions stress different areas, so each
//    area gets a rest while another works.
//  - PROGRESSIVE OVERLOAD: a little more each week, because the body only
//    adapts when asked for slightly more than last time.
//  - A DELOAD: every fourth week is lighter, so the body can catch up.
//  - AUTO-ADJUST: targets follow what you actually did, not a fixed script.
import { EXERCISES, type ExerciseDef, type ExerciseId, type Level } from '../exercises/library';
import type { Goal, Limit, Profile } from '../profile/profile';

export type DayFocus = 'full' | 'push' | 'legs' | 'core' | 'cardio';

export interface SetPlan {
  exercise: ExerciseId;
  level: Level;
  sets: number;
  /** Reps, or seconds for a hold. */
  target: number;
  restSec: number;
}

export interface TimedStep {
  name: string;
  how: string;
  seconds: number;
}

export interface SessionPlan {
  focus: DayFocus;
  title: string;
  /** 1 to 4. Week 4 is the lighter "deload" week. */
  week: number;
  deload: boolean;
  warmup: TimedStep[];
  blocks: SetPlan[];
  cooldown: TimedStep[];
  /** Estimated length and energy use. */
  minutes: number;
  kcal: number;
}

/** How one exercise is going for this user. */
export interface ExerciseProgress {
  level: Level;
  /** Each step is +5% on the target. Negative = made easier. */
  steps: number;
}

export type Progress = Partial<Record<ExerciseId, ExerciseProgress>>;

// ------------------------------------------------------------ weekly split

const SPLITS: Record<number, DayFocus[]> = {
  1: ['full'],
  2: ['full', 'full'],
  3: ['push', 'legs', 'full'],
  4: ['push', 'legs', 'core', 'full'],
  5: ['push', 'legs', 'core', 'cardio', 'full'],
  6: ['push', 'legs', 'core', 'push', 'legs', 'cardio'],
  7: ['push', 'legs', 'core', 'cardio', 'push', 'legs', 'full'],
};

export function weeklySplit(daysPerWeek: number): DayFocus[] {
  return SPLITS[Math.min(7, Math.max(1, Math.round(daysPerWeek)))]!;
}

export const FOCUS_TITLE: Record<DayFocus, string> = {
  full: 'Full body',
  push: 'Push and core',
  legs: 'Legs and glutes',
  core: 'Core and back',
  cardio: 'Cardio burn',
};

/**
 * Exercises for each kind of day, most important first. Bodyweight training
 * has no pulling moves (no bar, no weights), so every day includes mat-based
 * back and posture work: glute bridge, bird-dog or good morning.
 */
const POOLS: Record<DayFocus, ExerciseId[][]> = {
  // Full-body days alternate between two menus for variety.
  full: [
    ['squat', 'pushup', 'bridge', 'plank', 'jack', 'goodmorning'],
    ['lunge', 'pushup', 'birddog', 'situp', 'highknees', 'bridge'],
  ],
  push: [['pushup', 'plank', 'birddog', 'climber', 'burpee', 'situp']],
  legs: [['squat', 'bridge', 'lunge', 'goodmorning', 'highknees', 'jack']],
  core: [['plank', 'birddog', 'situp', 'bridge', 'climber', 'goodmorning']],
  cardio: [['jack', 'highknees', 'bridge', 'climber', 'burpee', 'squat']],
};

/** If an exercise loads an area the user protects, try these instead, in order. */
const SWAPS: Partial<Record<ExerciseId, ExerciseId[]>> = {
  squat: ['bridge', 'goodmorning', 'birddog'],
  lunge: ['bridge', 'goodmorning', 'birddog'],
  burpee: ['climber', 'jack', 'highknees', 'squat', 'bridge'],
  jack: ['highknees', 'climber', 'squat', 'bridge'],
  highknees: ['jack', 'climber', 'bridge', 'plank'],
  climber: ['highknees', 'jack', 'plank', 'situp'],
  situp: ['plank', 'birddog', 'bridge'],
  goodmorning: ['bridge', 'birddog', 'plank'],
  birddog: ['bridge', 'plank', 'goodmorning'],
};

const isSafe = (def: ExerciseDef, limits: readonly Limit[]) => !def.avoid.some((l) => limits.includes(l));

/** Replace an exercise that would load a protected area. Null if nothing suitable is left. */
export function swapForLimits(id: ExerciseId, limits: readonly Limit[], taken: readonly ExerciseId[]): ExerciseId | null {
  if (isSafe(EXERCISES[id], limits)) return taken.includes(id) ? null : id;
  for (const candidate of SWAPS[id] ?? []) {
    if (isSafe(EXERCISES[candidate], limits) && !taken.includes(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------- targets

/** More each week, then an easier fourth week. */
const WEEK_FACTOR = [1, 1.1, 1.2, 0.7];
const GOAL_REPS: Record<Goal, number> = { 'fat-loss': 1, muscle: 0.9, general: 1, endurance: 1.2 };
const GOAL_REST: Record<Goal, number> = { 'fat-loss': 30, muscle: 60, general: 45, endurance: 30 };

export function levelFor(id: ExerciseId, baseLevel: Level, progress: Progress, limits: readonly Limit[]): Level {
  let level = progress[id]?.level ?? baseLevel;
  // Push-ups stay in the plan for sore wrists or shoulders, but one version easier.
  if (id === 'pushup' && (limits.includes('wrists') || limits.includes('shoulders'))) level = Math.max(1, level - 1) as Level;
  return Math.min(3, Math.max(1, level)) as Level;
}

export function targetFor(id: ExerciseId, level: Level, steps: number, weekIndex: number, goal: Goal): number {
  const def = EXERCISES[id];
  const raw = def.base[level - 1]! * (1 + 0.05 * steps) * WEEK_FACTOR[weekIndex % 4]! * GOAL_REPS[goal];
  if (def.kind === 'hold') return Math.max(10, Math.round(raw / 5) * 5);
  return Math.max(3, Math.round(raw));
}

// ---------------------------------------------------------------- session

/** How many exercises and sets fit, by session length. */
function shape(minutes: number): { exercises: number; sets: number } {
  if (minutes <= 10) return { exercises: 3, sets: 2 };
  if (minutes <= 15) return { exercises: 4, sets: 2 };
  if (minutes <= 20) return { exercises: 4, sets: 3 };
  if (minutes <= 30) return { exercises: 5, sets: 3 };
  return { exercises: 6, sets: 4 };
}

const SETUP_SEC = 12; // getting into position and the 3-2-1 countdown

export function blockSeconds(b: SetPlan): number {
  const def = EXERCISES[b.exercise];
  const work = def.kind === 'hold' ? b.target : b.target * def.secPerRep;
  return b.sets * (work + SETUP_SEC) + (b.sets - 1) * b.restSec;
}

/**
 * Warm-up moves. Short sessions (15 minutes or less) get the three most
 * useful ones, so the warm-up does not eat half the workout.
 */
export function warmup(limits: readonly Limit[], short = false): TimedStep[] {
  const all = warmupAll(limits);
  return short ? all.slice(0, 3) : all;
}

function warmupAll(limits: readonly Limit[]): TimedStep[] {
  return [
    { name: 'March on the spot', how: 'Easy pace. Swing your arms.', seconds: 30 },
    { name: 'Arm circles', how: 'Big slow circles, forwards then backwards.', seconds: 30 },
    { name: 'Hip circles', how: 'Hands on hips, draw big circles.', seconds: 30 },
    limits.includes('knees')
      ? { name: 'Side bends', how: 'Slide one hand down your leg, then the other.', seconds: 30 }
      : { name: 'Easy half squats', how: 'Small and gentle, just to warm the legs.', seconds: 30 },
    limits.includes('wrists')
      ? { name: 'Torso twists', how: 'Turn gently side to side, arms loose.', seconds: 30 }
      : { name: 'Cat and cow', how: 'On hands and knees, round your back up, then let it sink.', seconds: 30 },
  ];
}

export function cooldown(limits: readonly Limit[], short = false): TimedStep[] {
  const all = cooldownAll(limits);
  return short ? [all[0]!, all[3]!] : all;
}

function cooldownAll(limits: readonly Limit[]): TimedStep[] {
  return [
    { name: 'Hamstring stretch', how: 'Sit with legs out and reach gently towards your toes.', seconds: 30 },
    { name: 'Chest opener', how: 'Clasp your hands behind you and lift your chest.', seconds: 30 },
    limits.includes('knees')
      ? { name: 'Full-body stretch', how: 'Lie on your back and reach long, fingers to toes.', seconds: 30 }
      : { name: 'Child’s pose', how: 'Kneel, sit back on your heels and reach your arms forward.', seconds: 30 },
    { name: 'Slow breathing', how: 'In for four, out for six. Let your heart rate settle.', seconds: 30 },
  ];
}

const isBackWork = (id: ExerciseId) => EXERCISES[id].focus.includes('back') || id === 'plank';

/**
 * Remove one exercise to save time, starting from the least important (the
 * end of the list), but never the session's only back and posture exercise.
 */
function dropOne(chosen: ExerciseId[]): void {
  for (let i = chosen.length - 1; i >= 0; i--) {
    const rest = chosen.filter((_id, j) => j !== i);
    if (rest.some(isBackWork)) {
      chosen.splice(i, 1);
      return;
    }
  }
  chosen.pop();
}

export interface PlanInput {
  profile: Profile;
  baseLevel: Level;
  progress: Progress;
  /** 0 to 3: which week of the four-week block. */
  weekIndex: number;
  /** Which session of this week (0 = first). */
  sessionIndex: number;
}

export function buildSession(input: PlanInput): SessionPlan {
  const { profile, baseLevel, progress } = input;
  const weekIndex = ((input.weekIndex % 4) + 4) % 4;
  const deload = weekIndex === 3;
  const split = weeklySplit(profile.daysPerWeek);
  const focus = split[input.sessionIndex % split.length]!;
  const menus = POOLS[focus];
  // Alternate menus across repeats of the same kind of day.
  const repeat = split.slice(0, (input.sessionIndex % split.length) + 1).filter((f) => f === focus).length - 1;
  const menu = menus[(repeat + weekIndex) % menus.length]!;

  const want = shape(profile.minutesPerSession);
  const sets = Math.max(2, deload ? want.sets - 1 : want.sets);
  const restSec = GOAL_REST[profile.goal];
  const chosen: ExerciseId[] = [];
  for (const id of menu) {
    if (chosen.length >= want.exercises) break;
    const pick = swapForLimits(id, profile.limits, chosen);
    if (pick) chosen.push(pick);
  }

  const makeBlocks = (setCount: number): SetPlan[] =>
    chosen.map((exercise) => {
      const level = levelFor(exercise, baseLevel, progress, profile.limits);
      return { exercise, level, sets: setCount, target: targetFor(exercise, level, progress[exercise]?.steps ?? 0, weekIndex, profile.goal), restSec };
    });

  const short = profile.minutesPerSession <= 15;
  const warm = warmup(profile.limits, short);
  const cool = cooldown(profile.limits, short);
  const fixedSec = [...warm, ...cool].reduce((sum, s) => sum + s.seconds, 0);
  const budgetSec = profile.minutesPerSession * 60;
  const total = (blocks: SetPlan[]) => fixedSec + blocks.reduce((sum, b) => sum + blockSeconds(b) + b.restSec, 0);

  // Fit the time available: drop a set, then drop the last exercise, until it fits.
  let blocks = makeBlocks(sets);
  let setCount = sets;
  while (total(blocks) > budgetSec * 1.15 && (setCount > 2 || blocks.length > 2)) {
    if (setCount > 2) setCount--;
    else dropOne(chosen);
    blocks = makeBlocks(setCount);
  }

  const seconds = total(blocks);
  return {
    focus,
    title: FOCUS_TITLE[focus],
    week: weekIndex + 1,
    deload,
    warmup: warm,
    blocks,
    cooldown: cool,
    minutes: Math.round(seconds / 60),
    kcal: Math.round(sessionKcal(blocks, warm, cool, profile.weightKg)),
  };
}

/** Energy estimate: MET x kg x hours for each part, with rests at a light 2 MET. */
export function sessionKcal(blocks: readonly SetPlan[], warm: readonly TimedStep[], cool: readonly TimedStep[], weightKg: number): number {
  let metSeconds = 0;
  for (const b of blocks) {
    const def = EXERCISES[b.exercise];
    const work = b.sets * (def.kind === 'hold' ? b.target : b.target * def.secPerRep);
    metSeconds += work * def.met + (b.sets * b.restSec + b.sets * SETUP_SEC) * 2;
  }
  metSeconds += warm.reduce((s, x) => s + x.seconds, 0) * 3.5 + cool.reduce((s, x) => s + x.seconds, 0) * 2.3;
  return (metSeconds / 3600) * weightKg;
}

// ------------------------------------------------------------ auto-adjust

export interface SetResult {
  count: number;
  target: number;
  avgScore: number;
}

/**
 * Update one exercise's difficulty from how its sets went.
 *  - Hit every target with decent form: one step harder next time.
 *  - Fell well short on any set: one step easier.
 *  - Six steps up earns the next version; three steps down drops back a version.
 */
export function adjust(current: ExerciseProgress, results: readonly SetResult[]): ExerciseProgress {
  if (results.length === 0) return current;
  let { level, steps } = current;
  const hitAll = results.every((r) => r.count >= r.target);
  const formOk = results.reduce((s, r) => s + r.avgScore, 0) / results.length >= 75;
  const struggled = results.some((r) => r.count < r.target * 0.6);
  if (hitAll && formOk) steps++;
  else if (struggled) steps--;
  if (steps >= 6 && level < 3) {
    level = (level + 1) as Level;
    steps = 0;
  } else if (steps <= -3 && level > 1) {
    level = (level - 1) as Level;
    steps = 2;
  }
  return { level, steps: Math.min(8, Math.max(-3, steps)) };
}

// ------------------------------------------------------------- calendar

/** Midnight at the start of the Monday of the week containing `d`. */
export function weekStart(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

/** Which week of the four-week block we are in (0 to 3), counting from the plan's first Monday. */
export function weekIndexOf(planStart: Date, now: Date): number {
  const weeks = Math.round((weekStart(now).getTime() - weekStart(planStart).getTime()) / (7 * 86_400_000));
  return ((weeks % 4) + 4) % 4;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// --------------------------------------------------------- fitness test

/**
 * Place the user from the starter test (most push-ups and squats in 60 s).
 * Knee push-ups count for a bit less, because they move less of your weight.
 */
export function levelFromTest(pushups: number, pushupsOnKnees: boolean, squats: number): Level {
  const pushScore = pushups * (pushupsOnKnees ? 0.6 : 1);
  if (pushScore >= 20 && squats >= 30) return 3;
  if (pushScore < 8 || squats < 15) return 1;
  return 2;
}
