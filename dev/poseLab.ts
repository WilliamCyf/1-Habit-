// DEVELOPMENT ONLY: not part of the app and never published.
//
// Runs the exact pose model the app uses on still frames taken from a real
// video, and hands back the body dots. scripts/extract-fixtures.mjs uses it
// to turn real exercise videos into test recordings ("fixtures"), so the
// rep counters are tested on real people, not only on drawn stick figures.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

type Frame = [number, number, number][]; // [x, y, visibility] per landmark

declare global {
  interface Window {
    extractPoses(urls: string[], fps: number, model: 'lite' | 'full'): Promise<{ frames: (Frame | null)[]; msPerFrame: number }>;
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

window.extractPoses = async (urls, fps, model) => {
  const fileset = await FilesetResolver.forVisionTasks(new URL('../wasm', import.meta.url).href.replace(/\/$/, ''));
  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: new URL(`../models/pose_landmarker_${model}.task`, document.baseURI).href, delegate: 'CPU' },
    // The same settings as src/pose/tracker.ts.
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });
  const frames: (Frame | null)[] = [];
  let total = 0;
  for (let i = 0; i < urls.length; i++) {
    const img = await loadImage(urls[i]!);
    const t0 = performance.now();
    const result = landmarker.detectForVideo(img, Math.round((i * 1000) / fps) + 1);
    total += performance.now() - t0;
    const pose = result.landmarks[0];
    frames.push(pose ? pose.map((p) => [p.x, p.y, p.visibility ?? 0]) : null);
  }
  landmarker.close();
  return { frames, msPerFrame: total / Math.max(1, urls.length) };
};
