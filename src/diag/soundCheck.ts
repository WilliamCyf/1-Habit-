// The guided Sound check. It answers, on a real iPhone with real music
// playing: can the coach speak and beep without stopping Spotify, and does
// speaking disturb the camera?
//
// Each step plays one kind of sound in one sharing mode, then asks two
// simple questions. The answers go into the copy-paste report.
import {
  audioSessionSupported,
  chosenVoiceName,
  playTones,
  preloadVoices,
  sessionType,
  setSessionType,
  speak,
  speechSupported,
  unlockAudio,
  voiceCount,
  type SessionType,
  type Tone,
} from '../platform/sound';
import { h } from '../ui/dom';

type SoundKind = 'voice' | 'beeps' | 'count';

interface Step {
  id: string;
  sound: SoundKind;
  mode: SessionType;
  title: string;
  about: string;
}

const ALL_STEPS: readonly Step[] = [
  { id: 'voice', sound: 'voice', mode: 'auto', title: 'The coach’s voice', about: 'Pip says one sentence.' },
  { id: 'count', sound: 'count', mode: 'auto', title: 'Counting reps out loud', about: 'Pip counts five reps, like in a real set.' },
  { id: 'beeps', sound: 'beeps', mode: 'auto', title: 'Beeps, normal mode', about: 'Three short beeps.' },
  { id: 'beeps-mix', sound: 'beeps', mode: 'ambient', title: 'Beeps, “mix” mode', about: 'Asks iOS to play beeps alongside your music.' },
  { id: 'beeps-dip', sound: 'beeps', mode: 'transient', title: 'Beeps, “dip” mode', about: 'Asks iOS to lower your music during the beeps.' },
  { id: 'beeps-solo', sound: 'beeps', mode: 'transient-solo', title: 'Beeps, “pause” mode', about: 'Asks iOS to pause your music, beep, then resume it.' },
  { id: 'voice-mix', sound: 'voice', mode: 'ambient', title: 'Voice, “mix” mode', about: 'The same sentence, in mix mode.' },
];

const HEARD = ['Yes, clearly', 'Yes, but quiet', 'No, silent'] as const;
const MUSIC = [
  'Got quieter, then came back',
  'No change, kept playing',
  'Paused, then came back',
  'Stopped and stayed off',
  'No music was playing',
] as const;

const BEEPS: readonly Tone[] = [
  { freq: 660, at: 0, dur: 0.35 },
  { freq: 880, at: 0.9, dur: 0.35 },
  { freq: 1100, at: 1.8, dur: 0.6 },
];

export interface SoundResult {
  title: string;
  sound: SoundKind;
  modeAsked: SessionType;
  modeGot: string;
  cameraOn: boolean;
  startDelayMs: number | null;
  durationMs: number | null;
  error: string | null;
  /** Camera looks per second while the sound played (null if camera was off). */
  looksPerSec: number | null;
  cameraMutes: number;
  videoPauses: number;
  heard: string;
  music: string;
}

/** What the page can tell us about the camera, before and after a sound. */
export interface CameraProbe {
  cameraOn: boolean;
  frames: number;
  mutes: number;
  videoPauses: number;
}

// --------------------------------------------------------------- report text

export function soundReportLines(
  info: { sessionSupported: boolean; speech: boolean; voices: number; voice: string },
  results: readonly SoundResult[],
): string[] {
  const lines = ['SOUND CHECK'];
  lines.push(
    `Music-sharing control: ${info.sessionSupported ? 'supported' : 'NOT supported'} · voice: ${
      info.speech ? `supported, ${info.voices} voices, using ${info.voice}` : 'NOT supported'
    }`,
  );
  if (results.length === 0) {
    lines.push('Not run yet.');
    return lines;
  }
  results.forEach((r, i) => {
    const mode = r.modeAsked === r.modeGot ? r.modeAsked : `${r.modeAsked} (got ${r.modeGot})`;
    const timing =
      r.error !== null
        ? `FAILED: ${r.error}`
        : `${r.startDelayMs === null ? '' : `started after ${Math.round(r.startDelayMs)} ms · `}lasted ${(
            (r.durationMs ?? 0) / 1000
          ).toFixed(1)} s`;
    const camera = r.cameraOn
      ? `camera on: ${r.looksPerSec === null ? 'n/a' : r.looksPerSec.toFixed(1)} looks/sec, muted ${r.cameraMutes}x, video paused ${r.videoPauses}x`
      : 'camera off';
    lines.push(`${i + 1}. ${r.title} [${mode}]`);
    lines.push(`   ${timing} · ${camera}`);
    lines.push(`   heard the app: ${r.heard} · music: ${r.music}`);
  });
  return lines;
}

// ---------------------------------------------------------------- the wizard

export interface SoundCheck {
  results(): readonly SoundResult[];
  reportLines(): string[];
}

