// The animated demo figure. Original art: a simple mannequin drawn on a
// canvas from the same push-up model the tests use, so the demo always
// shows exactly the movement the counter expects.
import { pushupJoints, repElbow } from '../detectors/pushupModel';

export interface DemoHandle {
  element: HTMLCanvasElement;
  stop(): void;
}

export function pushupDemo(knees: boolean): DemoHandle {
  const canvas = document.createElement('canvas');
  canvas.className = 'demo-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', knees ? 'Animation of a knee push-up' : 'Animation of a push-up');
  const W = 320;
  const H = 150;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  let raf = 0;
  let stopped = false;
  const started = performance.now();
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function draw(now: number): void {
    if (stopped) return;
    // Stop by itself once the canvas is no longer on the page, or the app
    // is hidden: an animation nobody can see only wastes battery.
    if (!canvas.isConnected && now - started > 500) return;
    if (!document.hidden) {
      const repSec = 2.6;
      const phase = still ? 0.5 : (((now - started) / 1000) % repSec) / repSec;
      const j = pushupJoints({ elbowDeg: repElbow(phase, 166, 82), knees, size: 0.66 });
      const ink = getComputedStyle(canvas).color;
      // Map model space (x 0.1..1.0, y 0.3..0.85) onto the canvas.
      const sx = (x: number) => (x - 0.08) * (W / 0.92) * dpr;
      const sy = (y: number) => (y - 0.32) * (H / 0.52) * dpr;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // the mat
      ctx.strokeStyle = '#ff7a6b';
      ctx.lineCap = 'round';
      ctx.lineWidth = 5 * dpr;
      ctx.beginPath();
      ctx.moveTo(sx(0.12), sy(0.815));
      ctx.lineTo(sx(0.98), sy(0.815));
      ctx.stroke();

      // body: one thick rounded line through the joints
      ctx.strokeStyle = ink;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 13 * dpr;
      ctx.beginPath();
      ctx.moveTo(sx(j.ankle.x), sy(j.ankle.y));
      ctx.lineTo(sx(j.knee.x), sy(j.knee.y));
      ctx.lineTo(sx(j.hip.x), sy(j.hip.y));
      ctx.lineTo(sx(j.shoulder.x), sy(j.shoulder.y));
      ctx.stroke();
      // arm, in the accent colour so the eye follows the elbow
      ctx.strokeStyle = '#4fd693';
      ctx.lineWidth = 10 * dpr;
      ctx.beginPath();
      ctx.moveTo(sx(j.shoulder.x), sy(j.shoulder.y));
      ctx.lineTo(sx(j.elbow.x), sy(j.elbow.y));
      ctx.lineTo(sx(j.wrist.x), sy(j.wrist.y));
      ctx.stroke();
      // head
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(sx(j.head.x), sy(j.head.y), 12 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!still) raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);

  return {
    element: canvas,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
}
