// The save file: everything Repling remembers about you.
//
// Three safety ideas live here:
//  1. VERSIONED: the save carries a version number. When the app's format
//     changes later, a "migration" upgrades old saves step by step, the way
//     you would convert an old spreadsheet layout to a new one.
//  2. SANITISED: we never trust a loaded save. Every field is checked and
//     repaired or reset, so a damaged or hand-edited file cannot crash the app.
//  3. PORTABLE: a backup is just this data wrapped in a small envelope.
//
// No screen or storage code in this file, so it can be tested on a computer.
import { isCompleteProfile, LIMITS, type Limit, type Profile } from '../profile/profile';
import type { UnitSystem } from '../profile/units';

export const SAVE_VERSION = 3;

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface HealthCheck {
  answeredAt: string;
  /** One true/false per question, in question order. true = "yes". */
  answers: boolean[];
  anyYes: boolean;
  /** The user read the advice and chose to continue. */
  acknowledged: boolean;
}

/** One finished set, kept for progress charts and personal records. */
export interface SetRecord {
  /** When the set ended (ISO date text). */
  at: string;
  exercise: string;
  variant: string;
  reps: number;
  target: number;
  /** Average and best form score, 0 to 100. */
  avgScore: number;
  bestScore: number;
  /** Movements that were not counted. */
  rejected: number;
  durationMs: number;
}

/** The result of the starter fitness test. */
export interface FitnessTest {
  at: string;
  pushups: number;
  pushupsOnKnees: boolean;
  squats: number;
  level: 1 | 2 | 3;
}

/** One finished workout session. */
export interface SessionRecord {
  at: string;
  title: string;
  focus: string;
  minutes: number;
  sets: number;
  /** Total verified reps (hold seconds are not included). */
  reps: number;
  kcal: number;
}

/** Keep the newest sets only, so the save can never grow without limit. */
export const MAX_HISTORY = 3000;

export interface Settings {
  units: UnitSystem;
  theme: ThemeChoice;
  sound: boolean;
  voice: boolean;
}

export interface SaveData {
  version: number;
  createdAt: string;
  updatedAt: string;
  onboardingDone: boolean;
  /** Which onboarding step to reopen on, if the app is closed half-way. */
  onboardingStep: number;
  health: HealthCheck | null;
  profile: Profile | null;
  /** Half-filled answers while onboarding is in progress. */
  draft: Partial<Profile>;
  settings: Settings;
  /** Every finished set, oldest first. Added in save version 2. */
  history: SetRecord[];
  /** Added in save version 3: the training plan's memory. */
  fitness: FitnessTest | null;
  /** Per exercise: which version the user is on, and how far the target has moved. */
  progress: Record<string, { level: 1 | 2 | 3; steps: number }>;
  /** When the four-week plan began (ISO date text). */
  planStart: string | null;
  sessions: SessionRecord[];
}

export function newSave(now: Date = new Date()): SaveData {
  const stamp = now.toISOString();
  return {
    version: SAVE_VERSION,
    createdAt: stamp,
    updatedAt: stamp,
    onboardingDone: false,
    onboardingStep: 0,
    health: null,
    profile: null,
    draft: {},
    settings: { units: 'metric', theme: 'system', sound: true, voice: true },
    history: [],
    fitness: null,
    progress: {},
    planStart: null,
    sessions: [],
  };
}

// ------------------------------------------------------------- migrations

type Loose = Record<string, unknown>;
/** migrations[n] upgrades a version n save to version n + 1. */
export type Migrations = Record<number, (old: Loose) => Loose>;

export const MIGRATIONS: Migrations = {
  // Version 2 added the workout history and made the voice coach the default,
  // because the phone is too far away to read during a set.
  1: (old) => ({
    ...old,
    history: [],
    settings: { ...(isObject(old.settings) ? old.settings : {}), voice: true },
  }),
  // Version 3 added the training plan: fitness test, per-exercise progress, sessions.
  2: (old) => ({ ...old, fitness: null, progress: {}, planStart: null, sessions: [] }),
};

export type LoadResult = { ok: true; data: SaveData } | { ok: false; reason: 'corrupt' | 'too-new' | 'no-path' };

