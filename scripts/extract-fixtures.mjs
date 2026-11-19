// Turns real exercise videos into test recordings for the rep counters.
//
// For each clip in scripts/fixtures/sources.json it:
//  1. downloads the video into .cache/ (not stored in git),
//  2. takes 15 still frames per second with ffmpeg,
//  3. runs the app's own pose model on every frame in a headless browser,
//  4. saves the body dots (numbers only, no pictures) to tests/fixtures/.
//
// Run with: npm run fixtures            (all clips)
//           npm run fixtures -- 24277   (one clip)
// Needs ffmpeg and Playwright on the computer. The phone never runs this.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = resolve('.');
const FPS = 15;
const CACHE = join(ROOT, '.cache', 'videos');
const OUT = join(ROOT, 'tests', 'fixtures');
// The joints the counters use. Storing only these keeps the files small.
export const KEEP = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

const sources = JSON.parse(readFileSync(join(ROOT, 'scripts/fixtures/sources.json'), 'utf8'));
const only = process.argv.slice(2);
const clips = sources.clips.filter((c) => only.length === 0 || only.includes(c.id));
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

function download(clip) {
  const file = join(CACHE, `${clip.id}.mp4`);
  if (!existsSync(file)) {
    console.log(`downloading ${clip.id}`);
    execFileSync('curl', ['-sS', '-L', '-A', 'Mozilla/5.0', '-o', file, clip.url]);
  }
  return file;
}

function frames(clip, file) {
  const dir = join(CACHE, `${clip.id}-frames`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const trim = clip.start !== undefined ? ['-ss', String(clip.start)] : [];
  const until = clip.end !== undefined ? ['-to', String(clip.end - (clip.start ?? 0))] : [];
  execFileSync('ffmpeg', ['-v', 'error', ...trim, '-i', file, ...until, '-vf', `fps=${FPS},scale='min(640,iw)':-2`, '-q:v', '3', join(dir, '%04d.jpg')]);
  return { dir, names: readdirSync(dir).filter((n) => n.endsWith('.jpg')).sort() };
}

const round = (v) => Math.round(v * 1000) / 1000;

const server = await createServer({ root: ROOT, server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  for (const clip of clips) {
    const file = download(clip);
    const { dir, names } = frames(clip, file);
    const size = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', join(dir, names[0])]).toString().trim();
    const [w, h] = size.split(',').map(Number);
    const page = await browser.newPage();
    await page.route('**/__frames/**', (route) => route.fulfill({ path: join(dir, route.request().url().split('/').pop()) }));
    await page.goto('http://localhost:5199/dev/pose-lab.html');
    await page.waitForFunction(() => typeof window.extractPoses === 'function');
    const urls = names.map((n) => `/__frames/${n}`);
    const result = await page.evaluate(([u, fps, model]) => window.extractPoses(u, fps, model), [urls, FPS, clip.model ?? 'lite']);
    await page.close();
    const compact = result.frames.map((f) => (f ? KEEP.map((i) => [round(f[i][0]), round(f[i][1]), round(f[i][2])]) : null));
    const found = compact.filter(Boolean).length;
    writeFileSync(
      join(OUT, `${clip.id}.json`),
      JSON.stringify({ id: clip.id, title: clip.title, view: clip.view, exercise: clip.exercise, reps: clip.reps, fps: FPS, aspect: w / h, keep: KEEP, frames: compact }),
    );
    console.log(`${clip.id}: ${names.length} frames, person found in ${found}, ${result.msPerFrame.toFixed(0)} ms/frame → tests/fixtures/${clip.id}.json`);
  }
} finally {
  await browser.close();
  await server.close();
}
