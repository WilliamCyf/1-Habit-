// A short burst of confetti for big moments. Deliberately small and brief:
// about 70 pieces on one canvas for 1.6 seconds, then everything is removed.
// It never runs in the background, and is skipped for people who have asked
// their phone to reduce motion.
import { reducedMotion } from './dom';

const COLOURS = ['#7cf2b0', '#ffd166', '#ff7a6b', '#6cc7ff', '#ffffff'];

export function celebrate(): void {
  if (reducedMotion() || document.hidden) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  document.body.appendChild(canvas);
  ctx.scale(dpr, dpr);

  const pieces = Array.from({ length: 70 }, (_x, i) => ({
    x: w / 2 + (Math.random() - 0.5) * 80,
    y: h * 0.42,
    vx: (Math.random() - 0.5) * 11,
    vy: -6 - Math.random() * 9,
    size: 6 + Math.random() * 6,
    spin: Math.random() * 6,
    colour: COLOURS[i % COLOURS.length]!,
  }));
  const start = performance.now();
  const LIFE = 1600;

  function frame(now: number): void {
    const age = now - start;
    if (age > LIFE || document.hidden) {
      canvas.remove();
      return;
    }
    ctx!.clearRect(0, 0, w, h);
    ctx!.globalAlpha = Math.min(1, (LIFE - age) / 400);
    for (const p of pieces) {
      p.vy += 0.35; // gravity
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.spin + age / 120);
      ctx!.fillStyle = p.colour;
      ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx!.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
