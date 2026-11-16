// The camera workout screen: live picture, skeleton, a counter big enough
// to read from across the room, coach cues, and the Stop button. It works
// for every exercise. All the logic lives in workout/setRunner.ts; this
// file only shows things and speaks.
import { getState, update } from '../app/store';
import { Coach } from '../coach/coach';
import { CUE_TEXT, LINES, REJECT_TEXT, rejectLine } from '../coach/phrases';
import type { RejectReason } from '../detectors/types';
import { placement, unit, type ExerciseDef, type Level } from '../exercises/library';
import { SkeletonRenderer } from '../pose/skeleton';
import { MAX_HISTORY } from '../state/save';
import { SetRunner, type CheckIn, type SetGoal, type SetOptions, type SetPhase, type SetSummary } from '../workout/setRunner';
import { button, icon } from './components';
import { animateIn, h, reducedMotion } from './dom';
import { mascotSvg } from './mascot';

export interface WorkoutOptions {
  def: ExerciseDef;
  level: Level;
  goal: SetGoal;
  /**
   * practice: a single set, ending with a summary screen.
   * session: one set inside a longer session; closes itself straight away.
   */
  mode: 'practice' | 'session';
  checkIn?: CheckIn | null;
  /** Shown small above the exercise name, e.g. "Set 2 of 3". */
  label?: string;
  /** Share the session's coach so speech does not overlap. */
  coach?: Coach;
  /** Called when the screen closes. Null means the camera could not start. */
  onClose(summary: SetSummary | null): void;
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A quick springy "pop", used when the number changes. */
function pop(node: HTMLElement): void {
  if (reducedMotion() || typeof node.animate !== 'function') return;
  node.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(0.2, 1.6, 0.4, 1)' });
}

export async function openWorkout(options: WorkoutOptions): Promise<void> {
  const { def, level, goal } = options;
  const version = def.versions[level - 1]!;
  const settings = getState().settings;
  const coach = options.coach ?? new Coach({ voice: settings.voice, sound: settings.sound });
  // We are inside a tap (or a session the user started with a tap): the
  // moment iOS lets us switch sound on.
  coach.unlock();
  const isHold = def.kind === 'hold';
  const timed = goal.kind === 'time';
  const target = goal.kind === 'count' ? goal.target : goal.seconds;

  // ------------------------------------------------------------ elements
  const video = h('video', { class: 'wk-video', playsinline: true, muted: true });
  const canvas = h('canvas', { class: 'wk-canvas' });
  const frame = h('div', { class: 'wk-frame mirror' }, video, canvas);
  const count = h('span', { class: 'wk-count-num' }, '0');
  const countOf = h('span', { class: 'wk-count-of' }, timed ? formatTime(target * 1000) : isHold ? `of ${target} s` : `of ${target}`);
  const countBox = h('div', { class: 'wk-count' }, count, countOf);
  const title = h('div', { class: 'wk-title' }, options.label ? h('small', null, options.label) : null, h('strong', null, version.name));
  const cue = h('div', { class: 'wk-cue', role: 'status', 'aria-live': 'polite' });
  const pip = h('div', { class: 'wk-pip', html: mascotSvg('happy', 72) });
  const big = h('div', { class: 'wk-big' });
  const checkItems = [h('li'), h('li'), h('li')];
  const lightNote = h('p', { class: 'wk-light' }, 'It is quite dark. More light helps me see you.');
  const ring = h('div', { class: 'wk-hold' }, h('div', { class: 'wk-hold-fill' }));
  const positionCard = h(
    'div',
    { class: 'wk-card wk-position' },
    h('strong', null, `${placement(def)}`),
    h('ul', { class: 'wk-checks' }, ...checkItems),
    ring,
    lightNote,
    h('p', { class: 'wk-hint' }, 'Tip: lean the phone against a wall about 2 m away, so your whole body fits.'),
  );
  const checkInCard = h(
    'div',
    { class: 'wk-card wk-checkin' },
    h('strong', null, 'Coach check!'),
    h('p', null, options.checkIn === 'both-hands' ? 'Raise both hands above your head.' : 'Raise one hand above your head.'),
    h('p', { class: 'wk-hint' }, 'A quick hello, so I know it is really you.'),
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
  const stopBtn = h('button', { class: 'wk-stop', type: 'button', onclick: () => runner.stop() }, h('strong', null, 'Stop'), h('small', null, 'or if something hurts'));
  const closeBtn = h('button', { class: 'icon-btn wk-close', type: 'button', 'aria-label': 'Stop this set', onclick: () => runner.stop() }, icon('close'));
  const stage = h('div', { class: 'wk-stage' }, frame, countBox, title, pip, cue, big, loadingCard, checkInCard, positionCard, pausedCard, debugBox, closeBtn, stopBtn);
  const root = h('section', { class: 'workout', 'data-phase': 'loading', role: 'dialog', 'aria-label': version.name }, stage);
  document.body.appendChild(root);
  animateIn(root, 'up');

  const skeleton = new SkeletonRenderer(canvas);
  let cueTimer = 0;
  let debugTaps = 0;
  let closed = false;
  let saidPosition = false;

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

  // Five quick taps on the counter (or the title) show the hidden debug numbers.
  const debugTap = () => {
    if (++debugTaps >= 5) {
      debugTaps = 0;
      debugBox.hidden = !debugBox.hidden;
    }
  };
  countBox.addEventListener('click', debugTap);
  title.addEventListener('click', debugTap);

  // Development only: "?sim" in the address feeds pretend exercise. Vite
  // deletes this whole branch from the published app.
  let poseSource: SetOptions['poseSource'];
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('sim')) {
    poseSource = (await import('../workout/devSim')).simulated(def, level, !!options.checkIn);
  }

  const runner = new SetRunner(
    video,
    { detector: def.detector(level), goal, checkIn: options.checkIn ?? null, poseSource },
    {
      onPhase(phase: SetPhase) {
        root.dataset.phase = phase;
        if (phase === 'checkin') coach.say(options.checkIn === 'both-hands' ? LINES.checkInBoth : LINES.checkIn);
        if (phase === 'position' && !saidPosition) {
          saidPosition = true;
          const amount = timed ? `As many as you can in ${target} seconds` : `${target} ${unit(def, target)}`;
          coach.say(`${version.name}. ${amount}. ${placement(def)}.`);
        }
        if (phase === 'paused') {
          coach.quiet();
          skeleton.draw(null);
        }
      },
      onLayout: layout,
      onFrame(view, pose) {
        skeleton.draw(pose);
        if (root.dataset.phase === 'position') {
          view.checks.forEach((check, i) => {
            const item = checkItems[i];
            if (!item) return;
            if (item.textContent !== check.label) item.textContent = check.label;
            item.classList.toggle('ok', check.ok);
          });
          (ring.firstElementChild as HTMLElement).style.transform = `scaleX(${view.readyProgress.toFixed(2)})`;
          lightNote.classList.toggle('show', runner.isDark);
        }
        if (!debugBox.hidden) debugBox.textContent = runner.debugText;
      },
      onCheckIn(result) {
        if (result === 'passed') {
          coach.ding();
          coach.say(LINES.checkInPassed, 'count');
        } else {
          coach.say(LINES.checkInFailed);
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
      onProgress(n, event) {
        count.textContent = String(n);
        pop(count);
        if (event.type === 'rep') {
          pop(pip);
          coach.rep(n, event.cue);
          showCue(event.cue === 'nice' ? `Nice rep · form ${event.score}` : CUE_TEXT[event.cue].show, event.cue === 'nice' ? 'good' : 'warn');
          if (!timed && n === target - 1 && target >= 4) coach.say(LINES.lastOne, 'cue');
        } else {
          coach.holdSecond(n, target);
        }
      },
      onReject(reject) {
        coach.reject(reject.cue);
        showCue(rejectLine(reject.reason, reject.cue));
      },
      onCue(c) {
        coach.cue(c);
        showCue(CUE_TEXT[c].show);
      },
      onClock(left) {
        countOf.textContent = `${formatTime(left * 1000)} left`;
        coach.clock(left);
      },
      onFinish(summary) {
        coach.quiet();
        if (summary.endedBy === 'target' || summary.endedBy === 'time') {
          coach.fanfare();
          if (options.mode === 'practice') coach.say(`${summary.count} ${unit(def, summary.count)}. ${LINES.targetReached}`);
        } else if (options.mode === 'practice' && summary.endedBy !== 'checkin-failed') {
          coach.say(summary.endedBy === 'left' ? LINES.left : LINES.stopped(summary.count, unit(def, summary.count)));
        }
        saveSet(summary);
        if (options.mode === 'session') close(summary);
        else showSummary(summary);
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
            button('Close', { block: true, onClick: () => close(null) }),
          ),
        );
      },
    },
  );

  function saveSet(s: SetSummary): void {
    if (s.count === 0) return; // nothing verified, nothing to record
    update(
      (state) => {
        state.history.push({
          at: new Date().toISOString(),
          exercise: def.id,
          variant: s.variant,
          reps: s.count,
          target: s.target,
          avgScore: s.avgScore,
          bestScore: s.bestScore,
          rejected: s.rejected,
          durationMs: s.durationMs,
        });
        if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);
      },
      { quiet: options.mode === 'session' },
    );
  }

