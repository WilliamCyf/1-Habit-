import { describe, expect, it } from 'vitest';
import type { Profile } from '../src/profile/profile';
import {
  SAVE_VERSION,
  loadSave,
  makeBackup,
  newSave,
  readBackup,
  sanitise,
  serialise,
  upgrade,
  type Migrations,
  type SaveData,
} from '../src/state/save';

const NOW = new Date('2026-11-15T10:00:00.000Z');

const profile: Profile = {
  gender: 'female',
  age: 28,
  heightCm: 165,
  weightKg: 60,
  goal: 'muscle',
  experience: 'new',
  daysPerWeek: 3,
  minutesPerSession: 20,
  limits: ['wrists'],
};

function finishedSave(): SaveData {
  return {
    ...newSave(NOW),
    onboardingDone: true,
    profile,
    health: { answeredAt: NOW.toISOString(), answers: [false, false, true], anyYes: true, acknowledged: true },
    settings: { units: 'imperial', theme: 'dark', sound: false, voice: true },
  };
}

describe('save round trip', () => {
  it('survives being written and read back', () => {
    const original = finishedSave();
    const result = loadSave(serialise(original), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(original);
  });

  it('starts fresh with sensible defaults', () => {
    const s = newSave(NOW);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.onboardingDone).toBe(false);
    expect(s.settings).toEqual({ units: 'metric', theme: 'system', sound: true, voice: true });
    expect(s.history).toEqual([]);
  });
});

describe('damaged or edited saves', () => {
  it('reports rubbish as corrupt instead of crashing', () => {
    expect(loadSave('not json at all', NOW)).toEqual({ ok: false, reason: 'corrupt' });
    expect(loadSave('[1,2,3]', NOW)).toEqual({ ok: false, reason: 'corrupt' });
    expect(loadSave('{"version":"one"}', NOW)).toEqual({ ok: false, reason: 'corrupt' });
    expect(loadSave('null', NOW)).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('refuses a save from a newer app version', () => {
    expect(loadSave(JSON.stringify({ version: SAVE_VERSION + 1 }), NOW)).toEqual({ ok: false, reason: 'too-new' });
  });

  it('repairs missing sections with defaults', () => {
    const result = loadSave(JSON.stringify({ version: 4 }), NOW);
    expect(result.ok).toBe(true);
    // A bare save gets every default, except free starting water (that is only for new players).
    if (result.ok) expect(result.data).toEqual({ ...newSave(NOW), can: 0 });
  });

  it('drops an invalid profile and un-finishes onboarding', () => {
    const broken = { ...finishedSave(), profile: { ...profile, age: -5 } };
    const data = sanitise(broken as unknown as Record<string, unknown>, NOW);
    expect(data.profile).toBeNull();
    expect(data.onboardingDone).toBe(false);
  });

  it('cannot be marked "done" without a health check', () => {
    const broken = { ...finishedSave(), health: null };
    expect(sanitise(broken as unknown as Record<string, unknown>, NOW).onboardingDone).toBe(false);
  });

  it('recomputes the health flag rather than trusting it', () => {
    const edited = { ...finishedSave(), health: { answers: [false, true], anyYes: false, acknowledged: true } };
    const data = sanitise(edited as unknown as Record<string, unknown>, NOW);
    expect(data.health?.anyYes).toBe(true);
  });

  it('ignores unknown settings and strips unknown limits', () => {
    const odd = {
      version: 4,
      settings: { units: 'furlongs', theme: 'neon', sound: 'loud' },
      draft: { limits: ['wrists', 'elbows'], age: 'old', weightKg: 70 },
    };
    const data = sanitise(odd, NOW);
    expect(data.settings).toEqual({ units: 'metric', theme: 'system', sound: true, voice: true });
    expect(data.draft).toEqual({ limits: ['wrists'], weightKg: 70 });
  });
});

describe('real upgrade: version 1 to version 2', () => {
  it('keeps the profile, adds an empty history, and switches the voice coach on', () => {
    const v1 = {
      version: 1,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      onboardingDone: true,
      onboardingStep: 0,
      health: { answeredAt: NOW.toISOString(), answers: [false], anyYes: false, acknowledged: true },
      profile,
      draft: {},
      settings: { units: 'imperial', theme: 'dark', sound: false, voice: false },
    };
    const result = loadSave(JSON.stringify(v1), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.version).toBe(4);
    expect(result.data.progress).toEqual({});
    expect(result.data.fitness).toBeNull();
    expect(result.data.sessions).toEqual([]);
    expect(result.data.profile).toEqual(profile);
    expect(result.data.onboardingDone).toBe(true);
    expect(result.data.history).toEqual([]);
    expect(result.data.settings).toEqual({ units: 'imperial', theme: 'dark', sound: false, voice: true });
  });
});

describe('workout history', () => {
  const set = { at: NOW.toISOString(), exercise: 'pushup', variant: 'standard', reps: 8, target: 8, avgScore: 88, bestScore: 96, rejected: 1, durationMs: 21000 };

  it('survives a round trip', () => {
    const save = { ...finishedSave(), history: [set] };
    const result = loadSave(serialise(save), NOW);
    expect(result.ok && result.data.history).toEqual([set]);
  });

  it('drops broken entries and clamps silly numbers', () => {
    const save = {
      ...finishedSave(),
      history: [set, { at: 'not a date', reps: 5 }, 'junk', { ...set, reps: 9_999_999, avgScore: 250, rejected: -4 }],
    };
    const data = sanitise(save as unknown as Record<string, unknown>, NOW);
    expect(data.history).toHaveLength(2);
    expect(data.history[1]).toMatchObject({ reps: 1000, avgScore: 100, rejected: 0 });
  });

  it('keeps only the newest entries when the list is huge', () => {
    const many = Array.from({ length: 1700 }, (_, i) => ({ ...set, reps: i % 50 }));
    const data = sanitise({ ...finishedSave(), history: many } as unknown as Record<string, unknown>, NOW);
    expect(data.history).toHaveLength(1500);
  });
});

describe('training plan data (version 3)', () => {
  it('survives a round trip', () => {
    const save: SaveData = {
      ...finishedSave(),
      fitness: { at: NOW.toISOString(), pushups: 14, pushupsOnKnees: false, squats: 26, level: 2 },
      progress: { squat: { level: 2, steps: 3 }, pushup: { level: 1, steps: -1 } },
      planStart: NOW.toISOString(),
      sessions: [{ at: NOW.toISOString(), title: 'Legs and glutes', focus: 'legs', minutes: 19, sets: 12, reps: 96, kcal: 110 }],
    };
    const result = loadSave(serialise(save), NOW);
    expect(result.ok && result.data).toEqual(save);
  });

  it('repairs edited values instead of trusting them', () => {
    const edited = {
      ...finishedSave(),
      fitness: { at: NOW.toISOString(), pushups: 99999, squats: -5, level: 9 },
      progress: { squat: { level: 7, steps: 500 }, junk: 'x' },
      planStart: 'yesterday-ish',
      sessions: [{ at: NOW.toISOString(), reps: 1e12, kcal: -3 }, null],
    };
    const data = sanitise(edited as unknown as Record<string, unknown>, NOW);
    expect(data.fitness).toMatchObject({ pushups: 500, squats: 0, level: 2 });
    expect(data.progress).toEqual({ squat: { level: 2, steps: 8 } });
    expect(data.planStart).toBeNull();
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0]).toMatchObject({ reps: 20000, kcal: 0, title: 'Workout' });
  });

  it('upgrades a version 2 save without losing the set history', () => {
    const v2 = { ...finishedSave(), version: 2, history: [{ at: NOW.toISOString(), exercise: 'pushup', variant: 'standard', reps: 8, target: 8, avgScore: 90, bestScore: 96, rejected: 0, durationMs: 20000 }] } as Record<string, unknown>;
    delete v2.fitness;
    delete v2.progress;
    delete v2.planStart;
    delete v2.sessions;
    const result = loadSave(JSON.stringify(v2), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.version).toBe(4);
      expect(result.data.history).toHaveLength(1);
      expect(result.data.ledger).toEqual([]);
      expect(result.data.pet).toBeNull();
      expect(result.data.plots).toHaveLength(2);
      expect(result.data.progress).toEqual({});
    }
  });
});

