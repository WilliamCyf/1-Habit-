// The camera workout screen: live picture, skeleton, a rep counter big
// enough to read from across the room, coach cues, and the Stop button.
// All the logic lives in workout/setRunner.ts; this file only shows things.
import { getState, update } from '../app/store';
import { Coach } from '../coach/coach';
import { CUE_TEXT, LINES, REJECT_TEXT } from '../coach/phrases';
import type { RejectReason } from '../detectors/types';
import { SkeletonRenderer } from '../pose/skeleton';
import { MAX_HISTORY } from '../state/save';
import { SetRunner, type SetOptions, type SetPhase, type SetSummary } from '../workout/setRunner';
import { button, icon } from './components';
import { animateIn, h, reducedMotion } from './dom';
import { mascotSvg } from './mascot';

export interface WorkoutOptions {
  target: number;
  /** Called when the screen closes, however it ended. */
  onClose(): void;
}

function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A quick springy "pop", used when the rep number changes. */
function pop(node: HTMLElement): void {
  if (reducedMotion() || typeof node.animate !== 'function') return;
  node.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], {
    duration: 320,
    easing: 'cubic-bezier(0.2, 1.6, 0.4, 1)',
  });
}

export async function openWorkout(options: WorkoutOptions): Promise<void> {
  const settings = getState().settings;
  const coach = new Coach({ voice: settings.voice, sound: settings.sound });
  // We are inside the tap on "Start": the one moment iOS lets us switch sound on.
  coach.unlock();
  coach.say(LINES.loading);

  // ------------------------------------------------------------ elements
  const video = h('video', { class: 'wk-video', playsinline: true, muted: true });
  const canvas = h('canvas', { class: 'wk-canvas' });
  const frame = h('div', { class: 'wk-frame mirror' }, video, canvas);
  const count = h('span', { class: 'wk-count-num' }, '0');
  const countBox = h('div', { class: 'wk-count' }, count, h('span', { class: 'wk-count-of' }, `of ${options.target}`));
  const cue = h('div', { class: 'wk-cue', role: 'status', 'aria-live': 'polite' });
  const pip = h('div', { class: 'wk-pip', html: mascotSvg('happy', 72) });
  const big = h('div', { class: 'wk-big' });
  const checks = {
    seen: h('li', null, 'I can see your whole body'),
    flat: h('li', null, 'Side-on, body flat like a plank'),
    arms: h('li', null, 'Arms straight, hands on the floor'),
  };
  const lightNote = h('p', { class: 'wk-light' }, 'It is quite dark. More light helps me see you.');
  const ring = h('div', { class: 'wk-hold' }, h('div', { class: 'wk-hold-fill' }));
  const positionCard = h(
    'div',
    { class: 'wk-card wk-position' },
    h('strong', null, 'Get into position'),
    h('ul', { class: 'wk-checks' }, checks.seen, checks.flat, checks.arms),
    ring,
    lightNote,
    h('p', { class: 'wk-hint' }, 'Tip: turn the phone sideways and lean it against a wall, about 2 m away.'),
  );
  const loadingCard = h(
    'div',
    { class: 'wk-card wk-loading' },
    h('div', { class: 'spinner' }),
    h('strong', null, 'Getting ready'),
    h('p', { class: 'wk-hint' }, 'Starting the camera. Your video never leaves this phone.'),
  );
  const pausedCard = h('div', { class: 'wk-card wk-paused' }, h('strong', null, 'Paused'), h('p', { class: 'wk-hint' }, 'The camera is off. Come back to carry on.'));
  const debugBox = h('pre', { class: 'wk-debug', hidden: true });
  const stopBtn = h(
    'button',
    { class: 'wk-stop', type: 'button', onclick: () => runner.stop() },
    h('strong', null, 'Stop'),
    h('small', null, 'or if something hurts'),
  );
  const closeBtn = h('button', { class: 'icon-btn wk-close', type: 'button', 'aria-label': 'Close workout', onclick: () => runner.stop() }, icon('close'));
  const stage = h('div', { class: 'wk-stage' }, frame, countBox, pip, cue, big, loadingCard, positionCard, pausedCard, debugBox, closeBtn, stopBtn);
  const root = h('section', { class: 'workout', 'data-phase': 'loading', role: 'dialog', 'aria-label': 'Push-up set' }, stage);
  document.body.appendChild(root);
  animateIn(root, 'up');

  const skeleton = new SkeletonRenderer(canvas);
  let cueTimer = 0;
  let debugTaps = 0;
  let closed = false;

  function showCue(text: string, tone: 'good' | 'warn' = 'warn'): void {
    cue.textContent = text;
    cue.dataset.tone = tone;
    cue.classList.add('show');
    clearTimeout(cueTimer);
    cueTimer = window.setTimeout(() => cue.classList.remove('show'), 2200);
  }

  /**
   * Fit the picture inside the screen without cropping (we must see the
   * whole body), and size the drawing canvas to match it exactly.
   */
  function layout(): void {
    if (!video.videoWidth) return;
    const box = stage.getBoundingClientRect();
    const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
    frame.style.width = `${Math.round(video.videoWidth * scale)}px`;
    frame.style.height = `${Math.round(video.videoHeight * scale)}px`;
    skeleton.resize();
  }
  const resizeWatcher = new ResizeObserver(layout);
  resizeWatcher.observe(stage);

  // Five quick taps on the counter show the hidden debug numbers.
  countBox.addEventListener('click', () => {
    if (++debugTaps >= 5) {
      debugTaps = 0;
      debugBox.hidden = !debugBox.hidden;
    }
  });

  // Development only: "?sim" in the address feeds pretend push-ups. Vite
  // deletes this whole branch from the published app.
  let poseSource: SetOptions['poseSource'];
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('sim')) {
    poseSource = (await import('../workout/devSim')).simulatedPushups();
  }

  const runner = new SetRunner(
    video,
    { target: options.target, poseSource },
    {
      onPhase(phase: SetPhase) {
        root.dataset.phase = phase;
        if (phase === 'position') coach.say(LINES.position);
        if (phase === 'paused') {
          coach.quiet();
          skeleton.draw(null);
        }
      },
      onLayout: layout,
      onFrame(view, pose) {
        skeleton.draw(pose);
        if (root.dataset.phase === 'position') {
          checks.seen.classList.toggle('ok', view.tracking);
          checks.flat.classList.toggle('ok', view.tracking && view.horizontal);
          checks.arms.classList.toggle('ok', view.tracking && view.armsStraight && view.handsDown);
          (ring.firstElementChild as HTMLElement).style.transform = `scaleX(${view.readyProgress.toFixed(2)})`;
          lightNote.classList.toggle('show', runner.isDark);
        }
        if (!debugBox.hidden) {
          const d = runner.debug;
          debugBox.textContent =
            `${d.looksPerSec.toFixed(1)}/s (goal ${d.targetFps}) · ${d.inferMs.toFixed(0)} ms\n` +
            `${d.phase} / ${d.detectorPhase}\n` +
            `elbow ${d.elbow === null ? '-' : d.elbow.toFixed(0)}°  line ${d.line === null ? '-' : d.line.toFixed(0)}°\n` +
            `last reject: ${d.lastReject}${d.dark ? ' · dark' : ''}`;
        }
      },
      onCountdown(left) {
        big.textContent = left > 0 ? String(left) : 'Go!';
        big.classList.add('show');
        pop(big);
        coach.countdown(left);
        coach.say(left > 0 ? String(left) : LINES.go, 'count');
        if (left === 0) window.setTimeout(() => big.classList.remove('show'), 700);
      },
      onRep(rep, target) {
        count.textContent = String(rep.count);
        pop(count);
        pop(pip);
        coach.rep(rep.count, rep.cue);
        showCue(rep.cue === 'nice' ? `Nice rep · form ${rep.score}` : CUE_TEXT[rep.cue].show, rep.cue === 'nice' ? 'good' : 'warn');
        if (rep.count === target - 1 && target >= 4) coach.say(LINES.lastOne, 'cue');
      },
      onReject(reject) {
        coach.reject(reject.cue);
        showCue(REJECT_TEXT[reject.reason].show);
      },
      onCue(c) {
        coach.cue(c);
        showCue(CUE_TEXT[c].show);
      },
      onFinish(summary) {
        coach.quiet();
        if (summary.endedBy === 'target') {
          coach.fanfare();
          coach.say(LINES.targetReached(summary.reps));
        } else {
          coach.say(summary.endedBy === 'left' ? LINES.left : LINES.stopped(summary.reps));
        }
        saveSet(summary);
        showSummary(summary);
      },
      onError(message) {
        root.dataset.phase = 'error';
        stage.replaceChildren(
          h(
            'div',
            { class: 'wk-summary' },
            h('div', { html: mascotSvg('care', 96) }),
            h('h2', null, 'The camera could not start'),
            h('p', { class: 'muted' }, message),
            button('Close', { block: true, onClick: close }),
          ),
        );
      },
    },
  );

  function saveSet(s: SetSummary): void {
    if (s.reps === 0) return; // nothing verified, nothing to record
    update((state) => {
      state.history.push({
        at: new Date().toISOString(),
        exercise: 'pushup',
        variant: s.variant,
        reps: s.reps,
        target: s.target,
        avgScore: s.avgScore,
        bestScore: s.bestScore,
        rejected: s.rejected,
        durationMs: s.durationMs,
      });
      if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);
    });
  }

  function showSummary(s: SetSummary): void {
    const reasons = (Object.entries(s.rejects) as [RejectReason, number][]).sort((a, b) => b[1] - a[1]);
    const headline = s.reps === 0 ? 'No reps counted' : s.endedBy === 'target' ? 'Set complete!' : 'Set finished';
    const view = h(
      'div',
      { class: 'wk-summary' },
      h('div', { class: 'wk-summary-pip', html: mascotSvg(s.reps > 0 ? 'cheer' : 'care', 110) }),
      h('h2', null, headline),
      h('div', { class: 'wk-summary-reps' }, h('strong', null, String(s.reps)), h('span', null, s.reps === 1 ? 'verified rep' : 'verified reps')),
      s.reps > 0
        ? h(
            'div',
            { class: 'stats' },
            h('div', { class: 'stat' }, h('strong', null, String(s.avgScore)), h('small', null, 'average form (of 100)')),
            h('div', { class: 'stat' }, h('strong', null, String(s.bestScore)), h('small', null, 'best rep')),
            h('div', { class: 'stat' }, h('strong', null, formatTime(s.durationMs)), h('small', null, 'time')),
            h('div', { class: 'stat' }, h('strong', null, s.variant === 'knee' ? 'Knees' : 'Toes'), h('small', null, 'push-up style')),
          )
        : h('p', { class: 'muted' }, 'That is fine. Have a look at the tips below and try again when you are ready.'),
      s.mainCue ? h('p', { class: 'notice' }, `Coach’s tip for next time: ${CUE_TEXT[s.mainCue].show.toLowerCase()}.`) : null,
      reasons.length
        ? h(
            'div',
            { class: 'card' },
            h('h3', null, `${s.rejected} ${s.rejected === 1 ? 'movement was' : 'movements were'} not counted`),
            ...reasons.map(([reason, n]) =>
              h('p', { class: 'wk-reason' }, h('strong', null, `${n} × ${REJECT_TEXT[reason].show.replace('Not counted: ', '')}`), h('small', null, REJECT_TEXT[reason].tip)),
            ),
          )
        : null,
      button('Done', { block: true, onClick: close }),
    );
    stage.replaceChildren(view);
    animateIn(view, 'up');
  }

  function close(): void {
    if (closed) return;
    closed = true;
    clearTimeout(cueTimer);
    resizeWatcher.disconnect();
    runner.dispose();
    coach.quiet();
    root.remove();
    options.onClose();
  }

  void runner.start();
}
