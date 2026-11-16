// Runs one camera-tracked set from start to finish, for any exercise.
//
// It is the conductor: it owns the camera, the tracker, the pacer, the
// governor and the exercise's detector, and tells the screen what happened
// through callbacks. It contains no drawing code, so the screen file stays
// simple.
//
// A set moves through these phases:
//
//   loading → (check-in) → position → countdown → active → finished
//                              ▲           │         │
//                              └── moved ──┘         └── app hidden → paused → position
//
import { readSkeleton } from '../detectors/joints';
import type { Cue, Detector, HoldEvent, LiveView, RejectEvent, RejectReason, RepEvent } from '../detectors/types';
import { FramePacer } from '../perf/pacer';
import { Governor } from '../perf/governor';
import { RollingStats } from '../perf/stats';
import { WakeLock } from '../platform/ios';
import { CameraError, openCamera, type CameraHandle, type Facing } from '../pose/camera';
import { FrameLoop } from '../pose/frameLoop';
import type { Landmark } from '../pose/landmarks';
import { getSharedTracker } from '../pose/sharedTracker';
import type { PoseTracker } from '../pose/tracker';

export type SetPhase = 'loading' | 'checkin' | 'position' | 'countdown' | 'active' | 'paused' | 'finished' | 'error';
export type EndReason = 'target' | 'time' | 'stopped' | 'left' | 'idle' | 'checkin-failed';

/** Either "do this many" or "do as many as you can in this many seconds". */
export type SetGoal = { kind: 'count'; target: number } | { kind: 'time'; seconds: number };

/** A coach check-in: a gesture only a live person can answer. */
export type CheckIn = 'one-hand' | 'both-hands';

export interface SetSummary {
  /** Verified reps, or valid seconds for a hold. */
  count: number;
  target: number;
  avgScore: number;
  bestScore: number;
  rejected: number;
  rejects: Partial<Record<RejectReason, number>>;
  /** The version actually performed most often. */
  variant: string;
  /** Time spent actually doing the set, pauses not included. */
  durationMs: number;
  endedBy: EndReason;
  /** The tip heard most often, if any. */
  mainCue: Cue | null;
}

export interface SetCallbacks {
  onPhase(phase: SetPhase): void;
  /** Every analysed frame: for the skeleton and the checklist. */
  onFrame(view: LiveView, pose: readonly Landmark[] | null): void;
  onCountdown(secondsLeft: number): void;
  /** A rep was counted, or another second of a hold was completed. */
  onProgress(count: number, event: RepEvent | HoldEvent): void;
  onReject(reject: RejectEvent): void;
  onCue(cue: Cue): void;
  /** Timed sets only: whole seconds remaining. */
  onClock(secondsLeft: number): void;
  onCheckIn(result: 'passed' | 'failed'): void;
  /** The camera picture changed shape (first frame, or the phone was rotated). */
  onLayout(): void;
  onFinish(summary: SetSummary): void;
  onError(message: string): void;
}

export interface SetOptions {
  detector: Detector;
  goal: SetGoal;
  checkIn?: CheckIn | null;
  facing?: Facing;
  /**
   * Development only: supplies made-up poses instead of the real tracker,
   * so the screen can be tested without a person. The published app never
   * sets this (see workout/devSim.ts).
   */
  poseSource?: (tMs: number) => Landmark[] | null;
}

const COUNTDOWN_FROM = 3;
/** End the set if nothing has counted for this long. */
const IDLE_MS = 30_000;
const CHECKIN_TIMEOUT_MS = 20_000;
const CHECKIN_HOLD_MS = 400;

export class SetRunner {
  private phase: SetPhase = 'loading';
  private camera: CameraHandle | null = null;
  private tracker: PoseTracker | null = null;
  private readonly detector: Detector;
  private readonly pacer = new FramePacer(15);
  private readonly governor = new Governor();
  private readonly wakeLock = new WakeLock();
  private readonly loop: FrameLoop;
  private readonly inferStats = new RollingStats(45);
  private readonly gapStats = new RollingStats(30);
  private lastInferAt = 0;

