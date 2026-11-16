// Everything that can be bought, grown or owned, with prices.
// The balancing reasoning is in DECISIONS.md ("Points economy table").

export type ItemKind = 'food' | 'water' | 'treat' | 'seed' | 'can' | 'toy' | 'decor' | 'plot' | 'harvest';

export interface Effect {
  food?: number;
  water?: number;
  happy?: number;
  energy?: number;
}

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  /** Price in points. Harvest items cannot be bought, only grown. */
  price: number;
  /** Player level needed to buy it. */
  minLevel: number;
  blurb: string;
  /** What it does for the pet when used. */
  effect?: Effect;
  /** For seeds: which plant grows. */
  plant?: PlantId;
}

export type PlantId = 'carrot' | 'sunflower' | 'pumpkin' | 'berry';

export interface Plant {
  id: PlantId;
  name: string;
  /** Hours of WATERED time needed to grow. */
  growHours: number;
  /** What a harvest gives, and how many. */
  gives: string;
  quantity: number;
}

export const PLANTS: Record<PlantId, Plant> = {
  carrot: { id: 'carrot', name: 'Carrot', growHours: 10, gives: 'carrot', quantity: 2 },
  sunflower: { id: 'sunflower', name: 'Sunflower', growHours: 20, gives: 'bouquet', quantity: 1 },
  pumpkin: { id: 'pumpkin', name: 'Pumpkin', growHours: 40, gives: 'pumpkin-pie', quantity: 2 },
  berry: { id: 'berry', name: 'Berry bush', growHours: 60, gives: 'berries', quantity: 4 },
};

const item = (id: string, name: string, kind: ItemKind, price: number, minLevel: number, blurb: string, extra: Partial<Item> = {}): Item => ({
  id,
  name,
  kind,
  price,
  minLevel,
  blurb,
  ...extra,
});

export const ITEMS: Item[] = [
  item('berry-snack', 'Berry snack', 'food', 6, 1, 'A light bite.', { effect: { food: 25 } }),
  item('hearty-bowl', 'Hearty bowl', 'food', 16, 1, 'A proper meal.', { effect: { food: 60 } }),
  item('feast', 'Feast', 'food', 34, 2, 'Fills the tummy and lifts the mood.', { effect: { food: 100, happy: 15 } }),
  item('fresh-water', 'Fresh water', 'water', 8, 1, 'A cool bowl of water.', { effect: { water: 70 } }),
  item('spring-water', 'Spring water', 'water', 14, 2, 'The good stuff.', { effect: { water: 100, happy: 5 } }),
  item('crunchy-treat', 'Crunchy treat', 'treat', 12, 1, 'A little reward.', { effect: { happy: 25 } }),
  item('carrot-seed', 'Carrot seeds', 'seed', 10, 1, 'Quick to grow. Makes 2 carrots.', { plant: 'carrot' }),
  item('sunflower-seed', 'Sunflower seed', 'seed', 18, 2, 'Grows into a bouquet your pet loves.', { plant: 'sunflower' }),
  item('pumpkin-seed', 'Pumpkin seed', 'seed', 30, 3, 'Slow, but makes 2 pumpkin pies.', { plant: 'pumpkin' }),
  item('berry-seed', 'Berry bush', 'seed', 45, 5, 'Slowest, and gives 4 handfuls of berries.', { plant: 'berry' }),
  item('can-refill', 'Can of water', 'can', 10, 1, 'Fills your watering can: 6 waterings.'),
  item('ball', 'Bouncy ball', 'toy', 60, 1, 'Play any time your pet is bored.', { effect: { happy: 20 } }),
  item('kite', 'Kite', 'toy', 110, 3, 'More fun than a ball.', { effect: { happy: 30 } }),
  item('drum', 'Little drum', 'toy', 160, 4, 'The most fun of all. Loud.', { effect: { happy: 40 } }),
  item('lantern', 'Lantern', 'decor', 50, 1, 'A warm glow for the garden.'),
  item('bench', 'Garden bench', 'decor', 80, 2, 'Somewhere to sit and watch things grow.'),
  item('pond', 'Little pond', 'decor', 120, 3, 'Your pet likes to look at the fish.'),
  item('windmill', 'Windmill', 'decor', 200, 5, 'Turns slowly in the breeze.'),
  item('plot-3', 'Third garden plot', 'plot', 80, 2, 'Room for one more plant.'),
  item('plot-4', 'Fourth garden plot', 'plot', 150, 3, 'Room for one more plant.'),
  item('plot-5', 'Fifth garden plot', 'plot', 250, 5, 'Room for one more plant.'),
  item('plot-6', 'Sixth garden plot', 'plot', 400, 7, 'Room for one more plant.'),
  // Grown, never bought.
  item('carrot', 'Carrot', 'harvest', 0, 1, 'Home-grown and crunchy.', { effect: { food: 35 } }),
  item('bouquet', 'Sunflower bouquet', 'harvest', 0, 1, 'Brightens the whole day.', { effect: { happy: 40 } }),
  item('pumpkin-pie', 'Pumpkin pie', 'harvest', 0, 1, 'Filling and delicious.', { effect: { food: 70, happy: 10 } }),
  item('berries', 'Berries', 'harvest', 0, 1, 'Sweet little treats.', { effect: { food: 15, happy: 20 } }),
];

export const ITEM: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const START_PLOTS = 2;
export const MAX_PLOTS = 6;
/** One "can of water" gives this many waterings. */
export const CAN_CHARGES = 6;
/** One watering keeps a plant growing for this long. */
export const MOIST_HOURS = 12;

export type SpeciesId = 'mossling' | 'pebblit' | 'emberkit' | 'puddlo';

export const SPECIES: Record<SpeciesId, { name: string; blurb: string }> = {
  mossling: { name: 'Mossling', blurb: 'A leafy little hedgehog. Calm and curious.' },
  pebblit: { name: 'Pebblit', blurb: 'A round stone turtle. Steady and loyal.' },
  emberkit: { name: 'Emberkit', blurb: 'A warm little fox. Playful and quick.' },
  puddlo: { name: 'Puddlo', blurb: 'A soft water sprite. Gentle and cheerful.' },
};
