// Copies the pose-tracking engine out of node_modules into public/wasm so the
// app can serve it from OUR OWN site (no third-party CDN, works offline).
//
// "wasm" = WebAssembly: a compact, pre-compiled program format that browsers
// can run at near-native speed. MediaPipe ships its number-crunching as wasm.
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const to = join(root, 'public/wasm');

// Only the SIMD build is needed: every iPhone on iOS 16.4+ supports SIMD
// (a CPU feature that does several sums at once). Skipping the other
// variants keeps the deployed site ~22 MB smaller.
const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];

mkdirSync(to, { recursive: true });
for (const f of files) {
  copyFileSync(join(from, f), join(to, f));
  const mb = (statSync(join(to, f)).size / 1024 / 1024).toFixed(1);
  console.log(`copied ${f} (${mb} MB)`);
}