function isObject(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Walk an old save up the version ladder, one rung at a time. */
export function upgrade(raw: unknown, migrations: Migrations, target: number): LoadResult | { ok: true; data: Loose } {
  if (!isObject(raw) || typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 0) {
    return { ok: false, reason: 'corrupt' };
  }
  if (raw.version > target) return { ok: false, reason: 'too-new' };
  let current: Loose = raw;
  while ((current.version as number) < target) {
    const from = current.version as number;
    const step = migrations[from];
    if (!step) return { ok: false, reason: 'no-path' };
    current = { ...step(current), version: from + 1 };
  }
  return { ok: true, data: current };
}

// --------------------------------------------------------------- sanitise

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length < 64 ? value : fallback;
}

function asIsoDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function sanitiseDraft(value: unknown): Partial<Profile> {
  if (!isObject(value)) return {};
  const out: Partial<Profile> = {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  out.gender = str(value.gender) as Profile['gender'] | undefined;
  out.age = num(value.age);
  out.heightCm = num(value.heightCm);
  out.weightKg = num(value.weightKg);
  out.goal = str(value.goal) as Profile['goal'] | undefined;
  out.experience = str(value.experience) as Profile['experience'] | undefined;
  out.daysPerWeek = num(value.daysPerWeek);
  out.minutesPerSession = num(value.minutesPerSession);
  if (Array.isArray(value.limits)) {
    out.limits = value.limits.filter((l): l is Limit => LIMITS.includes(l as Limit));
  }
  // Drop the keys that ended up undefined, to keep the save tidy.
  for (const key of Object.keys(out) as (keyof Profile)[]) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

function sanitiseHistory(value: unknown): SetRecord[] {
  if (!Array.isArray(value)) return [];
  const out: SetRecord[] = [];
  const whole = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0);
  for (const item of value.slice(-MAX_HISTORY)) {
    if (!isObject(item) || typeof item.at !== 'string' || Number.isNaN(Date.parse(item.at))) continue;
    out.push({
      at: item.at,
      exercise: asString(item.exercise, 'pushup'),
      variant: asString(item.variant, 'standard'),
      reps: whole(item.reps, 1000),
      target: whole(item.target, 1000),
      avgScore: whole(item.avgScore, 100),
      bestScore: whole(item.bestScore, 100),
      rejected: whole(item.rejected, 1000),
      durationMs: whole(item.durationMs, 3_600_000),
    });
  }
  return out;
}

const asLevel = (v: unknown): 1 | 2 | 3 => (v === 1 || v === 3 ? v : 2);

function sanitiseFitness(value: unknown): FitnessTest | null {
  if (!isObject(value) || typeof value.at !== 'string' || Number.isNaN(Date.parse(value.at))) return null;
  const whole = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(500, Math.max(0, Math.round(v))) : 0);
  return { at: value.at, pushups: whole(value.pushups), pushupsOnKnees: value.pushupsOnKnees === true, squats: whole(value.squats), level: asLevel(value.level) };
}

function sanitiseProgress(value: unknown): SaveData['progress'] {
  const out: SaveData['progress'] = {};
  if (!isObject(value)) return out;
  for (const [id, item] of Object.entries(value).slice(0, 60)) {
    if (!isObject(item) || id.length > 32) continue;
    const steps = typeof item.steps === 'number' && Number.isFinite(item.steps) ? Math.min(8, Math.max(-3, Math.round(item.steps))) : 0;
    out[id] = { level: asLevel(item.level), steps };
  }
  return out;
}

function sanitiseSessions(value: unknown): SessionRecord[] {
  if (!Array.isArray(value)) return [];
  const out: SessionRecord[] = [];
  const whole = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0);
  for (const item of value.slice(-MAX_HISTORY)) {
    if (!isObject(item) || typeof item.at !== 'string' || Number.isNaN(Date.parse(item.at))) continue;
    out.push({
      at: item.at,
      title: asString(item.title, 'Workout'),
      focus: asString(item.focus, 'full'),
      minutes: whole(item.minutes, 600),
      sets: whole(item.sets, 200),
      reps: whole(item.reps, 20000),
      kcal: whole(item.kcal, 5000),
    });
  }
  return out;
}

