import { describe, expect, it } from 'vitest';
import { advanceStreak, awardSet, claimQuests, weeklyQuests } from '../src/economy/award';
import { balance, earnedOn, lifetimeEarned, verify } from '../src/economy/ledger';
import { POINTS, formFactor, setPoints } from '../src/economy/rules';
import { EXERCISES } from '../src/exercises/library';
import { buildSession, weeklySplit } from '../src/plan/plan';
import type { Profile } from '../src/profile/profile';
import { newSave, sanitise, serialise, loadSave, type SaveData } from '../src/state/save';
import { adoptPet, buy, harvest, levelOf, plant, play, refreshWorld, useItem, water } from '../src/world/actions';
import { ITEM, ITEMS, PLANTS } from '../src/world/catalog';
import { FADE_PER_HOUR, adopt, fade, grow, isThirsty, moodOf, plantStage, playerLevel, pointsForLevel, progress, stageFor, waterPlot, emptyPlot, type Plot } from '../src/world/world';

const day = (d: number, h = 9) => new Date(2026, 10, d, h, 0, 0); // November 2026; the 16th is a Monday
const fresh = (): SaveData => newSave(day(16));
const good = (count: number, score = 90, variant = 'standard') => ({ count, avgScore: score, variant, endedBy: 'target' });

const profile: Profile = { gender: 'male', age: 21, heightCm: 175, weightKg: 70, goal: 'general', experience: 'some', daysPerWeek: 4, minutesPerSession: 20, limits: [] };

describe('points for a set', () => {
  it('follows reps x difficulty x version x form x 2', () => {
    // 10 standard push-ups (difficulty 1) at form 100: 10 x 1 x 1 x 1.2 x 2 = 24
    expect(setPoints(EXERCISES.pushup, 2, 10, 100, 'standard')).toBe(24);
    // 12 squats (difficulty 0.7), form 80 (factor 1.0): 12 x 0.7 x 1 x 1.0 x 2 = 16.8 → 17
    expect(setPoints(EXERCISES.squat, 2, 12, 80, 'standard')).toBe(17);
    // A 30-second plank (0.25 per second), form 100: 30 x 0.25 x 1.2 x 2 = 18
    expect(setPoints(EXERCISES.plank, 2, 30, 100, 'standard')).toBe(18);
  });

  it('pays more for harder versions and better form', () => {
    const p = (level: 1 | 2 | 3, score: number) => setPoints(EXERCISES.squat, level, 20, score, 'x');
    expect(p(1, 90)).toBeLessThan(p(2, 90));
    expect(p(2, 90)).toBeLessThan(p(3, 90));
    expect(p(2, 60)).toBeLessThan(p(2, 95));
  });

  it('pays knee push-ups as the beginner version, whatever was planned', () => {
    expect(setPoints(EXERCISES.pushup, 3, 10, 90, 'knee')).toBe(setPoints(EXERCISES.pushup, 1, 10, 90, 'knee'));
  });

  it('keeps the form factor between 0.7 and 1.2', () => {
    expect(formFactor(0)).toBeCloseTo(0.7);
    expect(formFactor(50)).toBeCloseTo(0.7);
    expect(formFactor(75)).toBeCloseTo(0.95);
    expect(formFactor(100)).toBeCloseTo(1.2);
    expect(formFactor(500)).toBeCloseTo(1.2);
  });

  it('gives nothing for nothing', () => {
    expect(setPoints(EXERCISES.pushup, 2, 0, 100, 'standard')).toBe(0);
    expect(setPoints(EXERCISES.pushup, 2, -5, 100, 'standard')).toBe(0);
  });
});

