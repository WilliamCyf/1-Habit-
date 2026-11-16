// DEVELOPMENT ONLY. A pretend person doing an exercise, used to test the
// workout screens on a computer that has no real body in front of a camera.
//
// This file is only ever loaded when the app runs in development mode
// (`npm run dev`). The published app does not contain it, so it cannot be
// used to earn reps without doing them.
import type { ExerciseDef, Level } from '../exercises/library';
import { bodyToPose, jack } from '../exercises/models';
import type { Landmark } from '../pose/landmarks';

/**
 * Answers a coach check-in if asked, holds the start position, then does
 * clean reps with one deliberately weak rep mixed in.
 */
export function simulated(def: ExerciseDef, level: Level, withCheckIn: boolean): (tMs: number) => Landmark[] | null {
  let start = 0;
  let last = 0;
  let done = 0;
  const repSec = def.repSec(level);
  const leadIn = (withCheckIn ? 2.5 : 0) + 5.2; // raised hands, then start-position hold + countdown
  return (tMs) => {
    // After a pause, behave like a real person: get back into the start
    // position and hold it before carrying on.
    if (!start || tMs - last > 1000) {
      if (start) done += Math.max(0, Math.floor(((last - start) / 1000 - leadIn) / repSec));
      start = tMs;
    }
    last = tMs;
    const t = (tMs - start) / 1000;
    if (withCheckIn && t < 2.5 && done === 0) return bodyToPose(jack(1));
    if (t < leadIn) return bodyToPose(def.body(0, level));
    const index = done + Math.floor((t - leadIn) / repSec);
    const phase = ((t - leadIn) / repSec) % 1;
    // Rep number 3 is deliberately half-hearted, to show a rejection.
    return bodyToPose(def.body(phase, level, index === 2 ? 0.5 : 1));
  };
}
