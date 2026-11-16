// The World tab: your pet, its needs, your bag, the garden and the shop.
//
// Nothing here runs on a timer. When the tab opens (or the app comes back
// to the front), the pet's needs and the plants are brought up to date from
// the clock, then drawn once.
import { getState, update } from '../app/store';
import { balance, lifetimeEarned } from '../economy/ledger';
import { adoptPet, buy, harvest, levelOf, plant, play, refreshWorld, useItem, water, type ActionResult } from '../world/actions';
import { ITEM, ITEMS, MAX_PLOTS, PLANTS, SPECIES, type Item, type SpeciesId } from '../world/catalog';
import { canPlay, hoursLeft, isThirsty, moodOf, plantStage, pointsForLevel, progress, stageFor, type Mood } from '../world/world';
import { button, icon, openSheet, toast } from './components';
import { formatNumber, h } from './dom';
import type { IconName } from './icons';
import { DECOR_ART, petSvg, plotSvg } from './petArt';
import { celebrateNewBadges } from './progress';

/** Total verified reps so far, which decides how grown-up the pet is. */
export function totalReps(): number {
  return getState().history.reduce((sum, s) => sum + (s.exercise === 'plank' ? 0 : s.reps), 0);
}

function act(result: ActionResult): void {
  toast(result.message, result.ok ? 2600 : 3200);
}

const MOOD_LINE: Record<Mood, (name: string) => string> = {
  happy: (n) => `${n} is happy and full of beans.`,
  okay: (n) => `${n} is doing fine.`,
  sleepy: (n) => `${n} is sleepy. A workout will perk them up.`,
  sad: (n) => `${n} is feeling low. Some food, water or a workout will help.`,
};

// ------------------------------------------------------------- adoption

function adoption(): HTMLElement {
  let chosen: SpeciesId = 'mossling';
  const nameInput = h('input', { class: 'text-input', type: 'text', maxlength: '14', placeholder: 'Give it a name', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'Pet name' });
  const cards = (Object.keys(SPECIES) as SpeciesId[]).map((id) =>
    h(
      'button',
      {
        class: 'pet-choice',
        type: 'button',
        role: 'radio',
        'aria-checked': String(id === chosen),
        onclick: () => {
          chosen = id;
          cards.forEach((c, i) => c.setAttribute('aria-checked', String((Object.keys(SPECIES) as SpeciesId[])[i] === id)));
        },
      },
      h('span', { html: petSvg(id, 1, 'happy', 96) }),
      h('strong', null, SPECIES[id].name),
      h('small', null, SPECIES[id].blurb),
    ),
  );
  return h(
    'div',
    { class: 'tab-content' },
    h('h1', { class: 'page-title' }, 'Choose a companion'),
    h('p', { class: 'muted' }, 'It lives on the points you earn from real, camera-counted exercise. It grows up as you get stronger, and it never comes to harm if you take a break.'),
    h('div', { class: 'pet-choices', role: 'radiogroup', 'aria-label': 'Pet species' }, ...cards),
    nameInput,
    button('Adopt', {
      block: true,
      onClick: () => {
        const now = new Date();
        update((s) => act(adoptPet(s, chosen, nameInput.value, now)));
        celebrateNewBadges();
      },
    }),
  );
}

// ------------------------------------------------------------------ shop

const SHOP_SECTIONS: { title: string; kinds: Item['kind'][] }[] = [
  { title: 'Food and water', kinds: ['food', 'water'] },
  { title: 'Treats and toys', kinds: ['treat', 'toy'] },
  { title: 'Garden', kinds: ['seed', 'can', 'plot'] },
  { title: 'Decorations', kinds: ['decor'] },
];

