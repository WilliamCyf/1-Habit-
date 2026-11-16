// The pets and plants. All original artwork, drawn here as SVG shapes.
//
// Each pet is built from parts: a body for its species, extras that appear
// as it grows up (stage 1 to 3), and a face for its mood. Mixing parts gives
// 4 species x 3 stages x 5 faces = 60 looks from a few dozen lines of drawing.
import type { PlantId, SpeciesId } from '../world/catalog';
import type { Mood } from '../world/world';

export type PetFace = Mood | 'cheer';
type Stage = 1 | 2 | 3;

let nextId = 0;

const INK = '#1d2b24';

function face(mood: PetFace, y = 0): string {
  const eye = (x: number) => `<ellipse cx="${x}" cy="${104 + y}" rx="7" ry="9" fill="${INK}"/><circle cx="${x + 2.500}" cy="${100 + y}" r="2.800" fill="#fff"/>`;
  const cheeks = `<ellipse cx="66" cy="${118 + y}" rx="8" ry="4.500" fill="#ff8f7d" opacity="0.6"/><ellipse cx="134" cy="${118 + y}" rx="8" ry="4.500" fill="#ff8f7d" opacity="0.6"/>`;
  const line = (d: string, w = 4) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round"/>`;
  switch (mood) {
    case 'happy':
      return `<g class="pet-eyes">${eye(82)}${eye(118)}</g>${cheeks}${line(`M90 ${120 + y}Q100 ${130 + y} 110 ${120 + y}`)}`;
    case 'cheer':
      return `${line(`M74 ${107 + y}Q82 ${95 + y} 90 ${107 + y}`)}${line(`M110 ${107 + y}Q118 ${95 + y} 126 ${107 + y}`)}${cheeks}<path d="M88 ${118 + y}Q100 ${138 + y} 112 ${118 + y}Z" fill="${INK}"/>`;
    case 'okay':
      return `<g class="pet-eyes">${eye(82)}${eye(118)}</g>${line(`M92 ${123 + y}Q100 ${127 + y} 108 ${123 + y}`)}`;
    case 'sleepy':
      return `${line(`M75 ${105 + y}Q82 ${111 + y} 89 ${105 + y}`)}${line(`M111 ${105 + y}Q118 ${111 + y} 125 ${105 + y}`)}<ellipse cx="100" cy="${124 + y}" rx="4" ry="5" fill="${INK}"/><text x="140" y="${78 + y}" font-size="18" font-weight="800" fill="${INK}" opacity="0.55" font-family="inherit">z</text><text x="152" y="${62 + y}" font-size="13" font-weight="800" fill="${INK}" opacity="0.4" font-family="inherit">z</text>`;
    case 'sad':
      return `<g class="pet-eyes">${eye(82)}${eye(118)}</g>${line(`M72 ${96 + y}L88 ${90 + y}`, 3.500)}${line(`M128 ${96 + y}L112 ${90 + y}`, 3.500)}${line(`M92 ${127 + y}Q100 ${121 + y} 108 ${127 + y}`)}`;
  }
}

