// What the user can do in the pet-and-garden world: buy, feed, play, plant,
// water, harvest. Each action checks its own rules and changes the save.
// Spending goes through the ledger as a "spend" line. Nothing here can add points.
import { append, balance, lifetimeEarned } from '../economy/ledger';
import type { SaveData } from '../state/save';
import { CAN_CHARGES, ITEM, MAX_PLOTS, PLANTS, type SpeciesId } from './catalog';
import { adopt, applyEffect, canPlay, emptyPlot, fade, grow, playerLevel, progress, waterPlot } from './world';

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };
const no = (message: string): ActionResult => ({ ok: false, message });
const yes = (message: string): ActionResult => ({ ok: true, message });

export function levelOf(state: SaveData): number {
  return playerLevel(lifetimeEarned(state.ledger));
}

/** Bring the pet and every plant up to date. Call when the world is opened. */
export function refreshWorld(state: SaveData, now: Date): void {
  if (state.pet) state.pet = fade(state.pet, now, state.owned.filter((id) => ITEM[id]?.kind === 'decor').length);
  state.plots = state.plots.map((p) => grow(p, now));
}

export function adoptPet(state: SaveData, species: SpeciesId, name: string, now: Date): ActionResult {
  if (state.pet) return no('You already have a pet.');
  state.pet = adopt(species, name, now);
  return yes(`${state.pet.name} has moved in!`);
}

export function buy(state: SaveData, itemId: string, now: Date): ActionResult {
  const item = ITEM[itemId];
  if (!item || item.kind === 'harvest') return no('That is not for sale.');
  if (levelOf(state) < item.minLevel) return no(`Unlocks at level ${item.minLevel}.`);
  const once = item.kind === 'toy' || item.kind === 'decor' || item.kind === 'plot';
  if (once && state.owned.includes(item.id)) return no('You already have this.');
  if (item.kind === 'plot') {
    if (state.plots.length >= MAX_PLOTS) return no('Your garden is full size.');
    // Plots are bought in order: the third before the fourth.
    if (item.id !== `plot-${state.plots.length + 1}`) return no('Buy the earlier plot first.');
  }
  if (balance(state.ledger) < item.price) return no(`You need ${item.price - balance(state.ledger)} more points.`);

  append(state.ledger, { kind: 'spend', amount: -item.price, note: item.name, ref: `shop:${item.id}`, at: now });
  if (item.kind === 'plot') {
    state.plots.push(emptyPlot(now));
    state.owned.push(item.id);
  } else if (once) state.owned.push(item.id);
  else if (item.kind === 'can') state.can = Math.min(60, state.can + CAN_CHARGES);
  else state.inventory[item.id] = (state.inventory[item.id] ?? 0) + 1;
  return yes(`Bought: ${item.name}`);
}

/** Give the pet a food, water, treat or harvest item from the bag. */
export function useItem(state: SaveData, itemId: string, now: Date): ActionResult {
  const item = ITEM[itemId];
  if (!state.pet) return no('Adopt a pet first.');
  if (!item?.effect || item.kind === 'toy') return no('Your pet cannot use that.');
  if ((state.inventory[itemId] ?? 0) <= 0) return no(`You have no ${item.name.toLowerCase()} left.`);
  const pet = fade(state.pet, now, state.owned.length);
  // Do not waste food on a pet that is already full.
  if (item.effect.food && !item.effect.happy && pet.food >= 98) return no(`${pet.name} is full.`);
  if (item.effect.water && !item.effect.happy && pet.water >= 98) return no(`${pet.name} is not thirsty.`);
  state.inventory[itemId]! -= 1;
  if (state.inventory[itemId] === 0) delete state.inventory[itemId];
  state.pet = applyEffect(pet, item.effect);
  return yes(`${pet.name} enjoyed the ${item.name.toLowerCase()}.`);
}

/** Play with the best toy owned. Free, but the pet needs a rest between games. */
export function play(state: SaveData, now: Date): ActionResult {
  if (!state.pet) return no('Adopt a pet first.');
  const toys = state.owned.map((id) => ITEM[id]).filter((i) => i?.kind === 'toy');
  if (toys.length === 0) return no('Buy a toy in the shop first.');
  if (!canPlay(state.pet, now)) return no(`${state.pet.name} is still tired from the last game.`);
  const best = toys.reduce((a, b) => ((b!.effect?.happy ?? 0) > (a!.effect?.happy ?? 0) ? b : a))!;
  state.pet = { ...applyEffect(fade(state.pet, now, state.owned.length), best.effect ?? {}), playedAt: now.toISOString() };
  return yes(`${state.pet.name} loved playing with the ${best.name.toLowerCase()}.`);
}

export function plant(state: SaveData, plotIndex: number, seedId: string, now: Date): ActionResult {
  const plot = state.plots[plotIndex];
  const seed = ITEM[seedId];
  if (!plot) return no('No such plot.');
  if (plot.plant) return no('Something is already growing here.');
  if (!seed?.plant) return no('That is not a seed.');
  if ((state.inventory[seedId] ?? 0) <= 0) return no('You have none of those seeds.');
  state.inventory[seedId]! -= 1;
  if (state.inventory[seedId] === 0) delete state.inventory[seedId];
  state.plots[plotIndex] = { plant: seed.plant, moistUntil: null, grownMs: 0, at: now.toISOString() };
  return yes(`Planted: ${PLANTS[seed.plant].name}. Now give it some water.`);
}

export function water(state: SaveData, plotIndex: number, now: Date): ActionResult {
  const plot = state.plots[plotIndex];
  if (!plot?.plant) return no('Nothing is planted here.');
  if (progress(grow(plot, now)) >= 1) return no('It is ready to harvest.');
  if (plot.moistUntil && Date.parse(plot.moistUntil) - now.getTime() > 6 * 3_600_000) return no('The soil is still wet.');
  if (state.can <= 0) return no('Your watering can is empty. Buy a can of water in the shop.');
  state.can -= 1;
  state.plots[plotIndex] = waterPlot(plot, now);
  return yes('Watered. It will keep growing for 12 hours.');
}

export function harvest(state: SaveData, plotIndex: number, now: Date): ActionResult {
  const plot = state.plots[plotIndex];
  if (!plot?.plant) return no('Nothing is planted here.');
  const grown = grow(plot, now);
  if (progress(grown) < 1) return no('Not ready yet.');
  const p = PLANTS[plot.plant];
  state.inventory[p.gives] = (state.inventory[p.gives] ?? 0) + p.quantity;
  state.plots[plotIndex] = emptyPlot(now);
  return yes(`Harvested ${p.quantity} × ${ITEM[p.gives]!.name.toLowerCase()}!`);
}