describe('migrations', () => {
  // A pretend history: v0 stored weight in pounds, v1 renamed a field.
  const migrations: Migrations = {
    0: (old) => ({ ...old, weightKg: (old.weightLb as number) * 0.45359237, weightLb: undefined }),
    1: (old) => ({ ...old, nickname: old.name, name: undefined }),
  };

  it('upgrades step by step through every version', () => {
    const result = upgrade({ version: 0, weightLb: 100, name: 'Sam' }, migrations, 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as Record<string, unknown>;
      expect(data.version).toBe(2);
      expect(data.weightKg).toBeCloseTo(45.36, 2);
      expect(data.nickname).toBe('Sam');
    }
  });

  it('leaves a current save untouched', () => {
    const result = upgrade({ version: 2, nickname: 'Sam' }, migrations, 2);
    expect(result).toEqual({ ok: true, data: { version: 2, nickname: 'Sam' } });
  });

  it('fails cleanly when an upgrade step is missing', () => {
    expect(upgrade({ version: 0 }, { 1: (o) => o }, 2)).toEqual({ ok: false, reason: 'no-path' });
  });
});

describe('backup', () => {
  it('exports and imports the same data', () => {
    const original = finishedSave();
    const result = readBackup(makeBackup(original, NOW), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(original);
      expect(result.exportedAt).toBe(NOW.toISOString());
    }
  });

  it('rejects files that are not Repling backups', () => {
    expect(readBackup('hello', NOW)).toEqual({ ok: false, reason: 'not-json' });
    expect(readBackup('{"app":"other","kind":"backup","save":{}}', NOW)).toEqual({ ok: false, reason: 'not-repling' });
    expect(readBackup(JSON.stringify(finishedSave()), NOW)).toEqual({ ok: false, reason: 'not-repling' });
  });

  it('rejects a backup from a newer version', () => {
    const text = JSON.stringify({ app: 'repling', kind: 'backup', save: { version: 99 } });
    expect(readBackup(text, NOW)).toEqual({ ok: false, reason: 'too-new' });
  });

  it('sanitises imported data like any other save', () => {
    const text = JSON.stringify({
      app: 'repling',
      kind: 'backup',
      save: { ...finishedSave(), profile: { ...profile, heightCm: 9999 } },
    });
    const result = readBackup(text, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.profile).toBeNull();
  });
});