function mossling(stage: Stage, id: string): string {
  const leaf = (x: number, y: number, r: number, c: string) => `<path d="M${x} ${y}q${-9} ${-20} ${0} ${-34}q${9} ${14} ${0} ${34}z" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`;
  const leaves = [
    leaf(60, 100, -50, '#3aa76d'), leaf(74, 82, -28, '#5ec98a'), leaf(92, 72, -10, '#3aa76d'), leaf(110, 72, 10, '#5ec98a'), leaf(128, 82, 28, '#3aa76d'), leaf(142, 100, 50, '#5ec98a'),
    stage >= 2 ? leaf(66, 88, -40, '#8be0a8') + leaf(100, 68, 0, '#8be0a8') + leaf(136, 88, 40, '#8be0a8') : '',
  ].join('');
  const flower = stage === 3 ? `<g transform="translate(100 44)"><circle r="6" cx="0" cy="-9" fill="#ffd166"/><circle r="6" cx="8.500" cy="-3" fill="#ffd166"/><circle r="6" cx="5" cy="7" fill="#ffd166"/><circle r="6" cx="-5" cy="7" fill="#ffd166"/><circle r="6" cx="-8.500" cy="-3" fill="#ffd166"/><circle r="5" fill="#ff7a6b"/></g>` : stage === 2 ? `<circle cx="100" cy="46" r="6" fill="#ffd166"/>` : '';
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf3df"/><stop offset="1" stop-color="#e9d9b4"/></linearGradient></defs>
  ${leaves}${flower}
  <ellipse cx="78" cy="160" rx="13" ry="7" fill="#c9b684"/><ellipse cx="122" cy="160" rx="13" ry="7" fill="#c9b684"/>
  <path d="M52 124C52 90 74 74 100 74C126 74 148 90 148 124C148 150 128 162 100 162C72 162 52 150 52 124Z" fill="url(#${id})"/>
  <ellipse cx="100" cy="113" rx="4" ry="3" fill="#7a5a3a"/>`;
}

function pebblit(stage: Stage, id: string): string {
  const spots = stage >= 2 ? `<path d="M100 62l12 8v14l-12 8l-12-8v-14z" fill="none" stroke="#6f859c" stroke-width="3"/><path d="M70 84l9 6v10l-9 6l-9-6v-10z" fill="none" stroke="#6f859c" stroke-width="3"/><path d="M130 84l9 6v10l-9 6l-9-6v-10z" fill="none" stroke="#6f859c" stroke-width="3"/>` : `<circle cx="84" cy="78" r="6" fill="#7d93aa"/><circle cx="118" cy="72" r="8" fill="#7d93aa"/><circle cx="104" cy="92" r="5" fill="#7d93aa"/>`;
  const crystal = stage === 3 ? `<path d="M100 28l10 16l-10 20l-10-20z" fill="#9ae6ff"/><path d="M100 28l10 16l-10 4z" fill="#d6f6ff"/>` : '';
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b3c4d6"/><stop offset="1" stop-color="#8097ae"/></linearGradient></defs>
  ${crystal}
  <ellipse cx="62" cy="156" rx="15" ry="9" fill="#d9c39a"/><ellipse cx="138" cy="156" rx="15" ry="9" fill="#d9c39a"/>
  <path d="M40 118C40 78 68 54 100 54C132 54 160 78 160 118Z" fill="url(#${id})"/>${spots}
  <path d="M60 104q8-12 22-8" fill="none" stroke="#5ec98a" stroke-width="6" stroke-linecap="round" opacity="0.8"/>
  <path d="M54 124C54 106 74 98 100 98C126 98 146 106 146 124C146 150 128 164 100 164C72 164 54 150 54 124Z" fill="#ecd9b0"/>`;
}

function emberkit(stage: Stage, id: string): string {
  const flame = (x: number, y: number, s: number) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0C-16 -14 -6 -30 0 -44C8 -30 18 -16 0 0Z" fill="#ffd166"/><path d="M0 -4C-8 -12 -3 -20 0 -28C4 -20 9 -12 0 -4Z" fill="#ff7a6b"/></g>`;
  const tail = `<path d="M142 138C170 138 176 112 162 96" fill="none" stroke="#ff9a4d" stroke-width="16" stroke-linecap="round"/>${flame(162, 98, stage === 1 ? 0.7 : 0.95)}${stage === 3 ? flame(176, 112, 0.6) : ''}`;
  const tuft = stage >= 2 ? `<path d="M88 140q12 14 24 0q-4 16-12 18q-8-2-12-18z" fill="#fff1dc"/>` : '';
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb066"/><stop offset="1" stop-color="#f58231"/></linearGradient></defs>
  ${tail}
  <path d="M58 86L52 46L86 70Z" fill="#f58231"/><path d="M142 86L148 46L114 70Z" fill="#f58231"/>
  <path d="M62 78L60 58L78 72Z" fill="#ffd9b8"/><path d="M138 78L140 58L122 72Z" fill="#ffd9b8"/>
  <ellipse cx="80" cy="160" rx="13" ry="7" fill="#c86420"/><ellipse cx="120" cy="160" rx="13" ry="7" fill="#c86420"/>
  <path d="M52 122C52 90 74 72 100 72C126 72 148 90 148 122C148 150 128 162 100 162C72 162 52 150 52 122Z" fill="url(#${id})"/>
  <path d="M74 122C74 110 86 106 100 112C114 106 126 110 126 122C126 138 114 146 100 146C86 146 74 138 74 122Z" fill="#fff1dc"/>${tuft}
  <ellipse cx="100" cy="114" rx="4" ry="3" fill="${INK}"/>`;
}

function puddlo(stage: Stage, id: string): string {
  const fins = `<path d="M54 124q-22-4-26 14q16 4 28-4z" fill="#58b4f5"/><path d="M146 124q22-4 26 14q-16 4-28-4z" fill="#58b4f5"/>${stage >= 2 ? `<path d="M50 112q-18-12-28-2q10 12 28 10z" fill="#8ad3ff"/><path d="M150 112q18-12 28-2q-10 12-28 10z" fill="#8ad3ff"/>` : ''}`;
  const crown = stage === 3 ? `<circle cx="80" cy="46" r="6" fill="#d6f6ff"/><circle cx="100" cy="30" r="8" fill="#d6f6ff"/><circle cx="121" cy="46" r="5" fill="#d6f6ff"/>` : '';
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9adcff"/><stop offset="1" stop-color="#3d94e4"/></linearGradient></defs>
  ${crown}${fins}
  <path d="M100 48C112 66 150 88 150 124C150 150 128 164 100 164C72 164 50 150 50 124C50 88 88 66 100 48Z" fill="url(#${id})"/>
  <path d="M70 108C70 92 82 80 92 74" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.55"/>`;
}

