// The shareable result card: a picture made on a canvas, then handed to the
// iPhone share sheet. Nothing is uploaded by the app. The picture only goes
// where the user chooses to send it.
import { mascotSvg } from './mascot';
import { toast } from './components';

export interface CardStat {
  value: string;
  label: string;
}

export interface CardContent {
  kicker: string;
  title: string;
  stats: CardStat[];
  /** Art to show at the top, as SVG markup. Defaults to Pip. */
  art?: string;
}

const W = 1080;
const H = 1350;
const FONT = 'ui-rounded, -apple-system, "SF Pro Rounded", "Helvetica Neue", sans-serif';

/** Turn SVG markup into an image the canvas can draw. */
function svgImage(svg: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // The SVG needs its namespace to load as a stand-alone image.
    const markup = svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function drawCard(content: CardContent): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background: the app's deep green, with a soft glow behind the art.
  const bg = ctx.createRadialGradient(W / 2, 360, 60, W / 2, 360, 1000);
  bg.addColorStop(0, '#245240');
  bg.addColorStop(0.55, '#12261d');
  bg.addColorStop(1, '#0a120e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const art = await svgImage(content.art ?? mascotSvg('cheer', 400));
  if (art) {
    const size = 400;
    const ratio = art.height / art.width || 1;
    ctx.drawImage(art, (W - size) / 2, 110, size, size * ratio);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#7cf2b0';
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(content.kicker.toUpperCase(), W / 2, 600);
  ctx.fillStyle = '#eef6f0';
  ctx.font = `800 84px ${FONT}`;
  ctx.fillText(content.title, W / 2, 700, W - 120);

  // Up to four stats in a 2 x 2 grid.
  const stats = content.stats.slice(0, 4);
  const boxW = 440;
  const boxH = 190;
  const gap = 40;
  const left = (W - boxW * 2 - gap) / 2;
  stats.forEach((stat, i) => {
    const x = left + (i % 2) * (boxW + gap);
    const y = 745 + Math.floor(i / 2) * (boxH + gap);
    roundedRect(ctx, x, y, boxW, boxH, 36);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.fill();
    ctx.fillStyle = '#7cf2b0';
    ctx.font = `800 92px ${FONT}`;
    ctx.fillText(stat.value, x + boxW / 2, y + 104, boxW - 40);
    ctx.fillStyle = '#9fb3a8';
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(stat.label, x + boxW / 2, y + 154, boxW - 40);
  });

  ctx.fillStyle = '#eef6f0';
  ctx.font = `800 46px ${FONT}`;
  ctx.fillText('Repling', W / 2, H - 96);
  ctx.fillStyle = '#9fb3a8';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('Every rep counted by camera. No faking.', W / 2, H - 50);
  return canvas;
}

/** Draw the card and open the share sheet (or save the picture if sharing is unavailable). */
export async function shareCard(content: CardContent): Promise<void> {
  try {
    const canvas = await drawCard(content);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('no image');
    const file = new File([blob], 'repling.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Repling', text: `${content.title} on Repling` });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'repling.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast('Picture saved to your downloads.');
  } catch (err) {
    // AbortError just means the share sheet was closed.
    if (!(err instanceof Error && err.name === 'AbortError')) toast('Could not make the picture on this device.');
  }
}
