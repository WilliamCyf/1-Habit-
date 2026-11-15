/**
 * Calls `onFrame` each time the camera delivers a NEW picture.
 *
 * Safari has a special hook for this, requestVideoFrameCallback: "tell me
 * when the video has a fresh frame". That is better than the usual
 * requestAnimationFrame ("tell me before every screen repaint", 60+ times a
 * second), because the screen repaints more often than the camera produces
 * pictures, and we would be woken up for nothing.
 *
 * The loop only exists while it is running. Stopped means zero work.
 */
export class FrameLoop {
  private running = false;
  private handle = 0;
  private useVideoCallback: boolean;
  private ticks = 0;
  private watchdog = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onFrame: (nowMs: number) => void,
  ) {
    this.useVideoCallback = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get source(): 'video-frame' | 'screen-frame' {
    return this.useVideoCallback ? 'video-frame' : 'screen-frame';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.ticks = 0;
    this.schedule();
    if (this.useVideoCallback) {
      // Safety net (a one-off check, not a repeating timer): if the video
      // hook stays silent for 2.5 seconds, switch to the screen-repaint hook
      // so the app keeps working instead of sitting there doing nothing.
      this.watchdog = window.setTimeout(() => {
        if (!this.running || this.ticks > 0) return;
        console.warn('No video-frame callbacks arrived; falling back to screen frames.');
        this.cancel();
        this.useVideoCallback = false;
        this.schedule();
      }, 2500);
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.watchdog);
    this.cancel();
  }

  private cancel(): void {
    if (this.useVideoCallback) this.video.cancelVideoFrameCallback(this.handle);
    else cancelAnimationFrame(this.handle);
  }

  private schedule(): void {
    this.handle = this.useVideoCallback
      ? this.video.requestVideoFrameCallback(this.tick)
      : requestAnimationFrame(this.tick);
  }

  private readonly tick = (): void => {
    if (!this.running) return;
    // Book the next call first, so one error cannot silently kill the loop.
    this.schedule();
    this.ticks++;
    this.onFrame(performance.now());
  };
}