describe('awarding a verified set', () => {
  it('adds the points and the first-workout bonus, and the ledger stays valid', () => {
    const s = fresh();
    const r = awardSet(s, EXERCISES.pushup, 2, good(10, 100), day(16));
    expect(r.points).toBe(24);
    expect(r.bonuses).toEqual([{ label: 'First workout today', amount: 20 }]);
    expect(r.total).toBe(44);
    expect(balance(s.ledger)).toBe(44);
    expect(verify(s.ledger).ok).toBe(true);
  });

  it('pays the daily bonus once a day only', () => {
    const s = fresh();
    awardSet(s, EXERCISES.pushup, 2, good(10), day(16, 9));
    const second = awardSet(s, EXERCISES.squat, 2, good(12), day(16, 10));
    expect(second.bonuses).toEqual([]);
    const tomorrow = awardSet(s, EXERCISES.squat, 2, good(12), day(17, 9));
    expect(tomorrow.bonuses.map((b) => b.label)).toEqual(['First workout today', '2-day streak']);
  });

  it('gives nothing for an empty set or a failed coach check-in', () => {
    const s = fresh();
    expect(awardSet(s, EXERCISES.pushup, 2, good(0), day(16)).total).toBe(0);
    expect(awardSet(s, EXERCISES.pushup, 2, { ...good(10), endedBy: 'checkin-failed' }, day(16)).total).toBe(0);
    expect(s.ledger).toHaveLength(0);
    expect(s.streak.count).toBe(0);
  });

  it('stops at the daily cap, so grinding is not rewarded', () => {
    const s = fresh();
    let capped = false;
    for (let i = 0; i < 60; i++) capped = awardSet(s, EXERCISES.burpee, 3, good(20, 100), day(16, 9)).capped || capped;
    expect(capped).toBe(true);
    expect(earnedOn(s.ledger, '2026-11-16')).toBe(POINTS.dailyCap);
    // The cap is per day: tomorrow earns again.
    expect(awardSet(s, EXERCISES.burpee, 3, good(5, 100), day(17, 9)).points).toBeGreaterThan(0);
    expect(verify(s.ledger).ok).toBe(true);
  });

  it('pays a record bonus when a best set is beaten, but not for the first ever set', () => {
    const s = fresh();
    expect(awardSet(s, EXERCISES.squat, 2, good(10), day(16)).newRecord).toBe(false);
    expect(awardSet(s, EXERCISES.squat, 2, good(10), day(16, 10)).newRecord).toBe(false);
    const better = awardSet(s, EXERCISES.squat, 2, good(13), day(16, 11));
    expect(better.newRecord).toBe(true);
    expect(better.bonuses).toContainEqual({ label: 'New record: Squat', amount: POINTS.recordBonus });
    expect(s.records['squat:standard']).toBe(13);
  });

  it('cheers the pet up after the first workout of the day', () => {
    const s = fresh();
    adoptPet(s, 'mossling', 'Fern', day(14));
    refreshWorld(s, day(16)); // two days alone: hungry and glum
    const before = { ...s.pet! };
    awardSet(s, EXERCISES.pushup, 2, good(8), day(16));
    expect(s.pet!.happy).toBeGreaterThan(before.happy + 20);
    expect(s.pet!.energy).toBeGreaterThan(before.energy + 30);
    expect(s.pet!.food).toBeGreaterThan(before.food);
  });
});