  private readonly reps: RepEvent[] = [];
  private readonly rejects: RejectEvent[] = [];
  private lastHold: HoldEvent | null = null;
  private count = 0;
  private countdownStart = 0;
  private countdownShown = -1;
  private activeMs = 0;
  private activeSince = 0;
  private lastProgressAt = 0;
  private clockShown = -1;
  private disposed = false;
  private errors = 0;
  private lastLightCheck = 0;
  private dark = false;
  private lightCanvas: HTMLCanvasElement | null = null;
  private checkInDone: boolean;
  private checkInStart = 0;
  private checkInSince: number | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly options: SetOptions,
    private readonly cb: SetCallbacks,
  ) {
    this.detector = options.detector;
    this.checkInDone = !options.checkIn;
    this.loop = new FrameLoop(video, (now) => this.onFrame(now));
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    video.addEventListener('resize', this.onVideoResize);
  }

  get isDark(): boolean {
    return this.dark;
  }

  get target(): number {
    return this.options.goal.kind === 'count' ? this.options.goal.target : this.options.goal.seconds;
  }

  /** One line for the hidden debug overlay. */
  get debugText(): string {
    const gap = this.gapStats.mean();
    return `${(gap > 0 ? 1000 / gap : 0).toFixed(1)}/s (goal ${this.governor.fps}) · ${this.inferStats.mean().toFixed(0)} ms · ${this.phase}${
      this.dark ? ' · dark' : ''
    }\n${this.detector.view.debug}`;
  }

  /** Open the camera and the tracker together, then wait for the start position. */
  async start(): Promise<void> {
    this.setPhase('loading');
    const [cam, trk] = await Promise.allSettled([this.openCamera(), getSharedTracker()]);
    if (this.disposed) {
      if (cam.status === 'fulfilled') cam.value.stop();
      return;
    }
    if (cam.status === 'rejected' || trk.status === 'rejected') {
      if (cam.status === 'fulfilled') cam.value.stop();
      this.fail(cam.status === 'rejected' ? cam.reason : (trk as PromiseRejectedResult).reason);
      return;
    }
    this.tracker = trk.value;
    this.attachCamera(cam.value);
    this.beginPositioning();
  }

  /** End the set now (the Stop button). */
  stop(): void {
    this.finish('stopped');
  }

  /** Release everything. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseCamera();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    this.video.removeEventListener('resize', this.onVideoResize);
  }

  // ---------------------------------------------------------------- camera

  private openCamera(): Promise<CameraHandle> {
    return openCamera(this.video, { facing: this.options.facing ?? 'user', width: 640, height: 480, frameRate: 30 });
  }

  private attachCamera(camera: CameraHandle): void {
    this.camera = camera;
    // iOS took the camera (phone call, another app): pause rather than fight it.
    camera.onInterrupted = () => this.pause();
    this.cb.onLayout();
  }

  private releaseCamera(): void {
    this.loop.stop();
    if (this.camera) {
      this.camera.onInterrupted = null;
      this.camera.stop();
      this.camera = null;
    }
    void this.wakeLock.release();
  }

  private readonly onVideoResize = (): void => this.cb.onLayout();

  // ------------------------------------------------------- pause and resume

  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
    else if (this.phase === 'paused') void this.resume();
  };

  private readonly onPageHide = (): void => this.pause();

  /** The app left the screen: camera off straight away, to save battery. */
  private pause(): void {
    if (this.phase === 'finished' || this.phase === 'error' || this.phase === 'paused' || this.phase === 'loading') return;
    this.closeActiveStretch();
    this.detector.stopCounting();
    this.releaseCamera();
    this.setPhase('paused');
  }

  async resume(): Promise<void> {
    if (this.phase !== 'paused' || this.disposed) return;
    this.setPhase('loading');
    try {
      const camera = await this.openCamera();
      if (this.disposed || document.hidden) {
        camera.stop();
        if (!this.disposed) this.setPhase('paused');
        return;
      }
      this.attachCamera(camera);
      // Never resume counting mid-air: the start position must be shown again.
      this.beginPositioning();
    } catch (err) {
      this.fail(err);
    }
  }

  // ---------------------------------------------------------------- phases

  private setPhase(phase: SetPhase): void {
    this.phase = phase;
    this.cb.onPhase(phase);
  }

  private beginPositioning(): void {
    this.pacer.reset();
    this.lastInferAt = 0;
    this.checkInStart = 0;
    this.checkInSince = null;
    this.setPhase(this.checkInDone ? 'position' : 'checkin');
    this.loop.start();
    void this.wakeLock.acquire();
  }

  private closeActiveStretch(): void {
    if (this.phase === 'active') this.activeMs += performance.now() - this.activeSince;
  }

  private finish(endedBy: EndReason): void {
    if (this.phase === 'finished' || this.phase === 'error') return;
    this.closeActiveStretch();
    this.detector.stopCounting();
    this.releaseCamera();
    this.setPhase('finished');
    this.cb.onFinish(this.summary(endedBy));
  }

  private fail(err: unknown): void {
    this.releaseCamera();
    this.setPhase('error');
    const message =
      err instanceof CameraError ? err.message : `Something went wrong: ${err instanceof Error ? err.message : String(err)}`;
    this.cb.onError(message);
  }

  private summary(endedBy: EndReason): SetSummary {
    const rejects: Partial<Record<RejectReason, number>> = {};
    for (const r of this.rejects) rejects[r.reason] = (rejects[r.reason] ?? 0) + 1;
    const cueCounts = new Map<Cue, number>();
    for (const r of this.reps) if (r.cue !== 'nice') cueCounts.set(r.cue, (cueCounts.get(r.cue) ?? 0) + 1);
    const mainCue = [...cueCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const variants = new Map<string, number>();
    for (const r of this.reps) variants.set(r.variant, (variants.get(r.variant) ?? 0) + 1);
    const variant = [...variants.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'standard';
    let avgScore = 0;
    let bestScore = 0;
    if (this.reps.length) {
      const scores = this.reps.map((r) => r.score);
      avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      bestScore = Math.max(...scores);
    } else if (this.lastHold) {
      avgScore = bestScore = this.lastHold.score;
    }
    return {
      count: this.count,
      target: this.target,
      avgScore,
      bestScore,
      rejected: this.rejects.length,
      rejects,
      variant,
      durationMs: Math.round(this.activeMs),
      endedBy,
      mainCue,
    };
  }

  // ------------------------------------------------------------ frame loop

  private onFrame(now: number): void {
    const live = this.phase === 'checkin' || this.phase === 'position' || this.phase === 'countdown' || this.phase === 'active';
    if (!this.tracker || !live) return;
    if (!this.pacer.shouldProcess(now)) return;

    const t0 = performance.now();
    let pose: Landmark[] | null;
    try {
      pose = this.options.poseSource ? this.options.poseSource(t0) : this.tracker.detect(this.video, t0);
      this.errors = 0;
    } catch (err) {
      // One bad frame is not worth ending a set over. Several in a row is.
      if (++this.errors >= 8) this.fail(err);
      return;
    }
    const inferMs = performance.now() - t0;
    this.inferStats.push(inferMs);
    if (this.lastInferAt) this.gapStats.push(t0 - this.lastInferAt);
    this.lastInferAt = t0;
    const newFps = this.governor.push(inferMs, t0);
    if (newFps !== null) this.pacer.setTargetFps(newFps);

    const aspect = this.video.videoHeight ? this.video.videoWidth / this.video.videoHeight : 4 / 3;

    if (this.phase === 'checkin') {
      this.checkLight(t0);
      this.runCheckIn(pose, aspect, t0);
      this.cb.onFrame(this.detector.view, pose);
      return;
    }

    const events = this.detector.update({ t: t0, pose, aspect });
    const view = this.detector.view;

    if (this.phase === 'position') {
      this.checkLight(t0);
      if (view.ready) {
        this.countdownStart = t0;
        this.countdownShown = -1;
        this.setPhase('countdown');
      }
    } else if (this.phase === 'countdown') {
      if (!view.tracking || !view.checks[1]?.ok) {
        // Moved out of position: back to the checklist.
        this.setPhase('position');
      } else {
        const left = COUNTDOWN_FROM - Math.floor((t0 - this.countdownStart) / 1000);
        if (left !== this.countdownShown) {
          this.countdownShown = left;
          this.cb.onCountdown(Math.max(0, left));
        }
        if (left <= 0) {
          this.detector.startCounting();
          this.activeSince = t0;
          this.lastProgressAt = t0;
          this.setPhase('active');
        }
      }
    } else {
      for (const event of events) {
        if (event.type === 'rep') {
          this.reps.push(event);
          this.count = event.count;
          this.lastProgressAt = t0;
          this.cb.onProgress(this.count, event);
        } else if (event.type === 'hold') {
          this.lastHold = event;
          this.count = event.seconds;
          this.lastProgressAt = t0;
          this.cb.onProgress(this.count, event);
        } else if (event.type === 'reject') {
          this.rejects.push(event);
          this.lastProgressAt = t0;
          this.cb.onReject(event);
        } else if (event.type === 'cue') {
          this.cb.onCue(event.cue);
        } else if (event.type === 'left') {
          this.cb.onFrame(view, pose);
          this.finish('left');
          return;
        }
      }
      const goal = this.options.goal;
      if (goal.kind === 'count') {
        if (this.count >= goal.target) {
          this.cb.onFrame(view, pose);
          this.finish('target');
          return;
        }
        if (t0 - this.lastProgressAt > IDLE_MS) {
          this.finish('idle');
          return;
        }
      } else {
        const left = Math.ceil(goal.seconds - (this.activeMs + (t0 - this.activeSince)) / 1000);
        if (left !== this.clockShown) {
          this.clockShown = left;
          this.cb.onClock(Math.max(0, left));
        }
        if (left <= 0) {
          this.cb.onFrame(view, pose);
          this.finish('time');
          return;
        }
      }
    }
    this.cb.onFrame(view, pose);
  }

  /**
   * The coach check-in: wait for a raised hand (or both). A recording of
   * someone else exercising cannot answer a request made at a random moment.
   */
  private runCheckIn(pose: readonly Landmark[] | null, aspect: number, t: number): void {
    if (!this.checkInStart) this.checkInStart = t;
    let ok = false;
    if (pose) {
      const sk = readSkeleton(pose, aspect);
      // "Above the head" = above the nose if we can see it, otherwise well above the shoulder.
      const up = (wrist: typeof sk.left.wrist, shoulder: typeof sk.left.shoulder) =>
        wrist.v >= 0.5 && (sk.nose.v >= 0.5 ? wrist.y < sk.nose.y - 0.02 : shoulder.v >= 0.5 && wrist.y < shoulder.y - 0.12);
      const left = up(sk.left.wrist, sk.left.shoulder);
      const right = up(sk.right.wrist, sk.right.shoulder);
      ok = this.options.checkIn === 'both-hands' ? left && right : left || right;
    }
    if (ok) {
      this.checkInSince ??= t;
      if (t - this.checkInSince >= CHECKIN_HOLD_MS) {
        this.checkInDone = true;
        this.cb.onCheckIn('passed');
        this.setPhase('position');
      }
    } else {
      this.checkInSince = null;
      if (t - this.checkInStart > CHECKIN_TIMEOUT_MS) {
        this.cb.onCheckIn('failed');
        this.finish('checkin-failed');
      }
    }
  }

  /**
   * Once a second while positioning, look at a tiny copy of the picture and
   * measure how bright it is. Dark rooms make tracking unreliable.
   */
  private checkLight(now: number): void {
    if (now - this.lastLightCheck < 1000) return;
    this.lastLightCheck = now;
    try {
      this.lightCanvas ??= document.createElement('canvas');
      const c = this.lightCanvas;
      c.width = 32;
      c.height = 24;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(this.video, 0, 0, 32, 24);
      const data = ctx.getImageData(0, 0, 32, 24).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      this.dark = sum / (data.length / 4) < 45;
    } catch {
      this.dark = false;
    }
  }
}
