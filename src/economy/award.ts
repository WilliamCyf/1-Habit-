// THE ONE DOOR. This file is the only place in the app that creates points.
//
// It is called from exactly one spot: the end of a camera-verified set
// (ui/workout.ts), with the summary the set controller produced. There is no
// other function anywhere that adds an "earn" line to the ledger. Quest and
// streak bonuses are also paid here, because they can only become true as
// the result of verified sets.
import type { ExerciseDef, Level } from '../exercises/library';
import { weekStart } from '../plan/plan';
import type { SaveData } from '../state/save';
import { WORKOUT_BOOST, applyEffect, fade } from '../world/world';
import { append, compact, dayKey, earnedOn, hasRef } from './ledger';
import { POINTS, setPoints } from './rules';

export interface Bonus {
  label: string;
  amount: number;
}

export interface AwardResult {
  /** Points for the set itself, after the daily cap. */
  points: number;
  /** True if the daily cap reduced them. */
  capped: boolean;
  bonuses: Bonus[];
  /** Everything added to the balance by this set. */
  total: number;
  newRecord: boolean;
  streak: number;
  usedFreeze: boolean;
}

export interface VerifiedSet {
  count: number;
  avgScore: number;
  variant: string;
  /** How the set ended; a failed coach check-in earns nothing. */
  endedBy: string;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000);
}

/**
 * Update the streak for a workout today. Forgiving by design: a saved-up
 * "freeze" covers a missed day automatically, and a broken streak simply
 * starts again at 1 with no penalty.
 */
export function advanceStreak(state: SaveData, today: string): { counted: boolean; usedFreeze: boolean } {
  const s = state.streak;
  if (s.lastDay === today) return { counted: false, usedFreeze: false };
  let usedFreeze = false;
  if (s.lastDay === null) s.count = 1;
  else {
    const missed = daysBetween(s.lastDay, today) - 1;
    if (missed <= 0) s.count += 1;
    else if (missed <= s.freezes) {
      s.freezes -= missed;
      s.count += 1;
      usedFreeze = true;
    } else s.count = 1;
  }
  s.lastDay = today;
  s.best = Math.max(s.best, s.count);
  // Every 7 days in a row earns a freeze, up to 2 saved.
  if (s.count % 7 === 0) s.freezes = Math.min(2, s.freezes + 1);
  return { counted: true, usedFreeze };
}

export function awardSet(state: SaveData, def: ExerciseDef, level: Level, set: VerifiedSet, now: Date): AwardResult {
  const result: AwardResult = { points: 0, capped: false, bonuses: [], total: 0, newRecord: false, streak: state.streak.count, usedFreeze: false };
  if (set.count <= 0 || set.endedBy === 'checkin-failed') return result;

  const today = dayKey(now);
  const unit = def.kind === 'hold' ? 's' : set.count === 1 ? 'rep' : 'reps';

  // ---- the set itself, under the daily cap
  const raw = setPoints(def, level, set.count, set.avgScore, set.variant);
  const room = Math.max(0, POINTS.dailyCap - earnedOn(state.ledger, today));
  result.points = Math.min(raw, room);
  result.capped = result.points < raw;
  // A capped set still gets a line (worth 0), so streaks and records work.
  append(state.ledger, { kind: 'earn', amount: result.points, note: `${def.name}: ${set.count} ${unit}`, ref: `set:${def.id}:${set.variant}:${set.count}:${set.avgScore}`, at: now });

  const bonus = (label: string, amount: number, ref: string) => {
    if (amount <= 0 || hasRef(state.ledger, ref)) return;
    append(state.ledger, { kind: 'bonus', amount, note: label, ref, at: now });
    result.bonuses.push({ label, amount });
  };

  // ---- first workout of the day, and the streak
  const streak = advanceStreak(state, today);
  result.streak = state.streak.count;
  result.usedFreeze = streak.usedFreeze;
  if (streak.counted) {
    bonus('First workout today', POINTS.dailyBonus, `daily:${today}`);
    bonus(`${state.streak.count}-day streak`, Math.min(POINTS.streakMax, POINTS.streakStep * (state.streak.count - 1)), `streak:${today}`);
    // The pet perks up after your first workout of the day.
    if (state.pet) state.pet = applyEffect(fade(state.pet, now, state.owned.length), WORKOUT_BOOST);
  }

  // ---- personal record
  const key = `${def.id}:${set.variant}`;
  const previous = state.records[key] ?? 0;
  if (set.count > previous) {
    state.records[key] = set.count;
    // The very first set of an exercise is not a "record" to beat.
    if (previous > 0) {
      result.newRecord = true;
      bonus(`New record: ${def.name}`, POINTS.recordBonus, `record:${key}:${set.count}`);
    }
  }

  result.total = result.points + result.bonuses.reduce((sum, b) => sum + b.amount, 0);
  compact(state.ledger);
  return result;
}

// ------------------------------------------------------------ weekly quests

export interface Quest {
  id: string;
  title: string;
  progress: number;
  goal: number;
  reward: number;
  done: boolean;
  claimed: boolean;
}

/** Three gentle goals for the week. They reset every Monday. */
export function weeklyQuests(state: SaveData, daysPerWeek: number, now: Date): Quest[] {
  const monday = weekStart(now);
  const week = dayKey(monday);
  const since = monday.getTime();
  const sets = state.history.filter((h) => Date.parse(h.at) >= since);
  const sessions = state.sessions.filter((s) => Date.parse(s.at) >= since).length;
  const reps = sets.filter((h) => h.exercise !== 'plank').reduce((sum, h) => sum + h.reps, 0);
  const kinds = new Set(sets.map((h) => h.exercise)).size;
  const repGoal = Math.round((45 * daysPerWeek) / 10) * 10;
  const make = (id: string, title: string, progress: number, goal: number, reward: number): Quest => ({
    id,
    title,
    progress: Math.min(progress, goal),
    goal,
    reward,
    done: progress >= goal,
    claimed: hasRef(state.ledger, `quest:${week}:${id}`),
  });
  return [
    make('sessions', `Finish ${daysPerWeek} ${daysPerWeek === 1 ? 'session' : 'sessions'}`, sessions, daysPerWeek, 60),
    make('reps', `Do ${repGoal} verified reps`, reps, repGoal, 40),
    make('variety', 'Try 4 different exercises', kinds, 4, 30),
  ];
}

/** Pay out any quest that has just been completed. Each can only be paid once. */
export function claimQuests(state: SaveData, daysPerWeek: number, now: Date): Bonus[] {
  const week = dayKey(weekStart(now));
  const paid: Bonus[] = [];
  for (const q of weeklyQuests(state, daysPerWeek, now)) {
    if (!q.done || q.claimed) continue;
    append(state.ledger, { kind: 'bonus', amount: q.reward, note: `Quest: ${q.title}`, ref: `quest:${week}:${q.id}`, at: now });
    paid.push({ label: `Quest complete: ${q.title}`, amount: q.reward });
  }
  return paid;
}
