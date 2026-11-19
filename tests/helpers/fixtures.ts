// Loads the real-video recordings in tests/fixtures/ (made by
// scripts/extract-fixtures.mjs) back into the 33-dot format the app uses.
import type { Frame } from '../../src/detectors/types';
import type { Landmark } from '../../src/pose/landmarks';

export interface Fixture {
  id: string;
  title: string;
  view: 'front' | 'side' | 'other';
  exercise: string;
  /** Reps counted by hand, or null if not labelled. */
  reps: number | null;
  /** The range of counts accepted as correct (a clip may end mid-rep). */
  accept: [number, number] | null;
  fps: number;
  aspect: number;
  frames: Frame[];
}

interface RawFixture {
    id: string;
    title: string;
    view: Fixture['view'];
    exercise: string;
    reps: number | null;
    accept: [number, number] | null;
    fps: number;
    aspect: number;
    keep: number[];
    frames: ([number, number, number][] | null)[];
}

// Vite (which runs the tests) can bundle every fixture file at once.
const FILES = import.meta.glob<RawFixture>('../fixtures/*.json', { eager: true, import: 'default' });
const BY_ID = new Map(Object.values(FILES).map((raw) => [raw.id, raw]));

export function loadFixture(id: string): Fixture {
  const raw = BY_ID.get(id);
  if (!raw) throw new Error(`No fixture ${id}`);
  const frames: Frame[] = raw.frames.map((f, i) => {
    let pose: Landmark[] | null = null;
    if (f) {
      // Joints that were not stored are marked as not seen.
      pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
      raw.keep.forEach((index, k) => {
        const [x, y, v] = f[k]!;
        pose![index] = { x, y, z: 0, visibility: v };
      });
    }
    return { t: 1000 + (i * 1000) / raw.fps, pose, aspect: raw.aspect };
  });
  return { id: raw.id, title: raw.title, view: raw.view, exercise: raw.exercise, reps: raw.reps, accept: raw.accept ?? null, fps: raw.fps, aspect: raw.aspect, frames };
}

export function fixtureIds(): string[] {
  return [...BY_ID.keys()].sort();
}
