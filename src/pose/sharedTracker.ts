// One tracker for the whole app session.
//
// Loading the model takes a couple of seconds, and its first look can take
// several more while the graphics chip sets itself up. So we build it once,
// warm it up once, and reuse it for every set, like leaving the oven on
// between batches instead of reheating it each time.
import { createPoseTracker, type PoseTracker } from './tracker';

let shared: Promise<PoseTracker> | null = null;

export function getSharedTracker(): Promise<PoseTracker> {
  shared ??= (async () => {
    // Development only: "?cpu" forces the main-processor engine, so a test
    // browser without a real graphics chip can keep up with a video feed.
    const cpu = import.meta.env.DEV && new URLSearchParams(window.location.search).has('cpu');
    const tracker = await createPoseTracker({ model: 'lite', delegate: cpu ? 'CPU' : 'GPU' });
    // Let the "getting ready" screen paint before the slow warm-up starts.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    tracker.warmUp();
    return tracker;
  })();
  // If loading failed, forget the failure so the next attempt can retry.
  shared.catch(() => (shared = null));
  return shared;
}
