// The store: the one place that holds the app's data while it is running.
//
// Screens never write to storage themselves. They call update(), and the
// store saves and then tells every listener "something changed". One door
// in, one door out, so data cannot get out of step between screens.
import { readKey, removeKey, writeKey, type WriteResult } from '../platform/storage';
import { loadSave, newSave, serialise, type SaveData } from '../state/save';

const KEY = 'repling.save';
/** A copy of the last save that loaded cleanly, kept as a spare. */
const SPARE_KEY = 'repling.save.spare';

export type LoadNote =
  | 'fresh' // first ever launch
  | 'loaded' // normal
  | 'recovered' // main save was damaged, the spare was used
  | 'reset' // both were damaged, started again
  | 'too-new'; // save comes from a newer app version: do not touch it

let state: SaveData = newSave();
let note: LoadNote = 'fresh';
let lastWrite: WriteResult = 'ok';
/** When true we never write, to avoid destroying a save we cannot read. */
let readOnly = false;
const listeners = new Set<() => void>();

export function initStore(): LoadNote {
  const text = readKey(KEY);
  if (text === null) {
    note = 'fresh';
    state = newSave();
    return note;
  }
  const main = loadSave(text);
  if (main.ok) {
    state = main.data;
    note = 'loaded';
    writeKey(SPARE_KEY, text);
    return note;
  }
  if (main.reason === 'too-new') {
    state = newSave();
    readOnly = true;
    note = 'too-new';
    return note;
  }
  const spareText = readKey(SPARE_KEY);
  const spare = spareText ? loadSave(spareText) : null;
  if (spare?.ok) {
    state = spare.data;
    note = 'recovered';
  } else {
    state = newSave();
    note = 'reset';
  }
  persist();
  return note;
}

let problemHandler: ((kind: 'full' | 'blocked') => void) | null = null;
let problemReported = false;

/** Lets the app warn the user (once) if saving stops working. */
export function onWriteProblem(handler: (kind: 'full' | 'blocked') => void): void {
  problemHandler = handler;
  if (lastWrite !== 'ok' && !problemReported) {
    problemReported = true;
    handler(lastWrite);
  }
}

function persist(): void {
  if (readOnly) return;
  lastWrite = writeKey(KEY, serialise(state));
  if (lastWrite !== 'ok' && !problemReported && problemHandler) {
    problemReported = true;
    problemHandler(lastWrite);
  }
}

function notify(): void {
  for (const fn of listeners) fn();
}

export function getState(): Readonly<SaveData> {
  return state;
}

export function loadNote(): LoadNote {
  return note;
}

export function writeStatus(): WriteResult {
  return lastWrite;
}

/** Change the data. `quiet` saves without redrawing (used while typing). */
export function update(change: (draft: SaveData) => void, options: { quiet?: boolean } = {}): void {
  change(state);
  state.updatedAt = new Date().toISOString();
  persist();
  if (!options.quiet) notify();
}

export function replaceAll(data: SaveData): void {
  state = data;
  readOnly = false;
  persist();
  notify();
}

export function resetAll(): void {
  removeKey(KEY);
  removeKey(SPARE_KEY);
  state = newSave();
  readOnly = false;
  note = 'fresh';
  notify();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