  function showSummary(s: SetSummary): void {
    const reasons = (Object.entries(s.rejects) as [RejectReason, number][]).sort((a, b) => b[1] - a[1]);
    const done = s.endedBy === 'target' || s.endedBy === 'time';
    const headline = s.endedBy === 'checkin-failed' ? 'Set skipped' : s.count === 0 ? 'Nothing counted' : done ? 'Set complete!' : 'Set finished';
    const view = h(
      'div',
      { class: 'wk-summary' },
      h('div', { class: 'wk-summary-pip', html: mascotSvg(s.count > 0 ? 'cheer' : 'care', 110) }),
      h('h2', null, headline),
      h('div', { class: 'wk-summary-reps' }, h('strong', null, String(s.count)), h('span', null, `verified ${unit(def, s.count)}`)),
      s.count > 0
        ? h(
            'div',
            { class: 'stats' },
            h('div', { class: 'stat' }, h('strong', null, String(s.avgScore)), h('small', null, 'average form (of 100)')),
            isHold ? null : h('div', { class: 'stat' }, h('strong', null, String(s.bestScore)), h('small', null, 'best rep')),
            h('div', { class: 'stat' }, h('strong', null, formatTime(s.durationMs)), h('small', null, 'time')),
          )
        : h(
            'p',
            { class: 'muted' },
            s.endedBy === 'checkin-failed' ? 'I could not see the raised hand, so the set did not start.' : 'That is fine. Have a look at the tips below and try again when you are ready.',
          ),
      s.mainCue ? h('p', { class: 'notice' }, `Coach’s tip for next time: ${CUE_TEXT[s.mainCue].show.toLowerCase()}.`) : null,
      reasons.length
        ? h(
            'div',
            { class: 'card' },
            h('h3', null, `${s.rejected} ${s.rejected === 1 ? 'movement was' : 'movements were'} not counted`),
            ...reasons.map(([reason, n]) => h('p', { class: 'wk-reason' }, h('strong', null, `${n} × ${REJECT_TEXT[reason].show}`), h('small', null, REJECT_TEXT[reason].tip))),
          )
        : null,
      button('Done', { block: true, onClick: () => close(s) }),
    );
    stage.replaceChildren(view);
    animateIn(view, 'up');
  }

  function close(summary: SetSummary | null): void {
    if (closed) return;
    closed = true;
    clearTimeout(cueTimer);
    resizeWatcher.disconnect();
    runner.dispose();
    if (!options.coach) coach.quiet();
    root.remove();
    options.onClose(summary);
  }

  void runner.start();
}
