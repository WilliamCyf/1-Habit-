// The animated demo figures. Original art: a simple mannequin drawn on a
// canvas from the same stick-figure models the tests use, so each demo
// shows exactly the movement its counter expects.
import type { ExerciseDef, Level } from '../exercises/library';
import type { Body, Limbs } from '../exercises/models';

export interface DemoHandle {
  element: HTMLCanvasElement;
  stop(): void;
}

const W = 320;
const H = 190;

function drawBody(ctx: CanvasRenderingContext2D, body: Body, ink: string, dpr: number): void {
  // Model space: y from about 0.24 (head) to 0.90 (floor). One scale for both
  // directions, so the figure is not stretched.
  const scale = (H / 0.7) * dpr;
  const offsetX = (W * dpr - 1.0 * scale) / 2 + (body.view === 'side' ? -0.02 * scale : 0);
  const sx = (x: number) => offsetX + x * scale;
  const sy = (y: number) => (y - 0.22) * scale;
  ctx.clearRect(0, 0, W * dpr, H * dpr);

  // the mat
  ctx.strokeStyle = '#ff7a6b';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5 * dpr;
  ctx.beginPath();
  ctx.moveTo(sx(body.view === 'side' ? 0.1 : 0.25), sy(0.885));
  ctx.lineTo(sx(body.view === 'side' ? 0.92 : 0.75), sy(0.885));
  ctx.stroke();

  const limb = (l: Limbs, colour: string, armColour: string, width: number) => {
    ctx.lineWidth = width * dpr;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.moveTo(sx(l.ankle.x), sy(l.ankle.y));
    ctx.lineTo(sx(l.knee.x), sy(l.knee.y));
    ctx.lineTo(sx(l.hip.x), sy(l.hip.y));
    ctx.stroke();
    ctx.strokeStyle = armColour;
    ctx.lineWidth = (width - 2) * dpr;
    ctx.beginPath();
    ctx.moveTo(sx(l.shoulder.x), sy(l.shoulder.y));
    ctx.lineTo(sx(l.elbow.x), sy(l.elbow.y));
    ctx.lineTo(sx(l.wrist.x), sy(l.wrist.y));
    ctx.stroke();
  };

  if (body.view === 'side') {
    // Far side first and fainter, so it sits "behind" the near side.
    ctx.globalAlpha = 0.38;
    limb(body.far, ink, ink, 9);
    ctx.globalAlpha = 1;
  }
  // torso
  const shoulder = body.view === 'front' ? { x: (body.near.shoulder.x + body.far.shoulder.x) / 2, y: body.near.shoulder.y } : body.near.shoulder;
  const hip = body.view === 'front' ? { x: (body.near.hip.x + body.far.hip.x) / 2, y: body.near.hip.y } : body.near.hip;
  ctx.strokeStyle = ink;
  ctx.lineWidth = (body.view === 'front' ? 22 : 12) * dpr;
  ctx.beginPath();
  ctx.moveTo(sx(hip.x), sy(hip.y));
  ctx.lineTo(sx(shoulder.x), sy(shoulder.y));
  ctx.stroke();
  limb(body.near, ink, '#4fd693', 11);
  if (body.view === 'front') limb(body.far, ink, '#4fd693', 11);
  // head
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(sx(body.head.x), sy(body.head.y), 11 * dpr, 0, Math.PI * 2);
  ctx.fill();
}

/** An endlessly looping demo of one exercise at one level. */
export function exerciseDemo(def: ExerciseDef, level: Level): DemoHandle {
  const canvas = document.createElement('canvas');
  canvas.className = 'demo-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Animation of the ${def.versions[level - 1]!.name.toLowerCase()}`);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  let raf = 0;
  let stopped = false;
  const started = performance.now();
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Show the demo a little slower than real life, so it is easy to follow.
  const repSec = Math.max(1.6, def.repSec(level) * 1.15);

  function frame(now: number): void {
    if (stopped) return;
    // Stop by itself once the canvas has left the page: an animation nobody
    // can see only wastes battery.
    if (!canvas.isConnected && now - started > 600) return;
    if (!document.hidden) {
      const phase = still ? 0.5 : (((now - started) / 1000) % repSec) / repSec;
      drawBody(ctx, def.body(def.kind === 'hold' ? 0 : phase, level), getComputedStyle(canvas).color, dpr);
    }
    if (!still) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    element: canvas,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
}
