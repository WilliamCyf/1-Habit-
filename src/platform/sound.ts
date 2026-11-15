// Sound on iPhone: beeps, the coach's voice, and sharing the speakers with
// music from other apps (Spotify, Musi and so on).
//
// Two iPhone rules shape this file:
//  1. A page may only make sound after the user has tapped something.
//  2. Only one "audio session" style applies at a time. It decides whether
//     our sound mixes with other apps' music, dips it, or pauses it.

// ------------------------------------------------------------ audio session

/**
 * How our sound should treat music from other apps:
 *  - auto: let iOS decide
 *  - ambient: mix, play alongside the music (obeys the silent switch)
 *  - transient: a short sound over the music, which may dip ("duck")
 *  - transient-solo: pause the music, play, then let it resume (sat-nav style)
 */
export type SessionType = 'auto' | 'ambient' | 'transient' | 'transient-solo' | 'playback';

interface AudioSessionLike {
  type: string;
}

function audioSession(): AudioSessionLike | null {
  return (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession ?? null;
}

export function audioSessionSupported(): boolean {
  return audioSession() !== null;
}

export function sessionType(): string {
  return audioSession()?.type ?? 'unsupported';
}

/** Ask iOS for a sharing style. Returns what is actually set afterwards. */
export function setSessionType(type: SessionType): { ok: boolean; now: string; error: string | null } {
  const session = audioSession();
  if (!session) return { ok: false, now: 'unsupported', error: null };
  try {
    session.type = type;
    return { ok: session.type === type, now: session.type, error: null };
  } catch (err) {
    return { ok: false, now: session.type, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  }
}

// -------------------------------------------------------------------- beeps
// Made with the Web Audio API: sound built from maths (a sine wave at a
// chosen pitch) instead of audio files. Nothing to download.

let context: AudioContext | null = null;

/** Call inside a tap. Creates the audio engine, or wakes it if iOS paused it. */
export function unlockAudio(): AudioContext | null {
  try {
    context ??= new AudioContext();
    if (context.state !== 'running') void context.resume();
  } catch {
    context = null;
  }
  return context;
}

export interface Tone {
  /** Pitch in hertz. 440 is the note A; higher numbers sound higher. */
  freq: number;
  /** Seconds after the start of the pattern. */
  at: number;
  /** Length in seconds. */
  dur: number;
}

export interface ToneResult {
  ok: boolean;
  contextState: string;
  durationMs: number;
}

export function playTones(tones: readonly Tone[], volume = 0.3): Promise<ToneResult> {
  const ctx = unlockAudio();
  if (!ctx) return Promise.resolve({ ok: false, contextState: 'unavailable', durationMs: 0 });
  const start = ctx.currentTime + 0.05;
  let end = 0;
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = start + tone.at;
    osc.frequency.value = tone.freq;
    // Fade in and out over a few milliseconds. A sound that starts or stops
    // instantly makes an ugly click.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + tone.dur + 0.02);
    end = Math.max(end, tone.at + tone.dur);
  }
  const durationMs = end * 1000 + 100;
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ ok: ctx.state === 'running', contextState: ctx.state, durationMs }), durationMs);
  });
}

// -------------------------------------------------------------------- voice
// The Speech Synthesis API: the browser reads text aloud with the phone's
// built-in voices. No recordings, works offline.

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

/**
 * Choose the best English voice. Voices stored on the phone ("local") start
 * faster and work offline. "Enhanced" and "Premium" voices sound more natural.
 */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], preferredLang = 'en-GB'): T | null {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  if (english.length === 0) return null;
  const norm = (lang: string) => lang.replace('_', '-').toLowerCase();
  const score = (v: T): number => {
    let s = 0;
    if (v.localService) s += 4;
    if (/enhanced|premium/i.test(v.name)) s += 3;
    if (norm(v.lang) === norm(preferredLang)) s += 2;
    if (v.default) s += 1;
    return s;
  };
  // Highest score wins; on a tie keep the phone's own order.
  return english.reduce((best, v) => (score(v) > score(best) ? v : best));
}

export function speechSupported(): boolean {
  return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

let voices: SpeechSynthesisVoice[] = [];

/** Voices load in the background on iOS, so we ask early and keep the list. */
export function preloadVoices(): void {
  if (!speechSupported()) return;
  const read = () => {
    const list = window.speechSynthesis.getVoices();
    if (list.length) voices = list;
  };
  read();
  window.speechSynthesis.addEventListener?.('voiceschanged', read);
}

export function voiceCount(): number {
  return voices.length;
}

export function chosenVoiceName(): string {
  const v = pickVoice(voices, navigator.language);
  return v ? `${v.name} (${v.lang})` : 'phone default';
}

export interface SpeakResult {
  ok: boolean;
  /** Time from asking to the voice actually starting. */
  startDelayMs: number | null;
  durationMs: number | null;
  error: string | null;
}

// iOS can drop a speech request if nothing else is holding on to it.
const alive = new Set<SpeechSynthesisUtterance>();

/**
 * Say something. Must be called directly from a tap the first time.
 * The promise settles when the speech ends, fails, or 20 seconds pass.
 */
export function speak(text: string, opts: { rate?: number } = {}): Promise<SpeakResult> {
  if (!speechSupported()) {
    return Promise.resolve({ ok: false, startDelayMs: null, durationMs: null, error: 'speech not supported' });
  }
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(voices, navigator.language);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'en-GB';
    utterance.rate = opts.rate ?? 1.05;
    const asked = performance.now();
    let started: number | null = null;
    let settled = false;
    const finish = (error: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      alive.delete(utterance);
      const now = performance.now();
      resolve({
        ok: error === null && started !== null,
        startDelayMs: started === null ? null : started - asked,
        durationMs: started === null ? null : now - started,
        error: error ?? (started === null ? 'never started' : null),
      });
    };
    utterance.onstart = () => void (started = performance.now());
    utterance.onend = () => finish(null);
    utterance.onerror = (e) => finish(e.error || 'speech error');
    const timer = window.setTimeout(() => finish('timed out'), 20_000);
    alive.add(utterance);
    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      finish(err instanceof Error ? err.message : 'speak failed');
    }
  });
}
