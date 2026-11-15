// The camera-check (diagnostics) page.
//
// Job: prove that body tracking runs smoothly and coolly on this iPhone, and
// produce a short report with real numbers. Everything interesting (camera,
// tracker, pacing, drawing) lives in src/pose and src/perf so the real app
// reuses exactly the code we test here.
import { CameraError, openCamera, type CameraHandle, type CameraInfo, type Facing } from '../pose/camera';
import { FrameLoop } from '../pose/frameLoop';
import { bestSide, elbowAngle, kneeAngle } from '../pose/geometry';
import { averageVisibility, isWholeBodyVisible, type Landmark } from '../pose/landmarks';
import { SkeletonRenderer } from '../pose/skeleton';
import { createPoseTracker, type Delegate, type ModelSize, type PoseTracker } from '../pose/tracker';
import { FramePacer } from '../perf/pacer';
import { Histogram, RollingStats, Timeline, Totals } from '../perf/stats';
import { WakeLock, deviceSummary, gpuName, isStandalone } from '../platform/ios';
import { buildReport, type RunData } from './report';

// ---------------------------------------------------------------- elements

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const app = el('app');
const stage = el('stage');
const video = el<HTMLVideoElement>('video');
const overlay = el<HTMLCanvasElement>('overlay');
const hud = el('hud');
const bodyChip = el('body-chip');
const busy = el('busy');
const busyText = el('busy-text');
const introTitle = el('intro-title');
const toastEl = el('toast');
const mainBtn = el<HTMLButtonElement>('main-btn');
const errorBox = el('error-box');
const settings = el<HTMLFieldSetElement>('settings');
const reportText = el<HTMLTextAreaElement>('report-text');
const progressBar = el('progress-bar');

// ------------------------------------------------------------------- state

type State = 'idle' | 'starting' | 'running' | 'paused' | 'stopped';

interface Config {
  model: ModelSize;
  delegate: Delegate;
  width: number;
  height: number;
  rate: number;
  facing: Facing;
}

/** Everything we measure during one test run. */
interface Run extends RunData {
  /** Clock reading when the current running stretch began. */
  segmentStart: number;
  lastInferAt: number;
  recentMs: RollingStats;
  recentGaps: RollingStats;
  fiveMinDone: boolean;
  consecutiveErrors: number;
}

const GOAL_MS = 5 * 60 * 1000;
const STUTTER_MS = 50;

let state: State = 'idle';
let run: Run | null = null;
let camera: CameraHandle | null = null;
let tracker: PoseTracker | null = null;
let trackerKey = '';
let autoResume = false;
let latestPose: Landmark[] | null = null;

const skeleton = new SkeletonRenderer(overlay);
const pacer = new FramePacer(15);
const wakeLock = new WakeLock();
const loop = new FrameLoop(video, onFrame);
const device = deviceSummary();
const gpu = gpuName();
const engineLog: string[] = [];

// ------------------------------------------------------- catching problems
// On an iPhone you cannot open a developer console, so we keep a copy of
// every console message and unexpected error to include in the report.

