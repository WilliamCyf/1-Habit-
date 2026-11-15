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
    expect(s.settings).toEqual({ units: 'metric', theme: 'system', sound: true, voice: false });
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
    const result = loadSave(JSON.stringify({ version: 1 }), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(newSave(NOW));
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
      version: 1,
      settings: { units: 'furlongs', theme: 'neon', sound: 'loud' },
      draft: { limits: ['wrists', 'elbows'], age: 'old', weightKg: 70 },
    };
    const data = sanitise(odd, NOW);
    expect(data.settings).toEqual({ units: 'metric', theme: 'system', sound: true, voice: false });
    expect(data.draft).toEqual({ limits: ['wrists'], weightKg: 70 });
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
