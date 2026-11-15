import { describe, expect, it } from 'vitest';
import { soundReportLines, type SoundResult } from '../src/diag/soundCheck';
import { pickVoice, type VoiceLike } from '../src/platform/sound';

const v = (name: string, lang: string, localService = true, isDefault = false): VoiceLike => ({
  name,
  lang,
  localService,
  default: isDefault,
});

describe('pickVoice', () => {
  it('returns null when there is no English voice', () => {
    expect(pickVoice([v('Amelie', 'fr-FR'), v('Anna', 'de-DE')])).toBeNull();
    expect(pickVoice([])).toBeNull();
  });

  it('prefers the requested accent', () => {
    const voices = [v('Samantha', 'en-US'), v('Daniel', 'en-GB')];
    expect(pickVoice(voices, 'en-GB')?.name).toBe('Daniel');
    expect(pickVoice(voices, 'en-US')?.name).toBe('Samantha');
  });

  it('prefers a natural-sounding enhanced voice over accent', () => {
    const voices = [v('Daniel', 'en-GB'), v('Ava (Enhanced)', 'en-US')];
    expect(pickVoice(voices, 'en-GB')?.name).toBe('Ava (Enhanced)');
  });

  it('prefers voices stored on the phone over internet ones', () => {
    const voices = [v('Cloud Voice', 'en-GB', false), v('Karen', 'en-AU', true)];
    expect(pickVoice(voices, 'en-GB')?.name).toBe('Karen');
  });

  it('understands underscores in language codes (iOS sometimes uses them)', () => {
    expect(pickVoice([v('Samantha', 'en_US'), v('Daniel', 'en_GB')], 'en-GB')?.name).toBe('Daniel');
  });

  it('does not mistake other languages starting with "en" letters', () => {
    expect(pickVoice([v('Eesti', 'et-EE'), v('Moira', 'en-IE')])?.name).toBe('Moira');
  });
});

describe('soundReportLines', () => {
  const info = { sessionSupported: true, speech: true, voices: 40, voice: 'Daniel (en-GB)' };
  const result: SoundResult = {
    title: 'The coach’s voice',
    sound: 'voice',
    modeAsked: 'auto',
    modeGot: 'auto',
    cameraOn: true,
    startDelayMs: 182.4,
    durationMs: 4100,
    error: null,
    looksPerSec: 14.93,
    cameraMutes: 0,
    videoPauses: 0,
    heard: 'Yes, clearly',
    music: 'Got quieter, then came back',
  };

  it('says when nothing has been run', () => {
    expect(soundReportLines(info, [])).toEqual([
      'SOUND CHECK',
      'Music-sharing control: supported · voice: supported, 40 voices, using Daniel (en-GB)',
      'Not run yet.',
    ]);
  });

  it('summarises a result with timing, camera health and the answers', () => {
    const text = soundReportLines(info, [result]).join('\n');
    expect(text).toContain('1. The coach’s voice [auto]');
    expect(text).toContain('started after 182 ms · lasted 4.1 s · camera on: 14.9 looks/sec, muted 0x, video paused 0x');
    expect(text).toContain('heard the app: Yes, clearly · music: Got quieter, then came back');
  });

  it('flags a mode iOS refused, failures, and camera disturbance', () => {
    const bad: SoundResult = {
      ...result,
      title: 'Beeps, “pause” mode',
      modeAsked: 'transient-solo',
      modeGot: 'auto',
      error: 'audio engine is suspended',
      cameraMutes: 2,
      looksPerSec: 3.2,
    };
    const text = soundReportLines(info, [bad]).join('\n');
    expect(text).toContain('[transient-solo (got auto)]');
    expect(text).toContain('FAILED: audio engine is suspended');
    expect(text).toContain('3.2 looks/sec, muted 2x');
  });

  it('reports missing support', () => {
    const text = soundReportLines({ sessionSupported: false, speech: false, voices: 0, voice: '' }, []).join('\n');
    expect(text).toContain('Music-sharing control: NOT supported · voice: NOT supported');
  });
});
