// Draws the stick-figure overlay on top of the camera picture.
//
// Speed tricks used here:
//  - ONE canvas, sized once (not every frame).
//  - All bones of one colour are drawn as ONE path with a single stroke()
//    call. Talking to the graphics system is the slow part, so fewer calls
//    is like carrying all the shopping in one trip.
import { BONES, MAJOR_JOINTS, VISIBLE, vis, type Landmark } from './landmarks';

export interface SkeletonStyle {
  good: string;
  weak: string;
  joint: string;
}

const DEFAULT_STYLE: SkeletonStyle = {
  good: '#7cf2b0',
  weak: 'rgba(255, 122, 107, 0.75)',
  joint: '#ffffff',
};

export class SkeletonRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dirty = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly style: SkeletonStyle = DEFAULT_STYLE,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  /**
   * Match the canvas's pixel grid to its on-screen size. Call when the layout
   * changes (start, rotate), NOT every frame: resizing a canvas is expensive.
   */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    // iPhones have 3 real pixels per CSS pixel. Drawing at 2x looks just as
    // sharp for thin lines and fills less than half the pixels of 3x.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.cssW = w;
    this.cssH = h;
    this.dirty = false;
  }

  clear(): void {
    if (!this.dirty) return;
    this.ctx.clearRect(0, 0, this.cssW, this.cssH);
    this.dirty = false;
  }

  draw(pose: readonly Landmark[] | null): void {
    const { ctx, cssW: w, cssH: h } = this;
    ctx.clearRect(0, 0, w, h);
    this.dirty = false;
    if (!pose) return;
    this.dirty = true;

    const line = Math.max(3, Math.round(w / 110));
    ctx.lineWidth = line;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Pass 1: bones where both ends are clearly seen. Pass 2: shaky bones.
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (const [a, b] of BONES) {
        const pa = pose[a];
        const pb = pose[b];
        if (!pa || !pb) continue;
        const confident = Math.min(vis(pa), vis(pb)) >= VISIBLE;
        if (confident !== (pass === 0)) continue;
        ctx.moveTo(pa.x * w, pa.y * h);
        ctx.lineTo(pb.x * w, pb.y * h);
      }
      ctx.strokeStyle = pass === 0 ? this.style.good : this.style.weak;
      ctx.stroke();
    }

    // Joints: one path, one fill.
    const r = line * 0.9;
    ctx.beginPath();
    for (const i of MAJOR_JOINTS) {
      const p = pose[i];
      if (!p || vis(p) < VISIBLE) continue;
      const x = p.x * w;
      const y = p.y * h;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = this.style.joint;
    ctx.fill();
  }
}