function logLine(line: string): void {
  const text = line.length > 280 ? `${line.slice(0, 280)}…` : line;
  const last = engineLog[engineLog.length - 1];
  if (last !== undefined && last.replace(/ \(x\d+\)$/, '') === text) {
    const m = / \(x(\d+)\)$/.exec(last);
    engineLog[engineLog.length - 1] = `${text} (x${m ? Number(m[1]) + 1 : 2})`;
    return;
  }
  engineLog.push(text);
  if (engineLog.length > 30) engineLog.shift();
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

for (const level of ['log', 'info', 'warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    logLine(`${level}: ${args.map(describe).join(' ')}`);
    original(...args);
  };
}

window.addEventListener('error', (e) => {
  recordError(`Script error: ${e.message} (${(e.filename || '').split('/').pop() ?? ''}:${e.lineno})`);
});
window.addEventListener('unhandledrejection', (e) => {
  recordError(`Unhandled: ${describe(e.reason)}`);
});

function recordError(message: string): void {
  logLine(`ERROR ${message}`);
  if (run && run.errors.length < 12) run.errors.push(message);
}

// --------------------------------------------------------------- UI helpers

/** Only touch the page when the text really changed. DOM writes cost time. */
const lastText = new WeakMap<HTMLElement, string>();
function setText(node: HTMLElement, text: string): void {
  if (lastText.get(node) === text) return;
  lastText.set(node, text);
  node.textContent = text;
}

function setTone(node: HTMLElement, tone: 'good' | 'warn' | 'bad' | ''): void {
  node.classList.toggle('good', tone === 'good');
  node.classList.toggle('warn', tone === 'warn');
  node.classList.toggle('bad', tone === 'bad');
}

let toastTimer = 0;
function toast(message: string, ms = 3200): void {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), ms);
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function setState(next: State): void {
  state = next;
  app.dataset.state = next;
  const label: Record<State, string> = {
    idle: 'Start camera test',
    starting: 'Starting…',
    running: 'Stop',
    paused: 'Resume',
    stopped: 'Start again',
  };
  mainBtn.textContent = label[next];
  mainBtn.disabled = next === 'starting';
  mainBtn.classList.toggle('danger', next === 'running');
  settings.disabled = !(next === 'idle' || next === 'stopped');
  hud.hidden = next !== 'running';
  bodyChip.hidden = next !== 'running';
  busy.hidden = next !== 'starting';
  introTitle.textContent =
    next === 'paused' ? 'Paused' : next === 'stopped' ? 'Test finished' : 'Let’s test your camera';
}

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function readConfig(): Config {
  const pick = (name: string): string => {
    const input = settings.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
    return input?.value ?? '';
  };
  const [w, h] = pick('res').split('x').map(Number);
  return {
    model: pick('model') === 'full' ? 'full' : 'lite',
    delegate: pick('delegate') === 'CPU' ? 'CPU' : 'GPU',
    width: w || 640,
    height: h || 480,
    rate: Number(pick('rate')) || 15,
    facing: pick('facing') === 'environment' ? 'environment' : 'user',
  };
}

// -------------------------------------------------------------------- sound
// iOS only lets a page make sound after a tap, so we create the audio engine
// inside the Start tap and use it later for the "5 minutes done" chime.

let audio: AudioContext | null = null;
function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

