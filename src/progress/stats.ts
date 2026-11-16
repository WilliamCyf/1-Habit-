// Turns the raw history into the numbers the Progress tab shows.
// Pure logic: no screen code, every function takes "now" as an input.
import { dayKey, type LedgerEntry } from '../economy/ledger';
import { weekStart } from '../plan/plan';
import type { SaveData, SetRecord } from '../state/save';

const DAY = 86_400_000;
/** Plank is measured in seconds, so it is kept out of "rep" totals. */
const isReps = (s: SetRecord) => s.exercise !== 'plank';

export interface DayTotal {
  /** "2026-11-16" */
  day: string;
  /** One letter for the chart axis: M T W T F S S. */
  letter: string;
  reps: number;
  sets: number;
  isToday: boolean;
}

/** Reps for each of the last `days` days, oldest first, ending today. */
export function dailyTotals(history: readonly SetRecord[], days: number, now: Date): DayTotal[] {
  const out: DayTotal[] = [];
  const index = new Map<string, DayTotal>();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY);
    // Noon avoids trouble on the two days a year when the clocks change.
    d.setHours(12);
    const total: DayTotal = { day: dayKey(d), letter: 'SMTWTFS'[d.getDay()]!, reps: 0, sets: 0, isToday: i === 0 };
    out.push(total);
    index.set(total.day, total);
  }
  for (const set of history) {
    const total = index.get(dayKey(new Date(set.at)));
    if (!total) continue;
    total.sets++;
    if (isReps(set)) total.reps += set.reps;
  }
  return out;
}

export interface WeekTotals {
  sessions: number;
  sets: number;
  reps: number;
  minutes: number;
  points: number;
}

function totalsBetween(state: Readonly<SaveData>, from: number, to: number): WeekTotals {
  const inRange = (at: string) => {
    const t = Date.parse(at);
    return t >= from && t < to;
  };
  const sets = state.history.filter((s) => inRange(s.at));
  const sessions = state.sessions.filter((s) => inRange(s.at));
  return {
    sessions: sessions.length,
    sets: sets.length,
    reps: sets.filter(isReps).reduce((n, s) => n + s.reps, 0),
    minutes: sessions.reduce((n, s) => n + s.minutes, 0),
    points: pointsBetween(state.ledger, from, to),
  };
}

function pointsBetween(ledger: readonly LedgerEntry[], from: number, to: number): number {
  let sum = 0;
  for (const e of ledger) {
    const t = Date.parse(e.at);
    if (t >= from && t < to && (e.kind === 'earn' || e.kind === 'bonus')) sum += e.amount;
  }
  return sum;
}

/** This week (since Monday) and the whole of last week, side by side. */
export function weekSummary(state: Readonly<SaveData>, now: Date): { thisWeek: WeekTotals; lastWeek: WeekTotals } {
  const monday = weekStart(now).getTime();
  return { thisWeek: totalsBetween(state, monday, monday + 7 * DAY), lastWeek: totalsBetween(state, monday - 7 * DAY, monday) };
}

/** Average form score of each of the most recent sets, oldest first. */
export function formTrend(history: readonly SetRecord[], count = 20): number[] {
  return history.filter((s) => s.reps > 0).slice(-count).map((s) => s.avgScore);
}

export interface CalendarDay {
  day: string;
  active: boolean;
  future: boolean;
  isToday: boolean;
}

/** A grid of whole weeks (Monday first) ending with the current week. */
export function activityCalendar(history: readonly SetRecord[], weeks: number, now: Date): CalendarDay[] {
  const active = new Set(history.map((s) => dayKey(new Date(s.at))));
  const today = dayKey(now);
  const first = weekStart(now).getTime() - (weeks - 1) * 7 * DAY;
  return Array.from({ length: weeks * 7 }, (_x, i) => {
    const d = new Date(first + i * DAY);
    d.setHours(12);
    const key = dayKey(d);
    return { day: key, active: active.has(key), future: key > today, isToday: key === today };
  });
}

export interface Lifetime {
  reps: number;
  sets: number;
  sessions: number;
  minutes: number;
  plankSeconds: number;
  exercisesTried: number;
  bestSetScore: number;
  bestPlank: number;
}

export function lifetime(state: Readonly<SaveData>): Lifetime {
  const h = state.history;
  return {
    reps: h.filter(isReps).reduce((n, s) => n + s.reps, 0),
    sets: h.length,
    sessions: state.sessions.length,
    minutes: state.sessions.reduce((n, s) => n + s.minutes, 0),
    plankSeconds: h.filter((s) => !isReps(s)).reduce((n, s) => n + s.reps, 0),
    exercisesTried: new Set(h.map((s) => s.exercise)).size,
    // Best average form on a set with real volume (a one-rep set does not count).
    bestSetScore: h.filter((s) => isReps(s) && s.reps >= 8).reduce((best, s) => Math.max(best, s.avgScore), 0),
    bestPlank: h.filter((s) => !isReps(s)).reduce((best, s) => Math.max(best, s.reps), 0),
  };
}