export function openShop(): void {
  openSheet('Shop', (sheet) => {
    const body = h('div', { class: 'stack' });
    const draw = () => {
      const state = getState();
      const points = balance(state.ledger);
      const level = levelOf(state);
      body.replaceChildren(
        h('p', { class: 'points-line' }, icon('coin'), h('strong', null, formatNumber(points)), ' points · level ', String(level)),
        ...SHOP_SECTIONS.map((section) =>
          h(
            'div',
            { class: 'card list' },
            h('h2', null, section.title),
            ...ITEMS.filter((i) => section.kinds.includes(i.kind)).map((item) => {
              const ownedOnce = (item.kind === 'toy' || item.kind === 'decor' || item.kind === 'plot') && state.owned.includes(item.id);
              const locked = level < item.minLevel;
              const wrongPlot = item.kind === 'plot' && !ownedOnce && item.id !== `plot-${state.plots.length + 1}`;
              const label = ownedOnce ? 'Owned' : locked ? `Level ${item.minLevel}` : String(item.price);
              const have = state.inventory[item.id] ?? 0;
              return h(
                'div',
                { class: 'shop-row' },
                h('span', { class: 'link-text' }, item.name, h('small', null, item.blurb + (have ? ` You have ${have}.` : ''))),
                h(
                  'button',
                  {
                    class: `price-btn ${ownedOnce || locked ? 'off' : ''}`,
                    type: 'button',
                    disabled: ownedOnce || locked || wrongPlot || points < item.price,
                    onclick: () => {
                      update((s) => act(buy(s, item.id, new Date())));
                      draw();
                    },
                  },
                  ownedOnce || locked ? null : icon('coin'),
                  label,
                ),
              );
            }),
          ),
        ),
        h('p', { class: 'muted small center' }, 'Points come only from camera-verified exercise. They cannot be bought.'),
        button('Close', { block: true, variant: 'secondary', onClick: () => sheet.close() }),
      );
    };
    draw();
    return body;
  });
}

// ---------------------------------------------------------------- garden

function openSeedPicker(plotIndex: number): void {
  const state = getState();
  const seeds = ITEMS.filter((i) => i.kind === 'seed' && (state.inventory[i.id] ?? 0) > 0);
  openSheet('Plant a seed', (sheet) =>
    h(
      'div',
      { class: 'stack' },
      seeds.length
        ? h(
            'div',
            { class: 'card list' },
            ...seeds.map((seed) =>
              h(
                'button',
                {
                  class: 'link-row',
                  type: 'button',
                  onclick: () => {
                    update((s) => act(plant(s, plotIndex, seed.id, new Date())));
                    sheet.close();
                  },
                },
                h('span', { class: 'link-text' }, seed.name, h('small', null, `${PLANTS[seed.plant!].growHours} hours of watered time · you have ${state.inventory[seed.id]}`)),
                icon('chevron', 'icon chev'),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'You have no seeds yet. Carrot seeds are cheap and quick to grow.'),
      button('Buy seeds', {
        block: true,
        variant: seeds.length ? 'secondary' : 'primary',
        icon: 'bag',
        onClick: () => {
          sheet.close();
          openShop();
        },
      }),
    ),
  );
}

function garden(): HTMLElement {
  const state = getState();
  const now = new Date();
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Garden'), h('span', { class: 'can-chip' }, icon('drop'), `${state.can} ${state.can === 1 ? 'watering' : 'waterings'}`)),
    h(
      'div',
      { class: 'plots' },
      ...state.plots.map((plot, i) => {
        const stage = plantStage(plot);
        const ready = plot.plant !== null && progress(plot) >= 1;
        const thirsty = isThirsty(plot, now);
        const status = !plot.plant ? 'Tap to plant' : ready ? 'Ready!' : thirsty ? 'Thirsty' : `${Math.ceil(hoursLeft(plot))} h to go`;
        return h(
          'button',
          {
            class: `plot ${ready ? 'ready' : thirsty ? 'thirsty' : ''}`,
            type: 'button',
            'aria-label': `Plot ${i + 1}: ${plot.plant ? PLANTS[plot.plant].name : 'empty'}, ${status}`,
            onclick: () => {
              if (!plot.plant) return openSeedPicker(i);
              const t = new Date();
              if (ready) {
                update((s) => act(harvest(s, i, t)));
                celebrateNewBadges();
              }
              else update((s) => act(water(s, i, t)));
            },
          },
          h('span', { class: 'plot-art', html: plotSvg(plot.plant, stage, !!plot.plant && !thirsty && !ready) }),
          h('small', null, status),
        );
      }),
      state.plots.length < MAX_PLOTS ? h('button', { class: 'plot add', type: 'button', onclick: openShop }, h('span', { class: 'plot-plus' }, '+'), h('small', null, 'More room')) : null,
    ),
    h('p', { class: 'muted small' }, 'Plants only grow while watered. One watering lasts 12 hours. Harvests go into your bag as food for your pet.'),
  );
}

// --------------------------------------------------------------- the pet

function bar(name: IconName, label: string, value: number): HTMLElement {
  const tone = value < 25 ? 'low' : value < 55 ? 'mid' : '';
  return h(
    'div',
    { class: 'need' },
    icon(name),
    h('span', { class: 'need-label' }, label),
    h('div', { class: `need-bar ${tone}`, role: 'meter', 'aria-label': label, 'aria-valuenow': String(Math.round(value)), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('div', { style: `transform:scaleX(${(value / 100).toFixed(3)})` })),
  );
}

function bag(): HTMLElement {
  const state = getState();
  const pet = state.pet!;
  const usable = ITEMS.filter((i) => i.effect && i.kind !== 'toy' && (state.inventory[i.id] ?? 0) > 0);
  const hasToy = state.owned.some((id) => ITEM[id]?.kind === 'toy');
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Your bag'), h('button', { class: 'text-btn', type: 'button', onclick: openShop }, 'Shop')),
    usable.length || hasToy
      ? h(
          'div',
          { class: 'bag' },
          ...usable.map((item) =>
            h(
              'button',
              { class: 'bag-item', type: 'button', onclick: () => update((s) => act(useItem(s, item.id, new Date()))) },
              h('strong', null, item.name),
              h('small', null, `× ${state.inventory[item.id]}`),
            ),
          ),
          hasToy
            ? h('button', { class: 'bag-item play', type: 'button', disabled: !canPlay(pet, new Date()), onclick: () => update((s) => act(play(s, new Date()))) }, h('strong', null, 'Play'), h('small', null, canPlay(pet, new Date()) ? 'with a toy' : 'resting'))
            : null,
        )
      : h('p', { class: 'muted' }, `Your bag is empty. Visit the shop to get ${pet.name} something to eat and drink.`),
  );
}

function petScene(): HTMLElement {
  const state = getState();
  const pet = state.pet!;
  const mood = moodOf(pet);
  const stage = stageFor(totalReps());
  const decor = state.owned.filter((id) => DECOR_ART[id]);
  const petBox = h('div', { class: `pet-box ${mood}`, html: petSvg(pet.species, stage, mood, 190) });
  // A tap on the pet makes it hop: a tiny reward for visiting.
  petBox.addEventListener('click', () => {
    if (typeof petBox.animate === 'function') petBox.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-18px)' }, { transform: 'translateY(0)' }], { duration: 420, easing: 'cubic-bezier(0.3, 1.4, 0.5, 1)' });
  });
  return h(
    'div',
    { class: 'card scene-card' },
    h('div', { class: 'scene' }, h('div', { class: 'scene-decor' }, ...decor.map((id) => h('span', { html: DECOR_ART[id]! }))), petBox),
    h('div', { class: 'pet-name' }, h('strong', null, pet.name), h('small', null, `${SPECIES[pet.species].name} · ${['baby', 'youngster', 'grown-up'][stage - 1]}`)),
    h('p', { class: 'muted center' }, MOOD_LINE[mood](pet.name)),
    h('div', { class: 'needs' }, bar('bag', 'Food', pet.food), bar('drop', 'Water', pet.water), bar('heart', 'Happiness', pet.happy), bar('bolt', 'Energy', pet.energy)),
    stage < 3
      ? h('p', { class: 'muted small center' }, `${pet.name} grows up at ${stage === 1 ? 300 : 1500} verified reps. You have ${formatNumber(totalReps())}.`)
      : null,
  );
}

