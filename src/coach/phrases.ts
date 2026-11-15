// What the coach shows and says. Kept in one file so the wording is easy to
// change, and so the screen text and the spoken text never drift apart.
import type { Cue, RejectReason } from '../detectors/types';

export const CUE_TEXT: Record<Cue, { show: string; say: string }> = {
  nice: { show: 'Nice rep', say: '' },
  'go-lower': { show: 'Go lower', say: 'Go lower' },
  'hips-up': { show: 'Hips up', say: 'Hips up' },
  'hips-down': { show: 'Hips down', say: 'Hips down' },
  'lock-out': { show: 'Straighten your arms at the top', say: 'Arms straight at the top' },
  'slow-down': { show: 'Slow down', say: 'Slower' },
  'keep-still': { show: 'Keep your hands and the phone still', say: 'Keep still' },
  'stay-in-frame': { show: 'Stay in view of the camera', say: 'Stay in view' },
  'get-horizontal': { show: 'Get into push-up position', say: 'Push-up position' },
};

/** Shown when a movement was not counted, with the reason in plain words. */
export const REJECT_TEXT: Record<RejectReason, { show: string; tip: string }> = {
  shallow: { show: 'Not counted: go lower', tip: 'Bend your elbows until your chest is a fist’s height from the floor.' },
  'too-fast': { show: 'Not counted: too fast', tip: 'Take about one second down and one second up. No bouncing.' },
  'body-line': { show: 'Not counted: keep your body straight', tip: 'Squeeze your tummy and bottom so shoulders, hips and feet make one line.' },
  'not-horizontal': { show: 'Not counted: get into push-up position', tip: 'Hands on the floor under your shoulders, body flat like a plank.' },
  moved: { show: 'Not counted: something moved', tip: 'Keep your hands planted and make sure the phone cannot slide.' },
  'no-body-movement': { show: 'Not counted: lower your chest', tip: 'Your whole body should travel down, not only your elbows bending.' },
  lost: { show: 'Not counted: I lost sight of you', tip: 'Keep your whole body in the picture, with decent light.' },
  jump: { show: 'Not counted: I lost track', tip: 'Only one person in view works best.' },
};

export const LINES = {
  loading: 'Getting ready.',
  position: 'Get into push-up position, side on to the phone.',
  go: 'Go!',
  paused: 'Paused.',
  halfway: 'Half way.',
  lastOne: 'Last one.',
  left: 'Set finished.',
  targetReached: (reps: number) => `${reps} reps. Set complete. Great work!`,
  stopped: (reps: number) => (reps === 0 ? 'Set stopped.' : `Set finished. ${reps} ${reps === 1 ? 'rep' : 'reps'}.`),
} as const;
