import { describe, expect, it } from 'vitest';
import { append, balance, compact, dayKey, earnedOn, hasRef, lifetimeEarned, verify, type LedgerEntry } from '../src/economy/ledger';
import { sha256 } from '../src/economy/sha256';

const at = (iso: string) => new Date(iso);

function sample(): LedgerEntry[] {
  const book: LedgerEntry[] = [];
  append(book, { kind: 'earn', amount: 40, note: 'Push-up: 8 reps', ref: 'set:1', at: at('2026-11-16T08:00:00') });
  append(book, { kind: 'bonus', amount: 20, note: 'First workout today', ref: 'daily:2026-11-16', at: at('2026-11-16T08:00:01') });
  append(book, { kind: 'spend', amount: -16, note: 'Hearty bowl', ref: 'shop:bowl', at: at('2026-11-16T09:00:00') });
  append(book, { kind: 'earn', amount: 55, note: 'Squat: 12 reps', ref: 'set:2', at: at('2026-11-17T08:00:00') });
  return book;
}

describe('sha256', () => {
  it('matches the published test values', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    // Longer than one 64-byte block, with non-English characters.
    expect(sha256('é'.repeat(100))).toHaveLength(64);
    expect(sha256('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });
});

describe('ledger', () => {
  it('adds up the balance from the lines', () => {
    expect(balance(sample())).toBe(40 + 20 - 16 + 55);
    expect(balance([])).toBe(0);
  });

  it('verifies an untouched book', () => {
    expect(verify(sample())).toEqual({ ok: true, validCount: 4 });
    expect(verify([])).toEqual({ ok: true, validCount: 0 });
  });

  it('detects a changed amount', () => {
    const book = sample();
    book[0]!.amount = 4000;
    expect(verify(book)).toEqual({ ok: false, validCount: 0 });
  });

  it('detects a changed amount even if the cheat recomputes nothing else', () => {
    const book = sample();
    book[2]!.amount = 0; // "I never spent those"
    expect(verify(book).validCount).toBe(2);
  });

  it('detects a deleted line, an inserted line and a reordering', () => {
    const removed = sample();
    removed.splice(2, 1);
    expect(verify(removed).ok).toBe(false);

    const inserted = sample();
    inserted.splice(1, 0, { ...inserted[0]!, n: 1, amount: 999 });
    expect(verify(inserted).ok).toBe(false);

    const swapped = sample();
    [swapped[1], swapped[2]] = [swapped[2]!, swapped[1]!];
    expect(verify(swapped).ok).toBe(false);
  });

  it('detects a forged line added at the end without a proper fingerprint', () => {
    const book = sample();
    book.push({ ...book[3]!, n: 4, amount: 5000, prev: book[3]!.hash, hash: 'f'.repeat(64) });
    expect(verify(book)).toEqual({ ok: false, validCount: 4 });
  });

  it('rejects impossible lines: a spend that adds points, or an earn that removes them', () => {
    const book: LedgerEntry[] = [];
    append(book, { kind: 'spend', amount: 500, note: 'sneaky', at: at('2026-11-16T08:00:00') });
    expect(verify(book).ok).toBe(false);
    const other: LedgerEntry[] = [];
    append(other, { kind: 'earn', amount: -5, note: 'odd', at: at('2026-11-16T08:00:00') });
    expect(verify(other).ok).toBe(false);
  });

  it('counts workout points per local day, without bonuses', () => {
    const book = sample();
    expect(earnedOn(book, '2026-11-16')).toBe(40);
    expect(earnedOn(book, '2026-11-17')).toBe(55);
    expect(earnedOn(book, '2026-11-18')).toBe(0);
    expect(dayKey(at('2026-01-05T23:59:00'))).toBe('2026-01-05');
  });

  it('finds award tags, so the same bonus cannot be given twice', () => {
    const book = sample();
    expect(hasRef(book, 'daily:2026-11-16')).toBe(true);
    expect(hasRef(book, 'daily:2026-11-17')).toBe(false);
  });

  it('totals lifetime earnings from workouts and bonuses only', () => {
    expect(lifetimeEarned(sample())).toBe(115);
  });
});

describe('carrying the balance forward', () => {
  function long(n: number): LedgerEntry[] {
    const book: LedgerEntry[] = [];
    for (let i = 0; i < n; i++) {
      append(book, { kind: i % 5 === 4 ? 'spend' : 'earn', amount: i % 5 === 4 ? -10 : 7, note: `line ${i}`, at: new Date(2026, 0, 1, 0, i) });
    }
    return book;
  }

  it('leaves a short book alone', () => {
    const book = long(100);
    compact(book);
    expect(book).toHaveLength(100);
  });

  it('keeps the balance, the lifetime total and a valid chain', () => {
    const book = long(2000);
    const before = { balance: balance(book), lifetime: lifetimeEarned(book) };
    compact(book);
    expect(book).toHaveLength(501);
    expect(book[0]!.kind).toBe('carry');
    expect(balance(book)).toBe(before.balance);
    expect(lifetimeEarned(book)).toBe(before.lifetime);
    expect(verify(book)).toEqual({ ok: true, validCount: 501 });
  });

  it('can keep growing and be compacted again', () => {
    const book = long(2000);
    compact(book);
    for (let i = 0; i < 1200; i++) append(book, { kind: 'earn', amount: 3, note: 'more', at: new Date(2026, 5, 1, 0, i) });
    const before = { balance: balance(book), lifetime: lifetimeEarned(book) };
    compact(book);
    expect(balance(book)).toBe(before.balance);
    expect(lifetimeEarned(book)).toBe(before.lifetime);
    expect(verify(book).ok).toBe(true);
  });

  it('still detects tampering after compaction', () => {
    const book = long(2000);
    compact(book);
    book[0]!.amount += 1000;
    expect(verify(book).ok).toBe(false);
  });
});
