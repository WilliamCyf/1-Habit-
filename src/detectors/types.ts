// Shared words for every exercise detector.
import type { Landmark } from '../pose/landmarks';

/** One look from the camera: when it happened and where the body dots were. */
export interface Frame {
  /** Milliseconds, from a clock that only moves forward. */
  t: number;
  pose: readonly Landmark[] | null;
  /** Picture width ÷ height, needed to measure true angles. */
  aspect: number;
}

/** Short coaching messages. The words spoken for each live in coach/phrases.ts. */
export type Cue =
  | 'nice'
  | 'go-lower'
  | 'hips-up'
  | 'hips-down'
  | 'lock-out'
  | 'slow-down'
  | 'keep-still'
  | 'stay-in-frame'
  | 'get-horizontal';

/** Why a movement was NOT counted as a rep. */
export type RejectReason =
  | 'shallow' // did not go low enough
  | 'too-fast' // bounced: quicker than a real rep can be
  | 'body-line' // hips sagging or piked far out of line
  | 'not-horizontal' // body was not in a push-up position
  | 'moved' // hands/feet (or the phone) shifted during the rep
  | 'no-body-movement' // the arm bent but the body did not go down
  | 'lost' // the camera lost sight of the body mid-rep
  | 'jump'; // the tracked body teleported: probably a different person

export type Variant = 'standard' | 'knee';

export interface RepEvent {
  type: 'rep';
  count: number;
  /** Form quality, 0 to 100. */
  score: number;
  durationMs: number;
  /** Smallest elbow angle reached, in degrees. Lower = deeper. */
  depthDeg: number;
  variant: Variant;
  cue: Cue;
}

export interface RejectEvent {
  type: 'reject';
  reason: RejectReason;
  cue: Cue;
}

/** A coaching nudge given in the middle of a rep. */
export interface CueEvent {
  type: 'cue';
  cue: Cue;
}

/** The person has stood up or walked off for a while. */
export interface LeftEvent {
  type: 'left';
}

export type DetectorEvent = RepEvent | RejectEvent | CueEvent | LeftEvent;
