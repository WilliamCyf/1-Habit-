// DEVELOPMENT ONLY. A pretend person doing push-ups, used to test the
// workout screen on a computer that has no real body in front of a camera.
//
// This file is only ever loaded when the app runs in development mode
// (`npm run dev`). The published app does not contain it, so it cannot be
// used to earn reps without doing them.
import { pushupPose, repElbow } from '../detectors/pushupModel';
import type { Landmark } from '../pose/landmarks';

/** Holds the start position, then does clean reps with one half rep mixed in. */
export function simulatedPushups(): (tMs: number) => Landmark[] | null {
  let start = 0;
  let last = 0;
  let repsBefore = 0;
  return (tMs) => {
    // After a pause, behave like a real person: get back into the start
    // position and hold it before carrying on.
    if (!start || tMs - last > 1000) {
      if (start) repsBefore += Math.max(0, Math.floor(((last - start) / 1000 - 5.2) / 1.8));
      start = tMs;
    }
    last = tMs;
    const t = (tMs - start) / 1000;
    const leadIn = 5.2; // start-position hold + 3-2-1 countdown
    if (t < leadIn) return pushupPose({ elbowDeg: 165 });
    const repSec = 1.8;
    const index = repsBefore + Math.floor((t - leadIn) / repSec);
    const phase = ((t - leadIn) / repSec) % 1;
    // Rep number 3 is deliberately too shallow, to show a rejection.
    return pushupPose({ elbowDeg: repElbow(phase, 165, index === 2 ? 122 : 80) });
  };
}
