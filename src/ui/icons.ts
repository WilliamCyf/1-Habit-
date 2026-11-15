// Small line icons, drawn as SVG paths. "currentColor" means each icon takes
// the colour of the text around it, so they work in light and dark themes.

const wrap = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: wrap('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  chevron: wrap('<path d="M9 5l7 7-7 7"/>'),
  share: wrap('<path d="M12 15V3M8 7l4-4 4 4"/><path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/>'),
  addSquare: wrap('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>'),
  today: wrap('<path d="M12 21c0-6 0-9 0-12"/><path d="M12 13c-4 0-7-2-7.5-6.5C9 6 12 8.5 12 13z"/><path d="M12 11c0-4 2.5-7 7-7.5C19.500 8 16.5 11 12 11z"/>'),
  person: wrap('<circle cx="12" cy="8" r="4"/><path d="M4.500 20.500c1-4 4-6 7.500-6s6.500 2 7.500 6"/>'),
  camera: wrap('<path d="M4 8.500A2.500 2.500 0 0 1 6.500 6h1.700l1.300-2h5l1.300 2h1.700A2.500 2.500 0 0 1 20 8.500v8a2.500 2.500 0 0 1-2.500 2.500h-11A2.500 2.500 0 0 1 4 16.500z"/><circle cx="12" cy="12.500" r="3.500"/>'),
  shield: wrap('<path d="M12 3l7.500 3v5.500c0 4.500-3 8-7.500 9.500-4.500-1.500-7.500-5-7.500-9.500V6z"/><path d="M8.800 12.200l2.300 2.300 4.200-4.400"/>'),
  heart: wrap('<path d="M12 20s-7.500-4.600-7.500-10A4.300 4.300 0 0 1 12 7.200 4.300 4.300 0 0 1 19.500 10c0 5.400-7.500 10-7.500 10z"/>'),
  flame: wrap('<path d="M12 21c-3.600 0-6-2.500-6-6 0-3 2-4.500 3-7 .500 1.500 1.500 2.500 2.500 3 0-3 1-5.500 3-8 .500 4 3.500 5.500 3.500 10.500 0 4.500-2.400 7.500-6 7.500z"/>'),
  bolt: wrap('<path d="M13 3L5 13.500h6L10.500 21 19 10.500h-6z"/>'),
  calendar: wrap('<rect x="4" y="5.500" width="16" height="15" rx="3"/><path d="M4 10.500h16M8.500 3.500v4M15.500 3.500v4"/>'),
  download: wrap('<path d="M12 4v11M7.500 11l4.500 4.500 4.500-4.500M5 20h14"/>'),
  upload: wrap('<path d="M12 16V5M7.500 9L12 4.500 16.500 9M5 20h14"/>'),
  trash: wrap('<path d="M5 7h14M10 7V4.500h4V7M7 7l.800 12a1.500 1.500 0 0 0 1.500 1.400h5.400a1.500 1.500 0 0 0 1.500-1.400L17 7"/>'),
  info: wrap('<circle cx="12" cy="12" r="8.500"/><path d="M12 11v5.500M12 7.700v.100"/>'),
  phone: wrap('<rect x="7" y="3" width="10" height="18" rx="2.500"/><path d="M11 18h2"/>'),
  sparkle: wrap('<path d="M12 4l1.800 4.700L18.500 10.500l-4.700 1.800L12 17l-1.800-4.700L5.500 10.500l4.700-1.800z"/><path d="M19 16l.700 1.800 1.800.700-1.800.700L19 21l-.700-1.800-1.800-.700 1.800-.700z"/>'),
  calculator: wrap('<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8.500 7.500h7M8.500 12h.100M12 12h.100M15.500 12h.100M8.500 16h.100M12 16h.100M15.500 16h.100"/>'),
} as const;

export type IconName = keyof typeof icons;
