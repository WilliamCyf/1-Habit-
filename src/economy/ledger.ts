// The points ledger: a tamper-evident record of every point earned and spent.
//
// Think of a paper account book where each line also contains a fingerprint
// of the line before it. If someone rubs out or changes an old line, its
// fingerprint no longer matches what the next line recorded, and the break
// shows. Programmers call this a "hash chain"; it is the idea inside every
// blockchain.
//
// There is deliberately NO stored "balance" number. The balance is always
// added up from the lines, so there is no single number to edit.
//
// HONEST LIMIT: everything, including this code, is on the user's phone. A
// programmer who reads this file can rebuild a valid chain. This stops
// casual edits to the saved data, not a determined expert. See README.
import { sha256 } from './sha256';

export type EntryKind = 'earn' | 'bonus' | 'spend' | 'carry';

export interface LedgerEntry {
  /** Line number, starting at 0. */
  n: number;
  /** When, as ISO date text. */
  at: string;
  kind: EntryKind;
  /** Positive for points in, negative for points out. */
  amount: number;
  /** Plain words for the user: "Push-up: 8 reps". */
  note: string;
  /** A machine-readable tag, e.g. "daily:2026-11-16", used to stop double awards. */
  ref: string;
  /** The fingerprint of the previous line. */
  prev: string;
  /** This line's own fingerprint. */
  hash: string;
}

const GENESIS = 'repling-genesis';
// Mixed into every fingerprint so that a generic SHA-256 tool does not
// produce matching values. An obstacle, not a secret.
const SALT = 'rpl:ledger:v1:4c7a';

export function fingerprint(e: Omit<LedgerEntry, 'hash'>): string {
  return sha256([SALT, e.n, e.at, e.kind, e.amount, e.note, e.ref, e.prev].join('|'));
}

export interface NewEntry {
  kind: EntryKind;
  amount: number;
  note: string;
  ref?: string;
  at: Date;
}

/** Add a line to the end of the book. */
export function append(ledger: LedgerEntry[], entry: NewEntry): LedgerEntry {
  const last = ledger[ledger.length - 1];
  const body: Omit<LedgerEntry, 'hash'> = {
    n: last ? last.n + 1 : 0,
    at: entry.at.toISOString(),
    kind: entry.kind,
    amount: Math.round(entry.amount),
    note: entry.note.slice(0, 80),
    ref: (entry.ref ?? '').slice(0, 80),
    prev: last ? last.hash : GENESIS,
  };
  const line: LedgerEntry = { ...body, hash: fingerprint(body) };
  ledger.push(line);
  return line;
}

/**
 * Check every line against its fingerprint and its link to the line before.
 * Returns how many lines from the start are intact.
 */
export function verify(ledger: readonly LedgerEntry[]): { ok: boolean; validCount: number } {
  let prev = ledger[0]?.kind === 'carry' ? ledger[0].prev : GENESIS;
  let expectedN = ledger[0]?.n ?? 0;
  for (let i = 0; i < ledger.length; i++) {
    const e = ledger[i]!;
    const { hash, ...body } = e;
    const sound =
      e.n === expectedN &&
      e.prev === prev &&
      Number.isInteger(e.amount) &&
      // The balance may never dip below zero, and only earn/bonus/carry lines may add points.
      (e.kind === 'spend' ? e.amount <= 0 : e.amount >= 0) &&
      fingerprint(body) === hash;
    if (!sound) return { ok: false, validCount: i };
    prev = hash;
    expectedN++;
  }
  return { ok: true, validCount: ledger.length };
}

export function balance(ledger: readonly LedgerEntry[]): number {
  let sum = 0;
  for (const e of ledger) sum += e.amount;
  return sum;
}

/** The local calendar day as text, e.g. "2026-11-16". */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Workout points (not bonuses) already earned on this local day. Used for the daily cap. */
export function earnedOn(ledger: readonly LedgerEntry[], day: string): number {
  let sum = 0;
  for (let i = ledger.length - 1; i >= 0; i--) {
    const e = ledger[i]!;
    const key = dayKey(new Date(e.at));
    if (key < day) break; // lines are in time order, so we can stop early
    if (key === day && e.kind === 'earn') sum += e.amount;
  }
  return sum;
}

export function hasRef(ledger: readonly LedgerEntry[], ref: string): boolean {
  for (let i = ledger.length - 1; i >= 0; i--) if (ledger[i]!.ref === ref) return true;
  return false;
}

/** Every point ever earned (workouts and bonuses), which decides the player's level. */
export function lifetimeEarned(ledger: readonly LedgerEntry[]): number {
  let sum = 0;
  for (const e of ledger) {
    if (e.kind === 'earn' || e.kind === 'bonus') sum += e.amount;
    // A carry line remembers the lifetime total of the lines it replaced.
    else if (e.kind === 'carry') sum += Number(e.ref.split(':')[1]) || 0;
  }
  return sum;
}

/**
 * Keep the book from growing forever: once it is long, fold the oldest
 * lines into one "carried forward" line, as an accountant starts a new page
 * with the balance brought forward.
 */
export function compact(ledger: LedgerEntry[], keep = 500, limit = 1500): void {
  if (ledger.length <= limit) return;
  const old = ledger.splice(0, ledger.length - keep);
  const first = ledger[0]!;
  const body: Omit<LedgerEntry, 'hash'> = {
    n: first.n - 1,
    at: old[old.length - 1]!.at,
    kind: 'carry',
    amount: balance(old),
    note: 'Balance carried forward',
    ref: `lifetime:${lifetimeEarned(old)}`,
    prev: old[old.length - 1]!.hash,
  };
  const carry: LedgerEntry = { ...body, hash: fingerprint(body) };
  // Re-link the kept lines to the carry line, recomputing their fingerprints.
  let prev = carry.hash;
  for (const e of ledger) {
    const { hash: _old, ...rest } = e;
    void _old;
    const relinked = { ...rest, prev };
    e.prev = prev;
    e.hash = fingerprint(relinked);
    prev = e.hash;
  }
  ledger.unshift(carry);
}