const BODY: Record<SpeciesId, (stage: Stage, id: string) => string> = { mossling, pebblit, emberkit, puddlo };
/** Faces sit a little lower on some body shapes. */
const FACE_Y: Record<SpeciesId, number> = { mossling: 0, pebblit: 18, emberkit: -6, puddlo: 8 };

export function petSvg(species: SpeciesId, stage: Stage, mood: PetFace, size = 160): string {
  const id = `pet${nextId++}`;
  // Younger pets are drawn smaller, growing from the feet upwards.
  const scale = stage === 1 ? 0.8 : stage === 2 ? 0.9 : 1;
  return `<svg class="pet" viewBox="0 0 200 180" width="${size}" height="${Math.round(size * 0.9)}" role="img" aria-label="Your pet">
  <ellipse cx="100" cy="166" rx="${54 * scale}" ry="8" fill="#000" opacity="0.14"/>
  <g transform="translate(100 166) scale(${scale}) translate(-100 -166)">${BODY[species](stage, id)}${face(mood, FACE_Y[species])}</g>
</svg>`;
}

// ------------------------------------------------------------------ plants

const SOIL_DRY = '#8a6a4c';
const SOIL_WET = '#5d4632';

function plantTop(plant: PlantId, stage: number): string {
  const stem = (h: number) => `<path d="M50 78V${78 - h}" stroke="#3aa76d" stroke-width="4" stroke-linecap="round"/>`;
  const leafPair = (y: number, s = 1) => `<path d="M50 ${y}q${-16 * s} ${-2 * s} ${-18 * s} ${-16 * s}q${16 * s} ${-2 * s} ${18 * s} ${16 * s}z" fill="#5ec98a"/><path d="M50 ${y}q${16 * s} ${-2 * s} ${18 * s} ${-16 * s}q${-16 * s} ${-2 * s} ${-18 * s} ${16 * s}z" fill="#3aa76d"/>`;
  if (stage === 0) return `<ellipse cx="50" cy="76" rx="4" ry="3" fill="#e9d9b4"/>`;
  if (stage === 1) return `${stem(10)}${leafPair(68, 0.6)}`;
  if (stage === 2) return `${stem(24)}${leafPair(70, 0.8)}${leafPair(56, 0.7)}`;
  const big = stage === 4;
  switch (plant) {
    case 'carrot':
      return `${leafPair(72, 1)}${leafPair(62, 0.9)}<path d="M50 50v24" stroke="#3aa76d" stroke-width="4" stroke-linecap="round"/>${big ? `<path d="M41 74h18l-3 8h-12z" fill="#ff8a3d"/>` : ''}`;
    case 'sunflower':
      return `${stem(46)}${leafPair(64, 0.9)}<g transform="translate(50 ${big ? 26 : 30})">${Array.from({ length: 10 }, (_x, i) => `<ellipse rx="${big ? 5 : 3.500}" ry="${big ? 11 : 7}" cy="${big ? -13 : -9}" fill="#ffd166" transform="rotate(${i * 36})"/>`).join('')}<circle r="${big ? 8 : 5.500}" fill="#7a5a3a"/></g>`;
    case 'pumpkin':
      return `${leafPair(70, 1)}<path d="M50 70q-10-18 6-22" fill="none" stroke="#3aa76d" stroke-width="3" stroke-linecap="round"/><ellipse cx="${big ? 54 : 56}" cy="${big ? 66 : 70}" rx="${big ? 20 : 11}" ry="${big ? 15 : 9}" fill="#ff8a3d"/><ellipse cx="${big ? 54 : 56}" cy="${big ? 66 : 70}" rx="${big ? 9 : 5}" ry="${big ? 15 : 9}" fill="#ffab66"/>`;
    case 'berry':
      return `<ellipse cx="50" cy="56" rx="26" ry="22" fill="#3aa76d"/><ellipse cx="42" cy="50" rx="13" ry="11" fill="#5ec98a"/>${(big ? [[38, 58], [52, 46], [62, 60], [48, 66], [58, 50], [40, 46]] : [[40, 58], [58, 52]]).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.500" fill="#e8475f"/>`).join('')}`;
  }
}

/** A garden plot: soil, plus whatever is growing. `stage` runs 0 (seed) to 4 (ready). */
export function plotSvg(plant: PlantId | null, stage: number, wet: boolean): string {
  return `<svg viewBox="0 0 100 92" width="100%" role="img" aria-label="${plant ?? 'empty plot'}">
  <ellipse cx="50" cy="80" rx="42" ry="10" fill="${wet ? SOIL_WET : SOIL_DRY}"/>
  <ellipse cx="50" cy="78" rx="36" ry="7" fill="#000" opacity="0.1"/>
  ${plant ? plantTop(plant, stage) : ''}
  ${wet && plant ? `<path d="M22 66q3-6 0-9q-3 3 0 9z" fill="#6cc7ff"/><path d="M80 70q3-6 0-9q-3 3 0 9z" fill="#6cc7ff"/>` : ''}
