// What the coach shows and says. Kept in one file so the wording is easy to
// change, and so the screen text and the spoken text never drift apart.
import type { Cue, RejectReason } from '../detectors/types';

export const CUE_TEXT: Record<Cue, { show: string; say: string }> = {
  nice: { show: 'Nice rep', say: '' },
  'go-lower': { show: 'Go lower', say: 'Go lower' },
  'go-higher': { show: 'Go higher', say: 'Higher' },
  'hips-up': { show: 'Hips up', say: 'Hips up' },
  'hips-down': { show: 'Hips down', say: 'Hips down' },
  'lock-out': { show: 'Straighten your arms at the top', say: 'Arms straight at the top' },
  'slow-down': { show: 'Slow down', say: 'Slower' },
  'keep-still': { show: 'Keep the phone and your base still', say: 'Keep still' },
  'stay-in-frame': { show: 'Stay in view of the camera', say: 'Stay in view' },
  'get-horizontal': { show: 'Get into push-up position', say: 'Push-up position' },
  'get-in-position': { show: 'Get back into position', say: 'Back into position' },
  'chest-up': { show: 'Chest up', say: 'Chest up' },
  'straight-legs': { show: 'Keep your legs nearly straight', say: 'Legs straighter' },
  'step-back': { show: 'Step one foot back', say: 'Step back further' },
  'arms-up': { show: 'Arms all the way up', say: 'Arms up' },
  'feet-wider': { show: 'Feet wider', say: 'Feet wider' },
  'knees-higher': { show: 'Knees higher', say: 'Knees higher' },
  'knee-in': { show: 'Knee closer to your chest', say: 'Knee to chest' },
  'reach-long': { show: 'Reach longer', say: 'Reach long' },
  'hold-it': { show: 'Hold it there', say: 'Hold it' },
  'knees-up': { show: 'Lift your knees off the floor', say: 'Knees up' },
  'add-pushup': { show: 'Add the push-up', say: 'Add the push-up' },
};

/** Shown in the summary when movements were not counted. */
export const REJECT_TEXT: Record<RejectReason, { show: string; tip: string }> = {
  shallow: { show: 'not far enough', tip: 'Use the full range of the movement, as the demo shows.' },
  'too-fast': { show: 'too fast', tip: 'Slow, controlled reps build more strength. No bouncing.' },
  'body-line': { show: 'body not straight', tip: 'Squeeze your tummy and bottom so shoulders, hips and feet make one line.' },
  'not-horizontal': { show: 'not in push-up position', tip: 'Hands on the floor under your shoulders, body flat like a plank.' },
  moved: { show: 'something slid', tip: 'Keep your hands or feet planted, and make sure the phone cannot slip.' },
  'no-body-movement': { show: 'the body did not really move', tip: 'Your whole body should travel, not just one joint.' },
  lost: { show: 'I lost sight of you', tip: 'Keep your whole body in the picture, with decent light.' },
  jump: { show: 'I lost track', tip: 'Only one person in view works best.' },
  'wrong-shape': { show: 'a different movement', tip: 'Follow the demo for this exercise. Tap the name to see it again.' },
  'no-pause': { show: 'no pause', tip: 'This version needs a short hold at the hardest point.' },
};

/** The text that pops up on screen when one movement is not counted. */
export function rejectLine(reason: RejectReason, cue: Cue): string {
  if (reason === 'shallow' || reason === 'no-pause' || reason === 'wrong-shape') return `Not counted: ${CUE_TEXT[cue].show.toLowerCase()}`;
  return `Not counted: ${REJECT_TEXT[reason].show}`;
}

export const LINES = {
  loading: 'Getting ready.',
  go: 'Go!',
  paused: 'Paused.',
  lastOne: 'Last one.',
  left: 'Set finished.',
  checkIn: 'Coach check! Raise one hand above your head.',
  checkInFloor: 'Coach check! Lift one hand off the floor and wave.',
  seeYou: 'I can see you.',
  checkInBoth: 'Coach check! Raise both hands above your head.',
  checkInPassed: 'Thanks!',
  checkInFailed: 'I could not see your hand, so this set is skipped.',
  targetReached: 'Set complete. Great work!',
  stopped: (count: number, unit: string) => (count === 0 ? 'Set stopped.' : `Set finished. ${count} ${unit}.`),
} as const;
