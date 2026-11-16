import { describe, expect, it } from 'vitest';
import { awardSet } from '../src/economy/award';
import { EXERCISES } from '../src/exercises/library';
import { BADGES, badgeStatuses, newBadges } from '../src/progress/badges';
import { activityCalendar, dailyTotals, formTrend, lifetime, weekSummary } from '../src/progress/stats';
import { newSave, type SaveData, type SetRecord } from '../src/state/save';
import { adoptPet } from '../src/world/actions';

// November 2026: the 16th is a Monday.
const day = (d: number, h = 9) => new Date(2026, 10, d, h);
const set = (d: number, exercise: string, reps: number, avgScore = 90): SetRecord => ({ at: day(d).toISOString(), exercise, variant: 'standard', reps, target: reps, avgScore, bestScore: avgScore, rejected: 0, durationMs: 30000 });

function sample(): SaveData {
  const s = newSave(day(1));
  s.history.push(set(9, 'squat', 20), set(10, 'pushup', 10), set(16, 'squat', 12), set(16, 'plank', 30), set(18, 'lunge', 8, 96), set(18, 'jack', 25, 80));
  s.sessions.push(
    { at: day(9).toISOString(), title: 'Legs', focus: 'legs', minutes: 18, sets: 9, reps: 20, kcal: 100 },
    { at: day(16).toISOString(), title: 'Full', focus: 'full', minutes: 21, sets: 9, reps: 12, kcal: 110 },
    { at: day(18).toISOString(), title: 'Legs', focus: 'legs', minutes: 19, sets: 9, reps: 33, kcal: 105 },
  );
  return s;
}

describe('daily totals', () => {
  it('gives one entry per day, oldest first, ending today', () => {
    const totals = dailyTotals(sample().history, 7, day(18, 20));
    expect(totals).toHaveLength(7);
    expect(totals[0]!.day).toBe('2026-11-12');
    expect(totals[6]).toMatchObject({ day: '2026-11-18', isToday: true, reps: 33, sets: 2, letter: 'W' });
  });

  it('counts plank sets but not plank seconds as reps', () => {
    const monday = dailyTotals(sample().history, 7, day(18)).find((t) => t.day === '2026-11-16')!;
    expect(monday).toMatchObject({ reps: 12, sets: 2, letter: 'M' });
  });

  it('shows empty days as zero', () => {
    expect(dailyTotals(sample().history, 7, day(18)).find((t) => t.day === '2026-11-17')!.reps).toBe(0);
    expect(dailyTotals([], 14, day(18)).every((t) => t.reps === 0)).toBe(true);
  });
});

describe('week summary', () => {
  it('separates this week from last week', () => {
    const { thisWeek, lastWeek } = weekSummary(sample(), day(18));
    expect(thisWeek).toMatchObject({ sessions: 2, sets: 4, reps: 45, minutes: 40 });
    expect(lastWeek).toMatchObject({ sessions: 1, sets: 2, reps: 30, minutes: 18 });
  });

  it('adds up points earned in the week, not points spent', () => {
    const s = sample();
    awardSet(s, EXERCISES.pushup, 2, { count: 10, avgScore: 100, variant: 'standard', endedBy: 'target' }, day(17));
    expect(weekSummary(s, day(18)).thisWeek.points).toBe(44); // 24 for the set + 20 first-workout bonus
    expect(weekSummary(s, day(18)).lastWeek.points).toBe(0);
  });
});

describe('form trend and calendar', () => {
  it('lists recent form scores in order', () => {
    expect(formTrend(sample().history, 3)).toEqual([30, 96, 80].map((_, i) => [90, 96, 80][i]));
    expect(formTrend([])).toEqual([]);
  });

  it('builds whole weeks starting on Monday', () => {
    const cal = activityCalendar(sample().history, 2, day(18));
    expect(cal).toHaveLength(14);
    expect(cal[0]!.day).toBe('2026-11-09');
    expect(cal.filter((c) => c.active).map((c) => c.day)).toEqual(['2026-11-09', '2026-11-10', '2026-11-16', '2026-11-18']);
    expect(cal.find((c) => c.isToday)!.day).toBe('2026-11-18');
    expect(cal.filter((c) => c.future)).toHaveLength(4); // Thursday to Sunday
  });
});

describe('lifetime totals', () => {
  it('adds everything up', () => {
    expect(lifetime(sample())).toEqual({ reps: 75, sets: 6, sessions: 3, minutes: 58, plankSeconds: 30, exercisesTried: 5, bestSetScore: 96, bestPlank: 30 });
  });

  it('ignores tiny sets when judging best form', () => {
    const s = newSave(day(1));
    s.history.push(set(2, 'squat', 2, 100), set(2, 'squat', 12, 88));
    expect(lifetime(s).bestSetScore).toBe(88);
  });
});

describe('badges', () => {
  it('has unique ids and sensible definitions', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    expect(BADGES.length).toBeGreaterThanOrEqual(15);
    for (const b of BADGES) expect(b.name.length * b.how.length).toBeGreaterThan(0);
  });

  it('a brand-new user has none', () => {
    expect(badgeStatuses(newSave(day(1))).filter((s) => s.unlocked)).toEqual([]);
  });

  it('unlocks from real history and reports progress for the rest', () => {
    const statuses = badgeStatuses(sample());
    const unlocked = statuses.filter((s) => s.unlocked).map((s) => s.badge.id);
    expect(unlocked).toEqual(['first-rep', 'session-1', 'clean-form']);
    const century = statuses.find((s) => s.badge.id === 'reps-100')!;
    expect(century).toMatchObject({ unlocked: false, have: 75, need: 100, progress: 0.75 });
  });

  it('announces each badge once', () => {
    const s = sample();
    expect(newBadges(s).map((b) => b.id)).toEqual(['first-rep', 'session-1', 'clean-form']);
    s.seenBadges.push('first-rep', 'session-1', 'clean-form');
    expect(newBadges(s)).toEqual([]);
    adoptPet(s, 'puddlo', 'Drip', day(18));
    expect(newBadges(s).map((b) => b.id)).toEqual(['companion']);
  });

  it('cannot be unlocked by editing the "seen" list', () => {
    const s = newSave(day(1));
    s.seenBadges.push('reps-2000', 'level-5');
    expect(badgeStatuses(s).filter((x) => x.unlocked)).toEqual([]);
  });

  it('uses the best streak, so a badge is not lost when a streak ends', () => {
    const s = newSave(day(1));
    s.streak = { count: 1, best: 9, lastDay: '2026-11-18', freezes: 0 };
    const ids = badgeStatuses(s).filter((x) => x.unlocked).map((x) => x.badge.id);
    expect(ids).toContain('streak-7');
    expect(ids).not.toContain('streak-30');
  });
});
