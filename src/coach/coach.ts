// The coach's voice and sound effects for a workout.
// Honours the user's settings: voice on/off and sounds on/off.
import type { Cue } from '../detectors/types';
import { audioSessionSupported, playTones, setSessionType, speak, preloadVoices, unlockAudio } from '../platform/sound';
import { CUE_TEXT } from './phrases';
import { SpeechQueue, type LineKind } from './queue';

export interface CoachSettings {
  voice: boolean;
  sound: boolean;
}

export class Coach {
  private readonly queue = new SpeechQueue((text) => speak(text, { rate: 1.08 }));
  private lastCue: Cue | null = null;
  private lastCueRep = -10;

  constructor(private settings: CoachSettings) {
    preloadVoices();
  }

  setSettings(settings: CoachSettings): void {
    this.settings = settings;
  }

  /**
   * Call inside the tap that starts a workout. iOS only allows sound that
   * begins from a tap, so this "opens the door" for everything after it.
   */
  unlock(): void {
    unlockAudio();
    // "ambient" asks iOS to mix our beeps with the user's own music instead
    // of stopping it.
    if (audioSessionSupported()) setSessionType('ambient');
  }

  say(text: string, kind: LineKind = 'info'): void {
    if (this.settings.voice) this.queue.say(text, kind);
  }

  /** A counted rep: a tick, the number, and a form tip if one is needed. */
  rep(count: number, cue: Cue): void {
    if (this.settings.sound) void playTones([{ freq: 880, at: 0, dur: 0.07 }, { freq: 1320, at: 0.07, dur: 0.1 }], 0.22);
    // Do not nag: repeat the same tip at most every third rep.
    const tip = cue !== 'nice' && (cue !== this.lastCue || count - this.lastCueRep >= 3) ? CUE_TEXT[cue].say : '';
    if (tip) {
      this.lastCue = cue;
      this.lastCueRep = count;
    }
    this.say(tip ? `${count}. ${tip}.` : String(count), 'count');
  }

  /** Another stretch of a timed hold done: a soft tick, and the time every 5 seconds. */
  holdSecond(seconds: number, target: number): void {
    if (seconds % 5 !== 0 && seconds !== target) return;
    if (this.settings.sound) void playTones([{ freq: 660, at: 0, dur: 0.08 }], 0.18);
    if (seconds < target) this.say(String(seconds), 'count');
  }

  /** A timed set's clock: speak the milestones only. */
  clock(secondsLeft: number): void {
    if (secondsLeft === 30 || secondsLeft === 10) this.say(`${secondsLeft} seconds`, 'count');
    else if (secondsLeft > 0 && secondsLeft <= 3) {
      if (this.settings.sound) void playTones([{ freq: 784, at: 0, dur: 0.1 }], 0.22);
      this.say(String(secondsLeft), 'count');
    }
  }

  /** A movement that did not count: a soft low tone and the reason. */
  reject(cue: Cue): void {
    if (this.settings.sound) void playTones([{ freq: 196, at: 0, dur: 0.18 }], 0.2);
    this.say(CUE_TEXT[cue].say, 'cue');
  }

  cue(cue: Cue): void {
    this.say(CUE_TEXT[cue].say, 'cue');
  }

  countdown(n: number): void {
    if (this.settings.sound) void playTones([{ freq: n === 0 ? 1175 : 784, at: 0, dur: n === 0 ? 0.35 : 0.12 }], 0.25);
  }

  /** A short pleasant two-note "ding", e.g. when a coach check-in is passed. */
  ding(): void {
    if (this.settings.sound) void playTones([{ freq: 988, at: 0, dur: 0.1 }, { freq: 1319, at: 0.1, dur: 0.18 }], 0.22);
  }

  fanfare(): void {
    if (!this.settings.sound) return;
    void playTones(
      [
        { freq: 784, at: 0, dur: 0.12 },
        { freq: 988, at: 0.12, dur: 0.12 },
        { freq: 1175, at: 0.24, dur: 0.12 },
        { freq: 1568, at: 0.36, dur: 0.4 },
      ],
      0.25,
    );
  }

  quiet(): void {
    this.queue.clear();
  }
}
