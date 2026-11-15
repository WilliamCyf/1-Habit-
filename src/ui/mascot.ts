// Pip, the coach. Original art, drawn in SVG for this project.
//
// The same drawing is reused everywhere with a different face ("mood"),
// like one puppet with swappable expressions.

export type Mood = 'happy' | 'cheer' | 'think' | 'care';

let nextId = 0;

const FACES: Record<Mood, string> = {
  happy: `
    <g class="pip-eyes">
      <ellipse cx="204" cy="322" rx="20" ry="26" fill="#12241b"/>
      <ellipse cx="308" cy="322" rx="20" ry="26" fill="#12241b"/>
      <circle cx="211" cy="311" r="8" fill="#fff"/>
      <circle cx="315" cy="311" r="8" fill="#fff"/>
    </g>
    <path d="M230 362Q256 386 282 362" fill="none" stroke="#12241b" stroke-width="10" stroke-linecap="round"/>`,
  cheer: `
    <path d="M182 326Q204 296 226 326" fill="none" stroke="#12241b" stroke-width="11" stroke-linecap="round"/>
    <path d="M286 326Q308 296 330 326" fill="none" stroke="#12241b" stroke-width="11" stroke-linecap="round"/>
    <path d="M226 356Q256 402 286 356Z" fill="#12241b"/>
    <path d="M240 376Q256 392 272 376Q256 370 240 376Z" fill="#ff7a6b"/>`,
  think: `
    <g class="pip-eyes">
      <ellipse cx="204" cy="322" rx="20" ry="26" fill="#12241b"/>
      <ellipse cx="308" cy="322" rx="20" ry="26" fill="#12241b"/>
      <circle cx="213" cy="308" r="8" fill="#fff"/>
      <circle cx="317" cy="308" r="8" fill="#fff"/>
    </g>
    <path d="M236 368L276 364" fill="none" stroke="#12241b" stroke-width="10" stroke-linecap="round"/>`,
  care: `
    <g class="pip-eyes">
      <ellipse cx="204" cy="324" rx="19" ry="23" fill="#12241b"/>
      <ellipse cx="308" cy="324" rx="19" ry="23" fill="#12241b"/>
      <circle cx="210" cy="314" r="7" fill="#fff"/>
      <circle cx="314" cy="314" r="7" fill="#fff"/>
    </g>
    <path d="M176 290L226 282M286 282L336 290" fill="none" stroke="#12241b" stroke-width="7" stroke-linecap="round" opacity="0.55"/>
    <path d="M236 366Q256 378 276 366" fill="none" stroke="#12241b" stroke-width="10" stroke-linecap="round"/>`,
};

export function mascotSvg(mood: Mood = 'happy', size = 96): string {
  // Each copy needs its own gradient names, or two Pips on one page would
  // fight over them.
  const id = `pip${nextId++}`;
  const body =
    'M106 312C106 212 170 152 256 152C342 152 406 212 406 312C406 392 350 432 256 432C162 432 106 392 106 312Z';
  return `<svg class="pip" viewBox="60 30 400 430" width="${size}" height="${Math.round(size * 1.075)}" role="img" aria-label="Pip the coach">
  <defs>
    <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6ffd6"/><stop offset="1" stop-color="#4fd693"/></linearGradient>
    <clipPath id="${id}c"><path d="${body}"/></clipPath>
  </defs>
  <ellipse cx="256" cy="448" rx="120" ry="12" fill="#000" opacity="0.16"/>
  <g class="pip-sprout">
    <path d="M256 164C253 136 257 116 262 96" fill="none" stroke="#3fbf7a" stroke-width="13" stroke-linecap="round"/>
    <path d="M260 104C228 104 198 88 190 54C226 48 256 68 260 104Z" fill="#9af5b4"/>
    <path d="M262 100C270 68 298 46 336 48C334 84 304 104 262 100Z" fill="#5ee39a"/>
  </g>
  <ellipse cx="208" cy="432" rx="36" ry="15" fill="#34ad70"/>
  <ellipse cx="304" cy="432" rx="36" ry="15" fill="#34ad70"/>
  <path d="M398 232L446 214L436 246Z" fill="#f2604f"/>
  <path d="M400 240L450 258L420 272Z" fill="#ff7a6b"/>
  <path d="${body}" fill="url(#${id}b)"/>
  <g clip-path="url(#${id}c)">
    <ellipse cx="256" cy="470" rx="170" ry="70" fill="#2f9f66" opacity="0.28"/>
    <path d="M96 236Q256 176 416 236L416 272Q256 212 96 272Z" fill="#ff7a6b"/>
    <path d="M96 236Q256 176 416 236L416 246Q256 186 96 246Z" fill="#ffa193" opacity="0.7"/>
  </g>
  <ellipse cx="166" cy="356" rx="23" ry="13" fill="#ff9382" opacity="0.8"/>
  <ellipse cx="346" cy="356" rx="23" ry="13" fill="#ff9382" opacity="0.8"/>
  ${FACES[mood]}
</svg>`;
}