</svg>`;
}

/** Small drawings of the decorations, shown in the pet's scene. */
export const DECOR_ART: Record<string, string> = {
  lantern: `<svg viewBox="0 0 40 60" width="34"><path d="M20 4v8" stroke="#7a5a3a" stroke-width="3"/><rect x="10" y="12" width="20" height="28" rx="6" fill="#ffd166"/><rect x="14" y="16" width="12" height="20" rx="4" fill="#fff3c4"/><rect x="8" y="38" width="24" height="5" rx="2" fill="#7a5a3a"/></svg>`,
  bench: `<svg viewBox="0 0 70 50" width="56"><rect x="6" y="14" width="58" height="8" rx="3" fill="#b98a5a"/><rect x="6" y="26" width="58" height="7" rx="3" fill="#a3764a"/><path d="M12 33v13M58 33v13" stroke="#7a5a3a" stroke-width="5" stroke-linecap="round"/></svg>`,
  pond: `<svg viewBox="0 0 80 40" width="66"><ellipse cx="40" cy="22" rx="36" ry="14" fill="#58b4f5"/><ellipse cx="34" cy="19" rx="16" ry="5" fill="#9adcff" opacity="0.7"/><path d="M52 24q6-4 10 0q-4 4-10 0z" fill="#ff8a3d"/></svg>`,
  windmill: `<svg viewBox="0 0 60 80" width="46"><path d="M24 78L28 34h4l4 44z" fill="#d9c39a"/><g class="spin" style="transform-origin:30px 32px"><path d="M30 32L30 6l8 4z" fill="#ff7a6b"/><path d="M30 32L56 32l-4 8z" fill="#ffd166"/><path d="M30 32L30 58l-8-4z" fill="#ff7a6b"/><path d="M30 32L4 32l4-8z" fill="#ffd166"/></g><circle cx="30" cy="32" r="4" fill="#7a5a3a"/></svg>`,
};
