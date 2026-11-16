// The Progress tab: this week, a chart of recent days, form, streak,
// personal records and badges. Charts are drawn as plain SVG shapes: no
// chart library, a few lines each.
import { getState, update } from '../app/store';
import { EXERCISES, type ExerciseId } from '../exercises/library';
import { badgeStatuses, newBadges, type Badge, type Tier } from '../progress/badges';
import { activityCalendar, dailyTotals, formTrend, lifetime, weekSummary } from '../progress/stats';
import { stageFor } from '../world/world';
import { button, icon, toast } from './components';
import { celebrate } from './confetti';
import { formatNumber, h } from './dom';
import { petSvg } from './petArt';
import { shareCard } from './shareCard';

// ------------------------------------------------------------------ charts

function barChart(now: Date): HTMLElement {
  const days = dailyTotals(getState().history, 14, now);
  const max = Math.max(10, ...days.map((d) => d.reps));
  const W = 320;
  const H = 120;
  const slot = W / days.length;
  const bars = days
    .map((d, i) => {
      const height = d.reps === 0 ? 3 : Math.max(6, (d.reps / max) * (H - 30));
      const x = i * slot + slot * 0.2;
      return `<rect x="${x.toFixed(1)}" y="${(H - 20 - height).toFixed(1)}" width="${(slot * 0.6).toFixed(1)}" height="${height.toFixed(1)}" rx="4" fill="${
        d.isToday ? 'var(--accent)' : d.reps ? 'var(--mint-deep)' : 'var(--line)'
      }"/><text x="${(i * slot + slot / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--muted)">${d.letter}</text>`;
    })
    .join('');
  const total = days.reduce((n, d) => n + d.reps, 0);
  return h(
    'div',
    { class: 'card' },
    h('h2', null, 'Last 14 days'),
    h('p', { class: 'muted small' }, `${formatNumber(total)} verified reps. Best day: ${formatNumber(Math.max(...days.map((d) => d.reps)))}.`),
    h('div', { class: 'chart', html: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Reps per day for the last 14 days">${bars}</svg>` }),
  );
}

function formChart(): HTMLElement | null {
  const scores = formTrend(getState().history, 20);
  if (scores.length < 3) return null;
  const W = 320;
  const H = 90;
  // Scores sit between 50 and 100, so that range fills the chart.
  const y = (v: number) => H - 10 - ((Math.max(50, v) - 50) / 50) * (H - 20);
  const x = (i: number) => 8 + (i / (scores.length - 1)) * (W - 16);
  const line = scores.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return h(
    'div',
    { class: 'card' },
    h('h2', null, 'Form'),
    h('p', { class: 'muted small' }, `Average ${avg} out of 100 over your last ${scores.length} sets.`),
    h('div', {
      class: 'chart',
      html: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Form score for recent sets"><path d="M8 ${y(75)}H${W - 8}" stroke="var(--line)" stroke-dasharray="4 5"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x(scores.length - 1)}" cy="${y(scores[scores.length - 1]!)}" r="5" fill="var(--accent)"/></svg>`,
    }),
  );
}

function streakCard(now: Date): HTMLElement {
  const state = getState();
  const cal = activityCalendar(state.history, 5, now);
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Streak'), h('span', { class: 'can-chip' }, icon('fire'), `${state.streak.count} ${state.streak.count === 1 ? 'day' : 'days'}`)),
    h(
      'div',
      { class: 'calendar', role: 'img', 'aria-label': 'Days you trained in the last five weeks' },
      ...['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => h('small', null, d)),
      ...cal.map((c) => h('span', { class: `${c.active ? 'on' : ''} ${c.future ? 'future' : ''} ${c.isToday ? 'today' : ''}` })),
    ),
    h(
      'p',
      { class: 'muted small' },
      `Best: ${Math.max(state.streak.best, state.streak.count)} days. Freezes saved: ${state.streak.freezes} of 2. A freeze covers a missed day by itself, and you earn one every 7 days.`,
    ),
  );
}

// ------------------------------------------------------------------ badges

const TIER: Record<Tier, [string, string]> = { bronze: ['#e0a878', '#a8683a'], silver: ['#e6edf2', '#9aaab8'], gold: ['#ffe08a', '#e0a11e'] };

const GLYPH: Record<Badge['art'], string> = {
  rep: '<path d="M22 32h20M18 26v12M46 26v12M14 29v6M50 29v6" stroke-width="5"/>',
  flame: '<path d="M32 46c-7 0-11-5-11-11 0-6 4-8 6-13 1 3 3 4 5 5 0-6 2-10 6-14 1 7 7 10 7 19 0 9-6 14-13 14z" stroke-width="4"/>',
  calendar: '<rect x="19" y="22" width="26" height="24" rx="5" stroke-width="4"/><path d="M19 30h26M26 18v7M38 18v7" stroke-width="4"/>',
  star: '<path d="M32 17l4.600 9.800 10.700 1.300-7.900 7.300 2.100 10.600L32 40.700 22.500 46l2.100-10.600-7.900-7.300 10.700-1.300z" stroke-width="4"/>',
  leaf: '<path d="M32 48V30M32 34c-8 0-13-4-14-12 9-1 14 4 14 12zM32 30c0-7 4-12 12-13 1 8-4 13-12 13z" stroke-width="4"/>',
  clock: '<circle cx="32" cy="33" r="13" stroke-width="4"/><path d="M32 25v8l6 4" stroke-width="4"/>',
  heart: '<path d="M32 47S18 39 18 29a8 8 0 0 1 14-5 8 8 0 0 1 14 5c0 10-14 18-14 18z" stroke-width="4"/>',
  trophy: '<path d="M24 18h16v9a8 8 0 0 1-16 0zM24 21h-6c0 6 3 9 7 9M40 21h6c0 6-3 9-7 9M32 35v7M25 46h14" stroke-width="4"/>',
};

function medal(badge: Badge, unlocked: boolean): string {
  const [light, dark] = unlocked ? TIER[badge.tier] : ['#55665c', '#3a4a41'];
  const id = `m-${badge.id}`;
  return `<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><circle cx="32" cy="32" r="28" fill="url(#${id})"/><circle cx="32" cy="32" r="22" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2"/><g fill="none" stroke="${unlocked ? '#2b2114' : '#22302a'}" stroke-linecap="round" stroke-linejoin="round" opacity="${unlocked ? 0.85 : 0.6}">${GLYPH[badge.art]}</g></svg>`;
}

function badgesCard(): HTMLElement {
  const statuses = badgeStatuses(getState());
  const got = statuses.filter((s) => s.unlocked).length;
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Badges'), h('span', { class: 'can-chip' }, `${got} of ${statuses.length}`)),
    h(
      'div',
      { class: 'badges' },
      ...statuses.map((s) =>
        h(
          'button',
          {
            class: `badge ${s.unlocked ? 'got' : ''}`,
            type: 'button',
            'aria-label': `${s.badge.name}: ${s.unlocked ? 'earned' : 'not yet earned'}. ${s.badge.how}`,
            onclick: () => toast(s.unlocked ? `${s.badge.name}: ${s.badge.how}` : `${s.badge.how} (${formatNumber(s.have)} of ${formatNumber(s.need)})`, 3800),
          },
          h('span', { html: medal(s.badge, s.unlocked) }),
          h('small', null, s.badge.name),
        ),
      ),
    ),
  );
}

/**
 * If new badges were just earned, mark them as seen and celebrate.
 * Returns them so the caller can list them too.
 */
export function celebrateNewBadges(): Badge[] {
  const fresh = newBadges(getState());
  if (fresh.length === 0) return [];
  update((s) => void s.seenBadges.push(...fresh.map((b) => b.id)), { quiet: true });
  celebrate();
  toast(fresh.length === 1 ? `New badge: ${fresh[0]!.name}!` : `${fresh.length} new badges!`, 4000);
  return fresh;
}

// ----------------------------------------------------------------- records

function recordsCard(): HTMLElement | null {
  const entries = Object.entries(getState().records).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) return null;
  return h(
    'div',
    { class: 'card' },
    h('h2', null, 'Personal records'),
    h('p', { class: 'muted small' }, 'Your best single set of each exercise.'),
    ...entries.map(([key, best]) => {
      const [id, variant] = key.split(':') as [ExerciseId, string];
      const def = EXERCISES[id];
      const name = def ? `${def.name}${variant && variant !== 'standard' ? ` (${variant.replace('-', ' ')})` : ''}` : key;
      return h('div', { class: 'row' }, h('span', null, name), h('strong', null, `${best}${def?.kind === 'hold' ? ' s' : ''}`));
    }),
  );
}

// ----------------------------------------------------------------- the tab

function compare(now: number, before: number): string {
  if (before === 0) return now > 0 ? 'new this week' : 'none yet';
  if (now === before) return 'same as last week';
  return now > before ? `${now - before} more than last week` : `last week: ${before}`;
}

export function progressTab(): HTMLElement {
  const state = getState();
  const now = new Date();
  const { thisWeek, lastWeek } = weekSummary(state, now);
  const life = lifetime(state);
  const stat = (value: string, label: string, note: string) => h('div', { class: 'stat' }, h('strong', null, value), h('small', null, label), h('small', { class: 'stat-note' }, note));

  if (state.history.length === 0) {
    return h(
      'div',
      { class: 'tab-content' },
      h('h1', { class: 'page-title' }, 'Progress'),
      h('div', { class: 'card center-text stack' }, h('p', null, 'Your charts, records and badges will appear here after your first camera-counted set.'), h('p', { class: 'muted small' }, 'Head to Today to begin.')),
      badgesCard(),
    );
  }

  return h(
    'div',
    { class: 'tab-content' },
    h('h1', { class: 'page-title' }, 'Progress'),
    h(
      'div',
      { class: 'card' },
      h('h2', null, 'This week'),
      h(
        'div',
        { class: 'stats tight' },
        stat(String(thisWeek.sessions), thisWeek.sessions === 1 ? 'session' : 'sessions', compare(thisWeek.sessions, lastWeek.sessions)),
        stat(formatNumber(thisWeek.reps), 'verified reps', compare(thisWeek.reps, lastWeek.reps)),
        stat(String(thisWeek.minutes), 'minutes', compare(thisWeek.minutes, lastWeek.minutes)),
        stat(formatNumber(thisWeek.points), 'points earned', compare(thisWeek.points, lastWeek.points)),
      ),
      button('Share my week', {
        block: true,
        variant: 'secondary',
        icon: 'share',
        onClick: () =>
          void shareCard({
            kicker: 'My week',
            title: `${formatNumber(thisWeek.reps)} verified reps`,
            art: state.pet ? petSvg(state.pet.species, stageFor(life.reps), 'cheer', 400) : undefined,
            stats: [
              { value: String(thisWeek.sessions), label: 'sessions' },
              { value: String(thisWeek.minutes), label: 'minutes' },
              { value: String(state.streak.count), label: 'day streak' },
              { value: formatNumber(life.reps), label: 'reps all time' },
            ],
          }),
      }),
    ),
    barChart(now),
    formChart(),
    streakCard(now),
    recordsCard(),
    badgesCard(),
    h(
      'div',
      { class: 'card' },
      h('h2', null, 'All time'),
      h('div', { class: 'row' }, h('span', null, 'Verified reps'), h('strong', null, formatNumber(life.reps))),
      h('div', { class: 'row' }, h('span', null, 'Sets'), h('strong', null, formatNumber(life.sets))),
      h('div', { class: 'row' }, h('span', null, 'Sessions'), h('strong', null, formatNumber(life.sessions))),
      h('div', { class: 'row' }, h('span', null, 'Plank time'), h('strong', null, `${formatNumber(life.plankSeconds)} s`)),
      h('div', { class: 'row' }, h('span', null, 'Exercises tried'), h('strong', null, `${life.exercisesTried} of 12`)),
    ),
  );
}