function sanitiseHealth(value: unknown, fallbackDate: string): HealthCheck | null {
  if (!isObject(value) || !Array.isArray(value.answers)) return null;
  const answers = value.answers.slice(0, 20).map((a) => a === true);
  return {
    answeredAt: asIsoDate(value.answeredAt, fallbackDate),
    answers,
    // Recompute instead of trusting the stored flag.
    anyYes: answers.some(Boolean),
    acknowledged: value.acknowledged === true,
  };
}

/** Rebuild a save from untrusted data, keeping whatever is valid. */
export function sanitise(raw: Loose, now: Date = new Date()): SaveData {
  const base = newSave(now);
  const settings = isObject(raw.settings) ? raw.settings : {};
  const draft = sanitiseDraft(raw.draft);
  const profileCandidate = sanitiseDraft(raw.profile);
  const profile = isCompleteProfile(profileCandidate) ? profileCandidate : null;
  const health = sanitiseHealth(raw.health, base.createdAt);
  const step = typeof raw.onboardingStep === 'number' && Number.isInteger(raw.onboardingStep) ? raw.onboardingStep : 0;
  return {
    version: SAVE_VERSION,
    createdAt: asIsoDate(raw.createdAt, base.createdAt),
    updatedAt: asIsoDate(raw.updatedAt, base.updatedAt),
    // "Done" only counts if the things onboarding collects really exist.
    onboardingDone: raw.onboardingDone === true && profile !== null && health !== null,
    onboardingStep: Math.max(0, Math.min(step, 50)),
    health,
    profile,
    draft: profile ? {} : draft,
    settings: {
      units: settings.units === 'imperial' ? 'imperial' : 'metric',
      theme: (['system', 'light', 'dark'] as const).find((t) => t === settings.theme) ?? 'system',
      sound: settings.sound !== false,
      voice: settings.voice !== false,
    },
    history: sanitiseHistory(raw.history),
    fitness: sanitiseFitness(raw.fitness),
    progress: sanitiseProgress(raw.progress),
    planStart: typeof raw.planStart === 'string' && !Number.isNaN(Date.parse(raw.planStart)) ? raw.planStart : null,
    sessions: sanitiseSessions(raw.sessions),
  };
}

/** Text from storage in, a safe SaveData out. */
export function loadSave(text: string, now: Date = new Date()): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  const upgraded = upgrade(raw, MIGRATIONS, SAVE_VERSION);
  if (!upgraded.ok) return upgraded;
  return { ok: true, data: sanitise(upgraded.data as Loose, now) };
}

export function serialise(data: SaveData): string {
  return JSON.stringify(data);
}

// ----------------------------------------------------------------- backup

const BACKUP_APP = 'repling';

export function makeBackup(data: SaveData, now: Date = new Date()): string {
  return JSON.stringify({ app: BACKUP_APP, kind: 'backup', exportedAt: now.toISOString(), save: data }, null, 2);
}

export type BackupResult =
  | { ok: true; data: SaveData; exportedAt: string }
  | { ok: false; reason: 'not-json' | 'not-repling' | 'corrupt' | 'too-new' | 'no-path' };

export function readBackup(text: string, now: Date = new Date()): BackupResult {
  // Refuse absurdly large files before parsing them.
  if (text.length > 5_000_000) return { ok: false, reason: 'corrupt' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP || raw.kind !== 'backup' || !isObject(raw.save)) {
    return { ok: false, reason: 'not-repling' };
  }
  const upgraded = upgrade(raw.save, MIGRATIONS, SAVE_VERSION);
  if (!upgraded.ok) return upgraded;
  return {
    ok: true,
    data: sanitise(upgraded.data as Loose, now),
    exportedAt: asString(raw.exportedAt, now.toISOString()),
  };
}

export const BACKUP_ERRORS: Record<Exclude<BackupResult, { ok: true }>['reason'], string> = {
  'not-json': 'That file is not a Repling backup.',
  'not-repling': 'That file is not a Repling backup.',
  corrupt: 'That backup file is damaged and cannot be read.',
  'too-new': 'That backup was made by a newer version of Repling. Update the app first.',
  'no-path': 'That backup is from a version this app can no longer read.',
};
