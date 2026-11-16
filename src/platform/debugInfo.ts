// A short text summary of the app's state, for reporting problems.
// It contains no camera data and no personal details beyond counts.
import { balance, verify } from '../economy/ledger';
import type { SaveData } from '../state/save';
import { browserName, isStandalone } from './ios';

const errors: string[] = [];

export function noteError(message: string): void {
  errors.push(`${new Date().toISOString().slice(11, 19)} ${message}`.slice(0, 200));
  if (errors.length > 12) errors.shift();
}

export function debugInfo(version: string, state: Readonly<SaveData>): string {
  const check = verify(state.ledger);
  return [
    `Repling ${version} · save v${state.version}`,
    `Opened as: ${isStandalone() ? 'Home Screen app' : `${browserName()} tab`}`,
    `Device: ${navigator.userAgent}`,
    `Screen: ${screen.width}x${screen.height} @${window.devicePixelRatio}x · viewport ${window.innerWidth}x${window.innerHeight}`,
    `Sets ${state.history.length} · sessions ${state.sessions.length} · ledger ${state.ledger.length} lines (${check.ok ? 'valid' : `BROKEN at ${check.validCount}`}) · balance ${balance(state.ledger)}`,
    `Streak ${state.streak.count} · pet ${state.pet ? state.pet.species : 'none'} · plots ${state.plots.length}`,
    `Settings: voice ${state.settings.voice ? 'on' : 'off'}, sound ${state.settings.sound ? 'on' : 'off'}, ${state.settings.theme}, ${state.settings.units}`,
    `Errors (${errors.length}):`,
    ...(errors.length ? errors : ['none']),
  ].join('\n');
}