export function pointsChips(): HTMLElement {
  const state = getState();
  const lifetime = lifetimeEarned(state.ledger);
  const level = levelOf(state);
  const toNext = pointsForLevel(level + 1) - lifetime;
  return h(
    'div',
    { class: 'chips-row' },
    h('span', { class: 'stat-chip' }, icon('coin'), h('strong', null, formatNumber(balance(state.ledger))), 'points'),
    h('span', { class: 'stat-chip', title: `${toNext} points to level ${level + 1}` }, icon('sparkle'), h('strong', null, `Level ${level}`)),
    state.streak.count > 0 ? h('span', { class: 'stat-chip' }, icon('fire'), h('strong', null, String(state.streak.count)), state.streak.count === 1 ? 'day' : 'days') : null,
  );
}

/** Build the World tab. Call `refresh` first so the numbers are current. */
export function worldTab(): HTMLElement {
  const state = getState();
  if (!state.pet) return adoption();
  const view = h(
    'div',
    { class: 'tab-content' },
    h('h1', { class: 'page-title' }, 'World'),
    pointsChips(),
    state.ledgerRepaired
      ? h('p', { class: 'notice' }, 'Your points record did not add up when I checked it, so I restored the last part I could verify.')
      : null,
    petScene(),
    bag(),
    garden(),
    button('Open the shop', { block: true, variant: 'secondary', icon: 'bag', onClick: openShop }),
  );
  return view;
}

/** Bring the pet and plants up to date without redrawing anything. */
export function refreshWorldNow(): void {
  update((s) => refreshWorld(s, new Date()), { quiet: true });
}