describe('streaks are forgiving', () => {
  it('counts days in a row', () => {
    const s = fresh();
    for (const d of [16, 17, 18]) advanceStreak(s, `2026-11-${d}`);
    expect(s.streak).toMatchObject({ count: 3, best: 3 });
  });

  it('does not count the same day twice', () => {
    const s = fresh();
    advanceStreak(s, '2026-11-16');
    expect(advanceStreak(s, '2026-11-16').counted).toBe(false);
    expect(s.streak.count).toBe(1);
  });

  it('earns a freeze after 7 days, and the freeze covers a missed day', () => {
    const s = fresh();
    for (let d = 1; d <= 7; d++) advanceStreak(s, `2026-11-0${d}`);
    expect(s.streak.freezes).toBe(1);
    // Miss the 8th, come back on the 9th.
    const back = advanceStreak(s, '2026-11-09');
    expect(back.usedFreeze).toBe(true);
    expect(s.streak).toMatchObject({ count: 8, freezes: 0 });
  });

  it('simply restarts at 1 after a longer break, keeping the best', () => {
    const s = fresh();
    for (const d of [10, 11, 12]) advanceStreak(s, `2026-11-${d}`);
    advanceStreak(s, '2026-11-20');
    expect(s.streak).toMatchObject({ count: 1, best: 3 });
  });

  it('never holds more than 2 freezes', () => {
    const s = fresh();
    const start = new Date(2026, 0, 1);
    for (let i = 0; i < 40; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      advanceStreak(s, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    expect(s.streak.count).toBe(40);
    expect(s.streak.freezes).toBe(2);
  });

  it('caps the streak bonus', () => {
    const s = fresh();
    s.streak = { count: 30, best: 30, lastDay: '2026-11-15', freezes: 0 };
    const r = awardSet(s, EXERCISES.pushup, 2, good(5), day(16));
    expect(r.bonuses).toContainEqual({ label: '31-day streak', amount: POINTS.streakMax });
  });
});

describe('weekly quests', () => {
  const withWeek = (): SaveData => {
    const s = fresh();
    for (const [d, ex, reps] of [[16, 'squat', 60], [17, 'pushup', 50], [18, 'lunge', 40], [19, 'bridge', 40]] as const) {
      s.history.push({ at: day(d).toISOString(), exercise: ex, variant: 'standard', reps, target: reps, avgScore: 90, bestScore: 95, rejected: 0, durationMs: 60000 });
      s.sessions.push({ at: day(d).toISOString(), title: 'x', focus: 'full', minutes: 20, sets: 9, reps, kcal: 100 });
    }
    return s;
  };

  it('tracks progress and completion', () => {
    const q = weeklyQuests(withWeek(), 4, day(20));
    expect(q.map((x) => [x.id, x.progress, x.goal, x.done])).toEqual([
      ['sessions', 4, 4, true],
      ['reps', 180, 180, true],
      ['variety', 4, 4, true],
    ]);
  });

  it('pays each quest exactly once', () => {
    const s = withWeek();
    expect(claimQuests(s, 4, day(20)).map((b) => b.amount)).toEqual([60, 40, 30]);
    expect(claimQuests(s, 4, day(20))).toEqual([]);
    expect(balance(s.ledger)).toBe(130);
    expect(weeklyQuests(s, 4, day(20)).every((q) => q.claimed)).toBe(true);
  });

  it('starts afresh on Monday', () => {
    const s = withWeek();
    claimQuests(s, 4, day(20));
    const next = weeklyQuests(s, 4, day(23)); // the following Monday
    expect(next.every((q) => q.progress === 0 && !q.claimed)).toBe(true);
  });

  it('does not count plank seconds as reps', () => {
    const s = fresh();
    s.history.push({ at: day(16).toISOString(), exercise: 'plank', variant: 'standard', reps: 500, target: 30, avgScore: 90, bestScore: 90, rejected: 0, durationMs: 1 });
    expect(weeklyQuests(s, 4, day(17))[1]!.progress).toBe(0);
  });
});

describe('the pet', () => {
  it('fades with real time, worked out from timestamps', () => {
    const pet = adopt('pebblit', 'Rocky', day(16, 8));
    const later = fade(pet, day(16, 18)); // 10 hours on
    expect(later.food).toBeCloseTo(80 - 10 * FADE_PER_HOUR.food);
    expect(later.water).toBeCloseTo(80 - 10 * FADE_PER_HOUR.water);
    // Asking again at the same moment changes nothing: no double counting.
    expect(fade(later, day(16, 18))).toEqual(later);
  });

  it('never goes below zero, never dies, and is only ever sad or sleepy at worst', () => {
    const pet = adopt('puddlo', 'Drip', day(1));
    const neglected = fade(pet, new Date(2027, 5, 1));
    expect(neglected.food).toBe(0);
    expect(neglected.happy).toBe(0);
    expect(['sad', 'sleepy']).toContain(moodOf(neglected));
  });

  it('recovers quickly: one workout and one meal bring a neglected pet back to okay', () => {
    const s = fresh();
    adoptPet(s, 'emberkit', 'Spark', day(1));
    refreshWorld(s, day(16));
    expect(moodOf(s.pet!)).toBe('sad');
    awardSet(s, EXERCISES.squat, 2, good(30), day(16));
    for (const id of ['hearty-bowl', 'fresh-water']) {
      expect(buy(s, id, day(16)).ok).toBe(true);
      expect(useItem(s, id, day(16)).ok).toBe(true);
    }
    expect(['okay', 'happy']).toContain(moodOf(s.pet!));
  });

  it('is not confused by a clock that jumps backwards', () => {
    const pet = adopt('mossling', 'Fern', day(16));
    expect(fade(pet, day(10)).food).toBe(80);
  });

  it('grows up with verified reps', () => {
    expect(stageFor(0)).toBe(1);
    expect(stageFor(299)).toBe(1);
    expect(stageFor(300)).toBe(2);
    expect(stageFor(1500)).toBe(3);
  });

  it('has a name limit and a fallback name', () => {
    expect(adopt('mossling', '   ', day(16)).name).toBe('Buddy');
    expect(adopt('mossling', 'A'.repeat(40), day(16)).name).toHaveLength(14);
  });
});

describe('the shop', () => {
  const rich = (points = 500): SaveData => {
    const s = fresh();
    adoptPet(s, 'mossling', 'Fern', day(16));
    // Earn honestly: several capped days of work.
    let d = 1;
    while (balance(s.ledger) < points) awardSet(s, EXERCISES.burpee, 3, good(20, 100), day(d++));
    return s;
  };

  it('takes the price from the balance and puts the item in the bag', () => {
    const s = rich();
    const before = balance(s.ledger);
    expect(buy(s, 'hearty-bowl', day(16)).ok).toBe(true);
    expect(balance(s.ledger)).toBe(before - 16);
    expect(s.inventory['hearty-bowl']).toBe(1);
    expect(verify(s.ledger).ok).toBe(true);
  });

  it('refuses when points are short, and the balance can never go negative', () => {
    const s = fresh();
    const r = buy(s, 'hearty-bowl', day(16));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('16 more points');
    expect(balance(s.ledger)).toBe(0);
  });

  it('locks items behind levels', () => {
    const s = fresh();
    awardSet(s, EXERCISES.burpee, 3, good(20, 100), day(16)); // some points, still level 1
    expect(levelOf(s)).toBe(1);
    expect(buy(s, 'pumpkin-seed', day(16)).message).toBe('Unlocks at level 3.');
  });

  it('sells toys and decorations only once', () => {
    const s = rich();
    expect(buy(s, 'ball', day(16)).ok).toBe(true);
    expect(buy(s, 'ball', day(16)).message).toBe('You already have this.');
  });

  it('never sells harvest items', () => {
    expect(buy(rich(), 'carrot', day(16)).ok).toBe(false);
  });

  it('sells garden plots in order, up to six', () => {
    const s = rich(3000);
    expect(buy(s, 'plot-4', day(16)).message).toBe('Buy the earlier plot first.');
    expect(buy(s, 'plot-3', day(16)).ok).toBe(true);
    expect(s.plots).toHaveLength(3);
  });

  it('refills the watering can with six waterings', () => {
    const s = rich();
    const before = s.can;
    buy(s, 'can-refill', day(16));
    expect(s.can).toBe(before + 6);
  });

  it('every priced item is reachable and sensibly priced', () => {
    for (const item of ITEMS) {
      if (item.kind === 'harvest') continue;
      expect(item.price).toBeGreaterThan(0);
      expect(item.minLevel).toBeGreaterThanOrEqual(1);
      expect(item.minLevel).toBeLessThanOrEqual(7);
    }
    for (const plant of Object.values(PLANTS)) expect(ITEM[plant.gives]?.effect).toBeDefined();
  });

  it('feeding uses up the item and will not waste food on a full pet', () => {
    const s = rich();
    refreshWorld(s, day(18));
    buy(s, 'hearty-bowl', day(18));
    buy(s, 'hearty-bowl', day(18));
    buy(s, 'hearty-bowl', day(18));
    expect(useItem(s, 'hearty-bowl', day(18)).ok).toBe(true);
    expect(useItem(s, 'hearty-bowl', day(18)).ok).toBe(true);
    expect(useItem(s, 'hearty-bowl', day(18)).message).toContain('is full');
    expect(s.inventory['hearty-bowl']).toBe(1);
    expect(useItem(s, 'crunchy-treat', day(18)).ok).toBe(false);
  });

  it('play needs a toy, then a rest between games', () => {
    const s = rich();
    expect(play(s, day(16, 10)).ok).toBe(false);
    buy(s, 'ball', day(16, 10));
    expect(play(s, day(16, 10)).ok).toBe(true);
    expect(play(s, day(16, 11)).ok).toBe(false);
    expect(play(s, day(16, 14)).ok).toBe(true);
  });
});

describe('the garden', () => {
  it('grows only while watered', () => {
    let plot: Plot = { ...emptyPlot(day(16, 8)), plant: 'carrot' };
    // A dry day: no growth at all.
    plot = grow(plot, day(17, 8));
    expect(progress(plot)).toBe(0);
    expect(isThirsty(plot, day(17, 8))).toBe(true);
    // Watered: grows for the next 12 hours, then stops.
    plot = waterPlot(plot, day(17, 8));
    expect(progress(grow(plot, day(17, 13)))).toBeCloseTo(0.5); // 5 of 10 hours
    const dayLater = grow(plot, day(18, 8));
    expect(progress(dayLater)).toBe(1); // 12 watered hours is more than the 10 needed
    expect(plantStage(dayLater)).toBe(4);
  });

  it('a slow plant needs several waterings', () => {
    let plot: Plot = { ...emptyPlot(day(1)), plant: 'pumpkin' };
    let waterings = 0;
    for (let d = 1; progress(plot) < 1 && d < 20; d++) {
      plot = waterPlot(grow(plot, day(d)), day(d));
      waterings++;
      plot = grow(plot, day(d + 1));
    }
    expect(waterings).toBe(4); // 40 hours at 12 per watering
  });

  it('plant, water and harvest through the real actions', () => {
    const s = fresh();
    awardSet(s, EXERCISES.burpee, 3, good(20, 100), day(16, 8));
    expect(buy(s, 'carrot-seed', day(16, 8)).ok).toBe(true);
    expect(plant(s, 0, 'carrot-seed', day(16, 8)).ok).toBe(true);
    expect(s.inventory['carrot-seed']).toBeUndefined();
    expect(harvest(s, 0, day(16, 9)).message).toBe('Not ready yet.');
    const canBefore = s.can;
    expect(water(s, 0, day(16, 8)).ok).toBe(true);
    expect(s.can).toBe(canBefore - 1);
    expect(water(s, 0, day(16, 9)).message).toBe('The soil is still wet.');
    refreshWorld(s, day(17, 8));
    expect(harvest(s, 0, day(17, 8)).ok).toBe(true);
    expect(s.inventory.carrot).toBe(2);
    expect(s.plots[0]!.plant).toBeNull();
  });

  it('watering needs water in the can', () => {
    const s = fresh();
    s.can = 0;
    s.inventory['carrot-seed'] = 1;
    plant(s, 0, 'carrot-seed', day(16));
    expect(water(s, 0, day(16)).message).toContain('watering can is empty');
  });

  it('cannot plant on an occupied plot or without seeds', () => {
    const s = fresh();
    expect(plant(s, 0, 'carrot-seed', day(16)).ok).toBe(false);
    s.inventory['carrot-seed'] = 2;
    plant(s, 0, 'carrot-seed', day(16));
    expect(plant(s, 0, 'carrot-seed', day(16)).message).toBe('Something is already growing here.');
    expect(plant(s, 9, 'carrot-seed', day(16)).ok).toBe(false);
  });
});

describe('levels', () => {
  it('needs more points for each new level', () => {
    expect(playerLevel(0)).toBe(1);
    expect(playerLevel(119)).toBe(1);
    expect(playerLevel(120)).toBe(2);
    expect(playerLevel(480)).toBe(3);
    for (let level = 1; level < 10; level++) expect(playerLevel(pointsForLevel(level))).toBe(level);
  });
});

describe('the economy is balanced (the promise in the brief)', () => {
  /** Points from one planned session done properly, with decent form. */
  function sessionIncome(p: Profile, sessionIndex: number, s: SaveData, when: Date): number {
    const plan = buildSession({ profile: p, baseLevel: 2, progress: {}, weekIndex: 0, sessionIndex });
    let total = 0;
    for (const b of plan.blocks) {
      for (let i = 0; i < b.sets; i++) total += awardSet(s, EXERCISES[b.exercise], b.level, good(b.target, 85), when).total;
    }
    return total;
  }

  // What a day of full pet care costs: the food and water that fade in 24 hours.
  const foodPerDay = (FADE_PER_HOUR.food * 24 * ITEM['hearty-bowl']!.price) / ITEM['hearty-bowl']!.effect!.food!;
  const waterPerDay = (FADE_PER_HOUR.water * 24 * ITEM['fresh-water']!.price) / ITEM['fresh-water']!.effect!.water!;
  const carePerDay = foodPerDay + waterPerDay;

  it('one day of pet care costs about 24 points', () => {
    expect(carePerDay).toBeGreaterThan(20);
    expect(carePerDay).toBeLessThan(28);
  });

  it('one normal 20-minute session covers several days of pet care', () => {
    const s = fresh();
    const income = sessionIncome(profile, 0, s, day(16));
    expect(income).toBeGreaterThan(carePerDay * 4);
    expect(income).toBeLessThan(POINTS.dailyCap + 60);
  });

  it.each([
    [2, 10],
    [3, 15],
    [4, 20],
    [5, 30],
    [6, 45],
  ])('%i days x %i minutes a week pays for a full week of pet care with points left to save', (days, minutes) => {
    const p = { ...profile, daysPerWeek: days, minutesPerSession: minutes };
    const s = fresh();
    let income = 0;
    weeklySplit(days).forEach((_f, i) => {
      income += sessionIncome(p, i, s, day(16 + i));
      s.sessions.push({ at: day(16 + i).toISOString(), title: 'x', focus: 'full', minutes, sets: 1, reps: 1, kcal: 1 });
    });
    const weekCare = carePerDay * 7;
    // Even the lightest plan (2 short sessions) covers the pet's whole week...
    expect(income, `income ${income} vs care ${weekCare.toFixed(0)}`).toBeGreaterThan(weekCare);
    // ...and a typical plan leaves a good share to save for the garden and toys.
    if (days >= 3) expect(income).toBeGreaterThan(weekCare * 1.5);
    expect(verify(s.ledger).ok).toBe(true);
  });

  it('survives saving and loading with the chain intact, and rejects an edited balance', () => {
    const s = fresh();
    sessionIncome(profile, 0, s, day(16));
    const text = serialise(s);
    const loaded = loadSave(text, day(16));
    expect(loaded.ok && balance(loaded.data.ledger)).toBe(balance(s.ledger));
    expect(loaded.ok && loaded.data.ledgerRepaired).toBe(false);

    // Someone opens the save file and gives themselves a fortune.
    const edited = JSON.parse(text);
    edited.ledger[1].amount = 999999;
    const tampered = sanitise(edited, day(16));
    expect(tampered.ledgerRepaired).toBe(true);
    expect(balance(tampered.ledger)).toBeLessThan(balance(s.ledger));
    expect(verify(tampered.ledger).ok).toBe(true);
    expect(lifetimeEarned(tampered.ledger)).toBeLessThan(1000);
  });
});