function chime(): void {
  if (!audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  [660, 880, 1100].forEach((freq, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    const t = now + i * 0.16;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(audio!.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  });
}

// --------------------------------------------------------------- run timing

function newRun(config: Config): Run {
  return {
    config,
    startedAt: new Date(),
    activeMs: 0,
    segmentStart: 0,
    lastInferAt: 0,
    frames: 0,
    found: 0,
    wholeBody: 0,
    visibilitySum: 0,
    inferTotals: new Totals(),
    inferHistogram: new Histogram(500),
    timeline: new Timeline(30),
    recentMs: new RollingStats(90),
    recentGaps: new RollingStats(45),
    firstInferMs: null,
    trackerLoadMs: 0,
    cameraOpenMs: 0,
    camera: null,
    engineRunning: config.delegate,
    fellBackToCpu: false,
    frameSource: loop.source,
    screenFrames: 0,
    stutters: 0,
    worstGapMs: 0,
    interruptions: 0,
    wakeLock: 'released',
    errors: [],
    fiveMinDone: false,
    consecutiveErrors: 0,
  };
}

/** Running time so far, not counting pauses. */
function activeMs(now = performance.now()): number {
  if (!run) return 0;
  return run.activeMs + (state === 'running' ? now - run.segmentStart : 0);
}

function closeSegment(): void {
  if (run && state === 'running') run.activeMs += performance.now() - run.segmentStart;
}

// --------------------------------------------------------- start and resume

async function getTracker(config: Config): Promise<PoseTracker> {
  const key = `${config.model}/${config.delegate}`;
  if (tracker && trackerKey === key) return tracker;
  tracker?.close();
  tracker = null;
  tracker = await createPoseTracker({ model: config.model, delegate: config.delegate });
  trackerKey = key;
  return tracker;
}

async function timedCamera(config: Config): Promise<{ handle: CameraHandle; ms: number }> {
  const t0 = performance.now();
  const handle = await openCamera(video, {
    facing: config.facing,
    width: config.width,
    height: config.height,
    // Ask the camera for 30 pictures a second; the pacer decides how many we analyse.
    frameRate: 30,
  });
  return { handle, ms: performance.now() - t0 };
}

async function start(): Promise<void> {
  errorBox.hidden = true;
  unlockAudio();
  const config = readConfig();
  run = newRun(config);
  pacer.setTargetFps(config.rate);
  busyText.textContent = 'Starting the camera and loading the tracking brain. The first time downloads about 9 MB.';
  setState('starting');

  // Do both jobs at the same time: the camera permission pop-up appears
  // while the model is still downloading, so nobody waits twice.
  const [cam, trk] = await Promise.allSettled([timedCamera(config), getTracker(config)]);
  if (cam.status === 'rejected' || trk.status === 'rejected') {
    if (cam.status === 'fulfilled') cam.value.handle.stop();
    fail(cam.status === 'rejected' ? cam.reason : (trk as PromiseRejectedResult).reason);
    return;
  }
  camera = cam.value.handle;
  run.cameraOpenMs = cam.value.ms;
  run.trackerLoadMs = trk.value.loadMs;
  run.engineRunning = trk.value.delegate;
  run.fellBackToCpu = trk.value.requested === 'GPU' && trk.value.delegate === 'CPU';
  beginSegment();
}

async function resume(): Promise<void> {
  if (!run) return;
  errorBox.hidden = true;
  busyText.textContent = 'Restarting the camera…';
  setState('starting');
  try {
    camera = (await timedCamera(run.config)).handle;
  } catch (err) {
    fail(err);
    return;
  }
  beginSegment();
}

/** Camera and tracker are ready: start (or continue) measuring. */
function beginSegment(): void {
  if (!run || !camera) return;
  if (document.hidden) {
    // The user left while we were starting. Park, and resume when they return.
    camera.stop();
    camera = null;
    autoResume = true;
    setState('paused');
    return;
  }
  camera.onInterrupted = onCameraLost;
  run.camera = camera.info();
  syncStageShape();
  stage.classList.toggle('mirror', run.config.facing === 'user');
  pacer.reset();
  run.lastInferAt = 0;
  run.segmentStart = performance.now();
  setState('running');
  loop.start();
  startScreenLoop();
  void wakeLock.acquire().then(() => {
    if (run) run.wakeLock = wakeLock.state;
  });
}

function syncStageShape(): void {
  if (video.videoWidth === 0) return;
  stage.style.setProperty('--ar', String(video.videoWidth / video.videoHeight));
  skeleton.resize();
  if (run && camera) run.camera = camera.info();
}

// ------------------------------------------------------------ pause and stop

function releaseCamera(): void {
  loop.stop();
  stopScreenLoop();
  if (camera) {
    camera.onInterrupted = null;
    camera.stop();
    camera = null;
  }
  latestPose = null;
  skeleton.draw(null);
  void wakeLock.release();
}

function pause(resumeAutomatically: boolean): void {
  if (state !== 'running' || !run) return;
  closeSegment();
  run.interruptions++;
  autoResume = resumeAutomatically;
  releaseCamera();
  setState('paused');
  renderReport();
}

function stop(): void {
  if (!run) return;
  closeSegment();
  releaseCamera();
  setState('stopped');
  updateHud(performance.now());
  renderReport();
}

function fail(err: unknown): void {
  const message = err instanceof CameraError ? err.message : `Something went wrong: ${describe(err)}`;
  recordError(describe(err));
  closeSegment();
  releaseCamera();
  setState(run && run.frames > 0 ? 'stopped' : 'idle');
  showError(message);
  renderReport();
}

function onCameraLost(): void {
  // iOS took the camera (phone call, Siri, another app). Do not fight it.
  pause(false);
  toast('The camera was interrupted. Tap Resume when you are ready.', 5000);
}

// ----------------------------------------------------------- the frame loop

function onFrame(now: number): void {
  if (state !== 'running' || !run || !tracker) return;
  if (!pacer.shouldProcess(now)) return;

  const t0 = performance.now();
  let pose: Landmark[] | null;
  try {
    pose = tracker.detect(video, t0);
  } catch (err) {
    onDetectError(err);
    return;
  }
  const ms = performance.now() - t0;
  run.consecutiveErrors = 0;

  if (run.firstInferMs === null) {
    // The very first look includes one-off warm-up work, so we report it
    // separately instead of letting it distort the averages.
    run.firstInferMs = ms;
  } else {
    run.inferTotals.push(ms);
    run.inferHistogram.push(ms);
    run.recentMs.push(ms);
    run.timeline.push(activeMs(t0), ms);
    if (run.lastInferAt) run.recentGaps.push(t0 - run.lastInferAt);
  }
  run.lastInferAt = t0;
  run.frames++;

  if (pose) {
    run.found++;
    run.visibilitySum += averageVisibility(pose);
    if (isWholeBodyVisible(pose)) run.wholeBody++;
  }
  latestPose = pose;
  skeleton.draw(pose);

  if (!run.fiveMinDone && activeMs() >= GOAL_MS) {
    run.fiveMinDone = true;
    chime();
    toast('5 minutes done! Tap Stop, then Copy report.', 8000);
  }
}

function onDetectError(err: unknown): void {
  if (!run || !tracker) return;
  run.consecutiveErrors++;
  recordError(`detect failed: ${describe(err)}`);
  if (tracker.delegate === 'GPU' && run.frames === 0) {
    void switchToCpu();
  } else if (run.consecutiveErrors >= 5) {
    fail(new Error('The tracker kept failing. Please reload the page and try again.'));
  }
}

/** The GPU engine started but cannot analyse frames: swap to CPU, keep the camera. */
async function switchToCpu(): Promise<void> {
  if (!run) return;
  loop.stop();
  stopScreenLoop();
  busyText.textContent = 'The GPU engine did not work here. Switching to the CPU engine…';
  setState('starting');
  try {
    tracker?.close();
    tracker = null;
    tracker = await createPoseTracker({ model: run.config.model, delegate: 'CPU' });
    trackerKey = `${run.config.model}/GPU`; // remember: GPU was asked for, CPU is what works
    run.engineRunning = 'CPU';
    run.fellBackToCpu = true;
    run.consecutiveErrors = 0;
    beginSegment();
  } catch (err) {
    fail(err);
  }
}

// -------------------------------------------------- screen smoothness + HUD
// A light loop that runs once per screen repaint while the test is running.
// It measures how smooth the screen itself stays, and refreshes the numbers
// on screen twice a second. It stops completely when the test stops.

let rafId = 0;
let lastRaf = 0;
let lastHudAt = 0;
let hudFrames = 0;
let screenFps = 0;

function startScreenLoop(): void {
  cancelAnimationFrame(rafId);
  lastRaf = 0;
  lastHudAt = performance.now();
  hudFrames = 0;
  rafId = requestAnimationFrame(screenTick);
}

function stopScreenLoop(): void {
  cancelAnimationFrame(rafId);
  rafId = 0;
}

function screenTick(now: number): void {
  if (state !== 'running' || !run) return;
  rafId = requestAnimationFrame(screenTick);
  if (lastRaf) {
    const gap = now - lastRaf;
    if (gap > STUTTER_MS) run.stutters++;
    if (gap > run.worstGapMs) run.worstGapMs = gap;
  }
  lastRaf = now;
  run.screenFrames++;
  hudFrames++;
  if (now - lastHudAt >= 500) {
    screenFps = (hudFrames * 1000) / (now - lastHudAt);
    hudFrames = 0;
    lastHudAt = now;
    updateHud(now);
  }
}

const m = {
  hudFps: el('hud-fps'),
  hudMs: el('hud-ms'),
  fps: el('m-fps'),
  fpsSub: el('m-fps-sub'),
  ms: el('m-ms'),
  msSub: el('m-ms-sub'),
  cam: el('m-cam'),
  camSub: el('m-cam-sub'),
  engine: el('m-engine'),
  engineSub: el('m-engine-sub'),
  screen: el('m-screen'),
  screenSub: el('m-screen-sub'),
  body: el('m-body'),
  bodySub: el('m-body-sub'),
  angles: el('m-angles'),
  heat: el('m-heat'),
  heatSub: el('m-heat-sub'),
  timer: el('timer-text'),
};

function updateHud(now: number): void {
  if (!run) return;
  const cfg = run.config;
  const isMax = cfg.rate >= 30;

  // Tracking speed
  const gap = run.recentGaps.mean();
  const fps = gap > 0 ? 1000 / gap : 0;
  const fpsText = fps ? fps.toFixed(1) : '–';
  const fpsTone = !fps || isMax ? '' : fps >= cfg.rate * 0.9 ? 'good' : fps >= cfg.rate * 0.66 ? 'warn' : 'bad';
  setText(m.fps, fpsText);
  setTone(m.fps, fpsTone);
  setText(m.fpsSub, isMax ? 'per second · no limit' : `per second · goal ${cfg.rate}`);
  setText(m.hudFps, fps ? String(Math.round(fps)) : '0');
  setTone(m.hudFps, fpsTone === 'good' ? '' : fpsTone);

  // Think time
  const avg = run.recentMs.mean();
  const p95 = run.recentMs.percentile(0.95);
  const budget = 1000 / cfg.rate;
  setText(m.ms, run.recentMs.count ? `${avg.toFixed(0)} ms` : '–');
  setTone(m.ms, !run.recentMs.count ? '' : p95 < budget * 0.6 ? 'good' : p95 < budget ? 'warn' : 'bad');
  setText(m.msSub, run.recentMs.count ? `slowest 5%: ${p95.toFixed(0)} ms` : 'per look');
  setText(m.hudMs, `${avg.toFixed(0)} ms think time`);

  // Camera + engine
  const cam: CameraInfo | null = run.camera;
  setText(m.cam, cam ? `${cam.width}×${cam.height}` : '–');
  setText(m.camSub, cam ? `${cam.frameRate} fps · ${cam.facing === 'user' ? 'front' : 'back'} camera` : 'picture size');
  setText(m.engine, `${run.engineRunning} · ${cfg.model}`);
  setTone(m.engine, run.fellBackToCpu ? 'warn' : '');
  setText(m.engineSub, run.fellBackToCpu ? 'GPU failed, using CPU' : gpu);

  // Screen smoothness
  setText(m.screen, `${Math.round(screenFps)} fps`);
  setText(m.screenSub, `${run.stutters} stutters · worst ${Math.round(run.worstGapMs)} ms`);

  // Body
  const foundPct = run.frames ? (run.found / run.frames) * 100 : 0;
  setText(m.body, run.frames ? `${foundPct.toFixed(0)}%` : '–');
  setText(m.bodySub, run.found ? `confidence ${(run.visibilitySum / run.found).toFixed(2)}` : 'of looks found you');
  const pose = latestPose;
  if (pose) {
    const whole = isWholeBodyVisible(pose);
    setText(bodyChip, whole ? 'Whole body in view ✓' : 'Step back: whole body not in view');
    bodyChip.classList.toggle('good', whole);
    const aspect = cam && cam.height ? cam.width / cam.height : 1;
    const side = bestSide(pose);
    const elbow = elbowAngle(pose, side, aspect);
    const knee = kneeAngle(pose, side, aspect);
    const deg = (v: number | null) => (v === null ? '–' : `${Math.round(v)}°`);
    setText(m.angles, `${deg(elbow)} · ${deg(knee)}`);
  } else {
    setText(bodyChip, 'No person found yet');
    bodyChip.classList.remove('good');
    setText(m.angles, '–');
  }

  // Heat slowdown
  const slow = run.timeline.slowdown();
  if (slow === null) {
    setText(m.heat, '–');
    setTone(m.heat, '');
    setText(m.heatSub, 'needs 2+ minutes');
  } else {
    const pct = Math.round(slow * 100);
    setText(m.heat, `${pct >= 0 ? '+' : ''}${pct}%`);
    setTone(m.heat, pct < 15 ? 'good' : pct < 40 ? 'warn' : 'bad');
    setText(m.heatSub, 'last minute vs first');
  }

  // Timer
  const active = activeMs(now);
  setText(m.timer, formatClock(active));
  progressBar.style.transform = `scaleX(${Math.min(1, active / GOAL_MS).toFixed(3)})`;
}

// ------------------------------------------------------------------- report

function currentReport(): string {
  if (run) {
    run.wakeLock = state === 'running' ? wakeLock.state : run.wakeLock;
    run.frameSource = loop.source;
  }
  return buildReport({
    run: run ? { ...run, activeMs: activeMs() } : null,
    device,
    gpu,
    engineLog,
    wakeLockSupported: wakeLock.supported,
  });
}

function renderReport(): void {
  reportText.value = currentReport();
}

async function copyReport(): Promise<void> {
  const text = currentReport();
  reportText.value = text;
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied! Now paste it into our chat.');
  } catch {
    // Older fallback: select the text so the user can copy it by hand.
    reportText.focus();
    reportText.setSelectionRange(0, text.length);
    toast('Could not copy automatically. The text is selected: tap Copy.');
  }
}

async function shareReport(): Promise<void> {
  const text = currentReport();
  reportText.value = text;
  try {
    await navigator.share({ title: 'Repling camera check', text });
  } catch (err) {
    // AbortError just means the user closed the share sheet.
    if (!(err instanceof Error && err.name === 'AbortError')) void copyReport();
  }
}

// ------------------------------------------------------------------- wiring

mainBtn.addEventListener('click', () => {
  if (state === 'idle' || state === 'stopped') void start();
  else if (state === 'running') stop();
  else if (state === 'paused') void resume();
});

el('copy-btn').addEventListener('click', () => void copyReport());
const shareBtn = el('share-btn');
if (typeof navigator.share === 'function') shareBtn.addEventListener('click', () => void shareReport());
else shareBtn.hidden = true;

// Auto-pause when the app is not on screen (Home button, app switcher, lock).
// A camera left running in the background wastes battery, and iOS would cut
// it off anyway.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause(true);
  } else if (state === 'paused' && autoResume) {
    autoResume = false;
    void resume();
  }
});
window.addEventListener('pagehide', () => pause(true));

// The camera picture changes shape when the phone is rotated.
video.addEventListener('resize', syncStageShape);
// ResizeObserver: "tell me when this box changes size", so the drawing
// canvas is re-measured only when needed instead of on every frame.
new ResizeObserver(() => skeleton.resize()).observe(stage);

const modeChip = el('mode-chip');
if (isStandalone()) {
  modeChip.textContent = 'Home Screen app';
  modeChip.classList.add('good');
}

setState('idle');
renderReport();
