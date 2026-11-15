// Converting between metric (cm, kg) and imperial (feet/inches, pounds).
// The app always STORES metric. Imperial is only a way of showing and
// typing numbers. Storing one system avoids rounding drift from converting
// back and forth, like keeping your accounts in one currency.

export type UnitSystem = 'metric' | 'imperial';

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH;
}

export function formatHeight(cm: number, units: UnitSystem): string {
  if (units === 'metric') return `${Math.round(cm)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet} ft ${inches} in`;
}

export function formatWeight(kg: number, units: UnitSystem): string {
  return units === 'metric' ? `${round1(kg)} kg` : `${Math.round(kgToLb(kg))} lb`;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
