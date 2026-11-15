// Loads the pose model ("the tracking brain") and runs it on camera frames.
//
// We use Google's MediaPipe Pose Landmarker. It is a small neural network
// that looks at one picture and answers "where are this person's joints?".
// Both the engine (a .wasm file) and the model (a .task file) are served
// from our own site, so no other company's server is involved.
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from './landmarks';

export type ModelSize = 'lite' | 'full';
/** GPU = the phone's graphics chip (fast). CPU = the main processor (slower, always works). */
export type Delegate = 'GPU' | 'CPU';

export interface TrackerOptions {
  model: ModelSize;
  delegate: Delegate;
}

export interface PoseTracker {
  readonly model: ModelSize;
  /** What we asked for. */
  readonly requested: Delegate;
  /** What is really running (GPU can fall back to CPU). */
  readonly delegate: Delegate;
  /** How long loading the engine and model took, in milliseconds. */
  readonly loadMs: number;
  /**
   * Analyse the current video frame. Returns the 33 landmarks of the main
   * person, or null if nobody was found.
   */
  detect(video: HTMLVideoElement, timestampMs: number): Landmark[] | null;
  /** Frees the memory used by the model. */
  close(): void;
}

function assetUrl(path: string): string {
  // Resolve relative to the page, so it works under any hosting folder.
  return new URL(path, document.baseURI).href;
}

async function build(model: ModelSize, delegate: Delegate): Promise<PoseLandmarker> {
  // Dynamic import: this big library is only downloaded when tracking is
  // actually needed, not when the app first opens.
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const wasmDir = assetUrl('wasm').replace(/\/$/, '');
  const fileset = await FilesetResolver.forVisionTasks(wasmDir);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: assetUrl(`models/pose_landmarker_${model}.task`),
      delegate,
    },
    // VIDEO mode lets the model remember the previous frame, which makes
    // tracking steadier and cheaper than treating each frame as brand new.
    runningMode: 'VIDEO',
    // Only ever follow one person: the most prominent one.
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });
}

/**
 * Creates a tracker. If the GPU version cannot start, it quietly falls back
 * to the CPU version, and `delegate` tells you which one you got.
 */
export async function createPoseTracker(opts: TrackerOptions): Promise<PoseTracker> {
  const t0 = performance.now();
  let delegate = opts.delegate;
  let landmarker: PoseLandmarker;
  try {
    landmarker = await build(opts.model, delegate);
  } catch (err) {
    if (delegate !== 'GPU') throw err;
    console.warn('GPU tracker failed to start, falling back to CPU:', err);
    delegate = 'CPU';
    landmarker = await build(opts.model, delegate);
  }
  const loadMs = performance.now() - t0;

  let lastTs = 0;
  return {
    model: opts.model,
    requested: opts.delegate,
    delegate,
    loadMs,
    detect(video, timestampMs) {
      // The model insists that each timestamp is larger than the last.
      const ts = timestampMs > lastTs ? timestampMs : lastTs + 1;
      lastTs = ts;
      const result = landmarker.detectForVideo(video, ts);
      return result.landmarks[0] ?? null;
    },
    close() {
      landmarker.close();
    },
  };
}
