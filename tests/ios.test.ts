import { describe, expect, it } from 'vitest';
import { browserName } from '../src/platform/ios';

describe('browserName', () => {
  it('recognises Safari on iPhone', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.7 Mobile/15E148 Safari/604.1';
    expect(browserName(ua)).toBe('Safari');
  });

  it('recognises Chrome on iPhone (the browser used in the first real test)', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/157.0.8103.37 Mobile/15E148 Safari/604.1';
    expect(browserName(ua)).toBe('Chrome');
  });

  it('recognises Firefox and Edge on iPhone', () => {
    expect(browserName('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 FxiOS/140.0 Mobile/15E148 Safari/605.1.15')).toBe('Firefox');
    expect(browserName('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 EdgiOS/140.0 Mobile/15E148 Safari/605.1.15')).toBe('Edge');
  });

  it('does not call desktop Chrome "Safari"', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0 Safari/537.36';
    expect(browserName(ua)).toBe('Other');
  });
});
