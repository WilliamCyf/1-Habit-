import { describe, expect, it } from 'vitest';
import { cmToFeetInches, feetInchesToCm, formatHeight, formatWeight, kgToLb, lbToKg } from '../src/profile/units';

describe('unit conversion', () => {
  it('converts weight both ways', () => {
    expect(kgToLb(70)).toBeCloseTo(154.32, 1);
    expect(lbToKg(154.32)).toBeCloseTo(70, 1);
  });

  it('converts height both ways', () => {
    expect(cmToFeetInches(178)).toEqual({ feet: 5, inches: 10 });
    expect(feetInchesToCm(5, 10)).toBeCloseTo(177.8, 1);
  });

  it('never shows 12 inches (carries into feet instead)', () => {
    // 182.5 cm is 71.85 in, which rounds to 72 in = 6 ft 0 in, not 5 ft 12 in.
    expect(cmToFeetInches(182.5)).toEqual({ feet: 6, inches: 0 });
  });

  it('formats for display', () => {
    expect(formatHeight(178, 'metric')).toBe('178 cm');
    expect(formatHeight(178, 'imperial')).toBe('5 ft 10 in');
    expect(formatWeight(70.26, 'metric')).toBe('70.3 kg');
    expect(formatWeight(70, 'imperial')).toBe('154 lb');
  });
});
