// Builds fake "camera recordings" (sequences of poses) for testing detectors.
// Real cheaters and real athletes are simulated with a few numbers each.
import { pushupPose, repElbow, type PushupPoseOptions } from '../../src/detectors/pushupModel';
import { PushupDetector } from '../../src/detectors/pushup';
import type { DetectorEvent, Frame, RejectEvent, RepEvent } from '../../src/detectors/types';
import type { Landmark } from '../../src/pose/landmarks';

/** A repeatable random number source: same seed, same "random" numbers. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Clip {
  frames: Frame[];
}

export interface ClipOptions {
  fps?: number;
  aspect?: number;
  /** Random wobble added to every dot, as a share of the picture (0.004 is realistic). */
  jitter?: number;
  seed?: number;
}

/**
 * Build a clip from a function that says what the pose is at each moment.
 * `poseAt` returns null for "nobody visible".
 */
export function makeClip(seconds: number, poseAt: (tSec: number) => Landmark[] | null, o: ClipOptions = {}): Clip {
  const fps = o.fps ?? 15;
  const aspect = o.aspect ?? 4 / 3;
  const random = rng(o.seed ?? 1);
  const frames: Frame[] = [];
  for (let i = 0; i < seconds * fps; i++) {
    const tSec = i / fps;
    let pose = poseAt(tSec);
    if (pose && o.jitter) {
      pose = pose.map((p) => ({ ...p, x: p.x + (random() - 0.5) * 2 * o.jitter!, y: p.y + (random() - 0.5) * 2 * o.jitter! }));
    }
    // Real frame timing wobbles by a few milliseconds.
    frames.push({ t: 1000 + tSec * 1000 + (random() - 0.5) * 6, pose, aspect });
  }
  return { frames };
}

export interface PushupClipOptions extends ClipOptions {
  reps: number;
  /** Seconds per rep. */
  repSec?: number;
  topDeg?: number;
  bottomDeg?: number;
  /** Seconds holding the top position before the first rep. */
  leadIn?: number;
  pose?: Partial<PushupPoseOptions>;
  /** Change the pose over time (sag that appears, a moving phone, and so on). */
  tweak?: (tSec: number, base: PushupPoseOptions) => PushupPoseOptions | null;
}

/** Someone holding the top position, then doing `reps` push-ups, then holding again. */
export function pushupClip(o: PushupClipOptions): Clip {
  const repSec = o.repSec ?? 2;
  const leadIn = o.leadIn ?? 1.6;
  const total = leadIn + o.reps * repSec + 1.2;
  return makeClip(
    total,
    (tSec) => {
      const inReps = tSec >= leadIn && tSec < leadIn + o.reps * repSec;
      const phase = inReps ? ((tSec - leadIn) / repSec) % 1 : 0;
      const base: PushupPoseOptions = {
        elbowDeg: repElbow(phase, o.topDeg ?? 165, o.bottomDeg ?? 80),
        aspect: o.aspect ?? 4 / 3,
        ...o.pose,
      };
      const final = o.tweak ? o.tweak(tSec, base) : base;
      return final ? pushupPose(final) : null;
    },
    o,
  );
}

export interface RunResult {
  reps: RepEvent[];
  rejects: RejectEvent[];
  events: DetectorEvent[];
  becameReady: boolean;
  detector: PushupDetector;
}

/**
 * Play a clip through the detector the way the app does: wait for the
 * start position, then count.
 */
export function runPushups(clip: Clip): RunResult {
  const detector = new PushupDetector();
  const events: DetectorEvent[] = [];
  let becameReady = false;
  for (const frame of clip.frames) {
    events.push(...detector.update(frame));
    if (!becameReady && detector.view.ready) {
      becameReady = true;
      detector.startCounting();
    }
  }
  return {
    reps: events.filter((e): e is RepEvent => e.type === 'rep'),
    rejects: events.filter((e): e is RejectEvent => e.type === 'reject'),
    events,
    becameReady,
    detector,
  };
}
