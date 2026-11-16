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
import { verify, type LedgerEntry } from '../economy/ledger';
import { ITEM, MAX_PLOTS, PLANTS, SPECIES, type PlantId, type SpeciesId } from '../world/catalog';
import { startingPlots, type Pet, type Plot } from '../world/world';

export const SAVE_VERSION = 4;

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
export const MAX_HISTORY = 1500;

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
  /** Added in save version 4: points and the pet-and-garden world. */
  ledger: LedgerEntry[];
  /** True if the points record failed its check on loading and had to be cut back. */
  ledgerRepaired: boolean;
  streak: Streak;
  /** Best single set per exercise and version, e.g. "squat:standard" → 14. */
  records: Record<string, number>;
  pet: Pet | null;
  /** How many of each item the user holds. */
  inventory: Record<string, number>;
  /** Toys and decorations bought (each can be owned once). */
  owned: string[];
  plots: Plot[];
  /** Waterings left in the watering can. */
  can: number;
}

export interface Streak {
  /** Days in a row with a verified workout. */
  count: number;
  best: number;
  /** The last day that counted, as "2026-11-16". */
  lastDay: string | null;
  /** Saved-up "freezes": each one covers a missed day automatically. */
  freezes: number;
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
    ledger: [],
    ledgerRepaired: false,
    streak: { count: 0, best: 0, lastDay: null, freezes: 0 },
    records: {},
    pet: null,
    inventory: {},
    owned: [],
    plots: startingPlots(now),
    can: 3,
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
  // Version 4 added points and the pet-and-garden world. Sets done before
  // points existed are not back-paid: the ledger starts empty.
  3: (old) => ({ ...old, ledger: [], streak: { count: 0, best: 0, lastDay: null, freezes: 0 }, records: {}, pet: null, inventory: {}, owned: [], can: 3 }),
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

const pct = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback);

function sanitiseLedger(value: unknown): { ledger: LedgerEntry[]; repaired: boolean } {
  if (!Array.isArray(value)) return { ledger: [], repaired: false };
  const lines: LedgerEntry[] = [];
  for (const item of value) {
    if (
      !isObject(item) ||
      typeof item.n !== 'number' ||
      typeof item.at !== 'string' ||
      typeof item.kind !== 'string' ||
      typeof item.amount !== 'number' ||
      typeof item.note !== 'string' ||
      typeof item.ref !== 'string' ||
      typeof item.prev !== 'string' ||
      typeof item.hash !== 'string'
    ) {
      break;
    }
    lines.push({ n: item.n, at: item.at, kind: item.kind as LedgerEntry['kind'], amount: item.amount, note: item.note, ref: item.ref, prev: item.prev, hash: item.hash });
  }
  // Keep only the lines whose fingerprints check out. Anything after the
  // first bad line cannot be trusted, like pages after a torn one.
  const check = verify(lines);
  let good = lines.slice(0, check.validCount);
  // The balance must never be negative at any point.
  let running = 0;
  for (let i = 0; i < good.length; i++) {
    running += good[i]!.amount;
    if (running < 0) {
      good = good.slice(0, i);
      break;
    }
  }
  return { ledger: good, repaired: good.length !== value.length };
}

function sanitisePet(value: unknown, fallbackDate: string): Pet | null {
  if (!isObject(value) || typeof value.species !== 'string' || !(value.species in SPECIES)) return null;
  return {
    species: value.species as SpeciesId,
    name: asString(value.name, 'Buddy').slice(0, 14) || 'Buddy',
    adoptedAt: asIsoDate(value.adoptedAt, fallbackDate),
    food: pct(value.food, 60),
    water: pct(value.water, 60),
    happy: pct(value.happy, 60),
    energy: pct(value.energy, 60),
    at: asIsoDate(value.at, fallbackDate),
    playedAt: typeof value.playedAt === 'string' && !Number.isNaN(Date.parse(value.playedAt)) ? value.playedAt : null,
  };
}

function sanitisePlots(value: unknown, now: Date): Plot[] {
  const start = startingPlots(now);
  if (!Array.isArray(value)) return start;
  const plots: Plot[] = [];
  for (const item of value.slice(0, MAX_PLOTS)) {
    if (!isObject(item)) continue;
    const plant = typeof item.plant === 'string' && item.plant in PLANTS ? (item.plant as PlantId) : null;
    plots.push({
      plant,
      moistUntil: typeof item.moistUntil === 'string' && !Number.isNaN(Date.parse(item.moistUntil)) ? item.moistUntil : null,
      grownMs: typeof item.grownMs === 'number' && Number.isFinite(item.grownMs) ? Math.max(0, item.grownMs) : 0,
      at: asIsoDate(item.at, now.toISOString()),
    });
  }
  while (plots.length < start.length) plots.push(start[plots.length]!);
  return plots;
}

function sanitiseCounts(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(value)) return out;
  for (const [id, n] of Object.entries(value)) {
    if (id in ITEM && typeof n === 'number' && Number.isFinite(n) && n > 0) out[id] = Math.min(999, Math.floor(n));
  }
  return out;
}

function sanitiseStreak(value: unknown): Streak {
  const v = isObject(value) ? value : {};
  const whole = (x: unknown, max: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(0, Math.floor(x))) : 0);
  const count = whole(v.count, 100000);
  return {
    count,
    best: Math.max(count, whole(v.best, 100000)),
    lastDay: typeof v.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.lastDay) ? v.lastDay : null,
    freezes: whole(v.freezes, 2),
  };
}

function sanitiseRecords(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(value)) return out;
  for (const [key, n] of Object.entries(value).slice(0, 200)) {
    if (key.length <= 40 && typeof n === 'number' && Number.isFinite(n) && n > 0) out[key] = Math.min(10000, Math.floor(n));
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
  const book = sanitiseLedger(raw.ledger);
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
    ledger: book.ledger,
    ledgerRepaired: book.repaired || raw.ledgerRepaired === true,
    streak: sanitiseStreak(raw.streak),
    records: sanitiseRecords(raw.records),
    pet: sanitisePet(raw.pet, base.createdAt),
    inventory: sanitiseCounts(raw.inventory),
    owned: Array.isArray(raw.owned) ? [...new Set(raw.owned.filter((id): id is string => typeof id === 'string' && id in ITEM))] : [],
    plots: sanitisePlots(raw.plots, now),
    can: typeof raw.can === 'number' && Number.isFinite(raw.can) ? Math.min(60, Math.max(0, Math.floor(raw.can))) : 0,
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