export function mountSoundCheck(root: HTMLElement, probe: () => CameraProbe, onChange: () => void): SoundCheck {
  preloadVoices();
  const sessionOk = audioSessionSupported();
  // Without the sharing control, the mode-specific steps would all be the same.
  const steps = ALL_STEPS.filter((s) => (sessionOk ? true : s.mode === 'auto')).filter((s) =>
    speechSupported() ? true : s.sound === 'beeps',
  );
  const results: SoundResult[] = [];
  let index = -1; // -1 = intro screen
  let playing = false;
  let pending: Omit<SoundResult, 'heard' | 'music'> | null = null;
  let heard = '';
  let music = '';

  const info = () => ({ sessionSupported: sessionOk, speech: speechSupported(), voices: voiceCount(), voice: chosenVoiceName() });

  async function play(step: Step): Promise<void> {
    if (playing) return;
    playing = true;
    // Everything up to the first sound call runs inside the tap, which is
    // what iOS requires before a page may make noise.
    unlockAudio();
    const before = probe();
    const set = setSessionType(step.mode);
    const t0 = performance.now();
    draw();

    let startDelayMs: number | null = null;
    let durationMs: number | null = null;
    let error: string | null = set.error;

    if (step.sound === 'beeps') {
      const r = await playTones(BEEPS);
      durationMs = r.durationMs;
      if (!r.ok) error = `audio engine is ${r.contextState}`;
    } else if (step.sound === 'voice') {
      const r = await speak('Rep five. Go a little lower. Nice work! Rest for thirty seconds.');
      startDelayMs = r.startDelayMs;
      durationMs = r.durationMs;
      error = r.error ?? error;
    } else {
      // Count five reps about 1.4 seconds apart, the pace of real push-ups.
      const words = ['One', 'Two', 'Three', 'Four', 'Five'];
      const delays: number[] = [];
      for (const word of words) {
        const turn = performance.now();
        const r = await speak(word, { rate: 1.1 });
        if (r.startDelayMs !== null) delays.push(r.startDelayMs);
        if (r.error) error = r.error;
        const wait = 1400 - (performance.now() - turn);
        if (wait > 0) await new Promise((res) => window.setTimeout(res, wait));
      }
      startDelayMs = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null;
      durationMs = performance.now() - t0;
    }

    const after = probe();
    const seconds = (performance.now() - t0) / 1000;
    pending = {
      title: step.title,
      sound: step.sound,
      modeAsked: step.mode,
      modeGot: sessionOk ? sessionType() : step.mode,
      cameraOn: before.cameraOn && after.cameraOn,
      startDelayMs,
      durationMs,
      error,
      looksPerSec: before.cameraOn && after.cameraOn && seconds > 0 ? (after.frames - before.frames) / seconds : null,
      cameraMutes: after.mutes - before.mutes,
      videoPauses: after.videoPauses - before.videoPauses,
    };
    playing = false;
    draw();
  }

  function next(): void {
    if (pending) {
      results.push({ ...pending, heard, music });
      onChange();
    }
    pending = null;
    heard = '';
    music = '';
    index++;
    if (index >= steps.length) setSessionType('auto');
    draw();
  }

  function answers(label: string, options: readonly string[], current: string, pick: (v: string) => void): HTMLElement {
    return h(
      'div',
      { class: 'sound-q' },
      h('span', { class: 'seg-label wide' }, label),
      h(
        'div',
        { class: 'sound-options', role: 'radiogroup', 'aria-label': label },
        ...options.map((option) =>
          h(
            'button',
            {
              class: 'sound-option',
              type: 'button',
              role: 'radio',
              'aria-checked': String(option === current),
              onclick: () => {
                pick(option);
                draw();
              },
            },
            option,
          ),
        ),
      ),
    );
  }

  function draw(): void {
    root.replaceChildren();
    root.append(h('h3', null, 'Sound check'));

    if (index === -1) {
      root.append(
        h('p', { class: 'hint' }, 'Tests whether the coach can talk and beep while your own music keeps playing.'),
        h(
          'ol',
          { class: 'sound-steps' },
          h('li', null, 'Start a song in Spotify or Musi, then come back here.'),
          h('li', null, 'Turn the ring switch ON (not silent) and the volume up.'),
          h('li', null, 'Best of all: start the camera test above first, so we also learn whether sound disturbs the camera.'),
        ),
        h('button', { class: 'btn secondary', type: 'button', onclick: next }, 'Begin sound check'),
      );
      return;
    }

    if (index >= steps.length) {
      root.append(
        h('p', { class: 'sound-done' }, 'Sound check finished. Thank you!'),
        h('p', { class: 'hint' }, 'Now tap Copy report below and paste it into our chat.'),
        h(
          'button',
          {
            class: 'btn secondary',
            type: 'button',
            onclick: () => {
              results.length = 0;
              index = -1;
              onChange();
              draw();
            },
          },
          'Run it again',
        ),
      );
      return;
    }

    const step = steps[index]!;
    const done = pending !== null;
    root.append(
      h('p', { class: 'sound-count' }, `Test ${index + 1} of ${steps.length}`),
      h('p', { class: 'sound-title' }, step.title),
      h('p', { class: 'hint' }, `${step.about} Listen to what your music does.`),
      h(
        'button',
        { class: `btn ${done ? 'secondary' : ''}`, type: 'button', disabled: playing, onclick: () => void play(step) },
        playing ? 'Playing…' : done ? 'Play again' : 'Play this test',
      ),
    );
    if (done && !playing) {
      if (pending?.error) root.append(h('p', { class: 'error-box' }, `The phone reported: ${pending.error}`));
      root.append(
        answers('Could you hear the app?', HEARD, heard, (v) => void (heard = v)),
        answers('What did your music do?', MUSIC, music, (v) => void (music = v)),
        h(
          'button',
          { class: 'btn', type: 'button', disabled: heard === '' || music === '', onclick: next },
          index === steps.length - 1 ? 'Finish' : 'Next test',
        ),
      );
    }
    root.append(h('button', { class: 'sound-skip', type: 'button', onclick: next }, done ? '' : 'Skip this test'));
  }

  draw();
  return {
    results: () => results,
    reportLines: () => soundReportLines(info(), results),
  };
}
