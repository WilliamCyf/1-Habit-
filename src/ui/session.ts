// The session player: runs a whole planned workout, hands-free.
//
//   overview → warm-up → [ intro → set → rest ] × n → cool-down → summary
//
// After you tap Start, the coach's voice leads everything and each step
// moves on by itself, because the phone is across the room. The camera is
// only on during sets. During warm-up, rests and cool-down it is fully off,
// which is the biggest single saving of heat and battery.
import { getState, update } from '../app/store';
import { Coach } from '../coach/coach';
import { EXERCISES, placement, unit, type ExerciseDef, type Level } from '../exercises/library';
import { adjust, type ExerciseProgress, type SessionPlan, type SetPlan, type SetResult, type TimedStep } from '../plan/plan';
import { WakeLock } from '../platform/ios';
import { MAX_HISTORY } from '../state/save';
import type { CheckIn, SetSummary } from '../workout/setRunner';
import { button } from './components';
import { exerciseDemo, type DemoHandle } from './demo';
import { animateIn, h } from './dom';
import { mascotSvg } from './mascot';
import { formatTime, openWorkout } from './workout';

/**
 * A countdown that only runs while the app is on screen. It uses the clock
 * (not a count of ticks), so it stays accurate, and the small timer that
 * refreshes the display exists only while the countdown does.
 */
export function countdown(seconds: number, onTick: (left: number) => void): { finished: Promise<void>; skip(): void; add(extra: number): void } {
  let remaining = seconds * 1000;
  let last = performance.now();
  let shown = -1;
  let resolve!: () => void;
  const finished = new Promise<void>((r) => (resolve = r));
  const timer = window.setInterval(() => {
    const now = performance.now();
    if (!document.hidden) remaining -= now - last;
    last = now;
    const left = Math.max(0, Math.ceil(remaining / 1000));
    if (left !== shown) {
      shown = left;
      onTick(left);
    }
    if (remaining <= 0) stop();
  }, 200);
  function stop(): void {
    window.clearInterval(timer);
    resolve();
  }
  onTick(seconds);
  return { finished, skip: stop, add: (extra) => void (remaining += extra * 1000) };
}

export interface SessionOptions {
  plan: SessionPlan;
  /** The user's general level, used when an exercise has no progress saved yet. */
  baseLevel: Level;
  onClose(): void;
}

interface BlockResult {
  block: SetPlan;
  def: ExerciseDef;
  sets: SetSummary[];
}

export function openSession(options: SessionOptions): void {
  const { plan } = options;
  const settings = getState().settings;
  const coach = new Coach({ voice: settings.voice, sound: settings.sound });
  const wakeLock = new WakeLock();
  const stage = h('div', { class: 'ss-stage' });
  const root = h('section', { class: 'session', role: 'dialog', 'aria-label': plan.title }, stage);
  document.body.appendChild(root);
  animateIn(root, 'up');

  let ended = false;
  let demo: DemoHandle | null = null;
  const startedAt = Date.now();
  const results: BlockResult[] = [];

  function show(...children: (HTMLElement | null)[]): void {
    demo?.stop();
    demo = null;
    const view = h('div', { class: 'ss-view' }, ...children);
    stage.replaceChildren(view);
    animateIn(view, 'up');
  }

  const endLink = () =>
    h('button', { class: 'ss-end', type: 'button', onclick: () => void (ended = true) }, 'End session');

  // ----------------------------------------------------------- overview

  function overview(): Promise<boolean> {
    return new Promise((resolve) => {
      show(
        h('div', { class: 'ss-pip', html: mascotSvg('happy', 88) }),
        h('p', { class: 'ss-kicker' }, plan.deload ? `Week ${plan.week} of 4 · easier week` : `Week ${plan.week} of 4`),
        h('h2', null, plan.title),
        h('p', { class: 'muted' }, `About ${plan.minutes} minutes · around ${plan.kcal} kcal`),
        h(
          'ul',
          { class: 'ss-list' },
          h('li', null, h('span', null, 'Warm-up'), h('small', null, formatTime(plan.warmup.reduce((s, x) => s + x.seconds, 0) * 1000))),
          ...plan.blocks.map((b) => {
            const def = EXERCISES[b.exercise];
            return h('li', null, h('span', null, def.versions[b.level - 1]!.name), h('small', null, `${b.sets} × ${b.target}${def.kind === 'hold' ? ' s' : ''}`));
          }),
          h('li', null, h('span', null, 'Cool-down'), h('small', null, formatTime(plan.cooldown.reduce((s, x) => s + x.seconds, 0) * 1000))),
        ),
        h('p', { class: 'muted small' }, 'Prop the phone about 2 m away and turn the volume up. I will talk you through everything, and your own music can keep playing.'),
        button('Start session', {
          block: true,
          onClick: () => {
            // Inside the tap: the moment iOS lets sound begin.
            coach.unlock();
            resolve(true);
          },
        }),
        button('Not now', { block: true, variant: 'ghost', onClick: () => resolve(false) }),
      );
    });
  }

  // ------------------------------------------------------- timed steps

  async function timedSteps(title: string, steps: readonly TimedStep[]): Promise<void> {
    let skipAll = false;
    for (let i = 0; i < steps.length && !ended && !skipAll; i++) {
      const step = steps[i]!;
      const number = h('strong', { class: 'ss-clock' }, String(step.seconds));
      const bar = h('div', { class: 'ss-bar-fill' });
      coach.say(`${step.name}. ${step.how}`);
      const timer = countdown(step.seconds, (left) => {
        number.textContent = String(left);
        bar.style.transform = `scaleX(${(1 - left / step.seconds).toFixed(3)})`;
        if (left > 0 && left <= 3) coach.countdown(left);
        if (ended) timer.skip();
      });
      show(
        h('p', { class: 'ss-kicker' }, `${title} · ${i + 1} of ${steps.length}`),
        h('h2', null, step.name),
        h('p', { class: 'ss-how' }, step.how),
        number,
        h('div', { class: 'ss-bar' }, bar),
        h('p', { class: 'muted small' }, 'Camera is off. Go at your own pace.'),
        button('Next', { block: true, variant: 'secondary', onClick: () => timer.skip() }),
        button(`Skip the ${title.toLowerCase()}`, { block: true, variant: 'ghost', onClick: () => ((skipAll = true), timer.skip()) }),
        endLink(),
      );
      await timer.finished;
    }
    coach.quiet();
  }

  // ------------------------------------------------- exercise intro and rest

  async function intro(block: SetPlan, def: ExerciseDef): Promise<void> {
    const version = def.versions[block.level - 1]!;
    const number = h('span', null, '8');
    coach.say(`Next: ${version.name}. ${version.how} ${placement(def)}.`);
    const timer = countdown(8, (left) => {
      number.textContent = String(left);
      if (ended) timer.skip();
    });
    const d = exerciseDemo(def, block.level);
    show(
      h('p', { class: 'ss-kicker' }, `Next · ${block.sets} × ${block.target} ${unit(def, block.target)}`),
      h('h2', null, version.name),
      h('div', { class: 'card demo-card' }, d.element),
      h('p', { class: 'ss-how' }, version.how),
      h('p', { class: 'ss-place' }, placement(def)),
      button('Start now', { block: true, onClick: () => timer.skip() }),
      h('p', { class: 'muted small' }, 'Starting in ', number, ' s'),
      endLink(),
    );
    demo = d;
    await timer.finished;
  }

  async function rest(seconds: number, last: SetSummary | null, lastDef: ExerciseDef, next: string): Promise<void> {
    const number = h('strong', { class: 'ss-clock' }, String(seconds));
    const lastLine =
      !last || last.endedBy === 'checkin-failed'
        ? 'Set skipped'
        : last.count === 0
          ? 'Nothing counted that time. Shake it off.'
          : `${last.count} ${unit(lastDef, last.count)} · form ${last.avgScore}`;
    coach.say(last && last.count > 0 ? `${last.count} ${unit(lastDef, last.count)}. Rest.` : 'Rest.');
    let warned = false;
    const timer = countdown(seconds, (left) => {
      number.textContent = String(left);
      if (left === 5 && !warned) {
        warned = true;
        coach.say('Get ready.', 'cue');
      }
      if (ended) timer.skip();
    });
    show(
      h('p', { class: 'ss-kicker' }, 'Rest'),
      number,
      h('p', { class: 'ss-how' }, lastLine),
      h('p', { class: 'muted' }, `Next: ${next}`),
      h('p', { class: 'muted small' }, 'Camera is off while you rest.'),
      h(
        'div',
        { class: 'pair' },
        button('+15 s', { variant: 'secondary', onClick: () => timer.add(15) }),
        button('Skip rest', { variant: 'secondary', onClick: () => timer.skip() }),
      ),
      endLink(),
    );
    await timer.finished;
  }

  function runSet(block: SetPlan, def: ExerciseDef, setIndex: number, checkIn: CheckIn | null): Promise<SetSummary | null> {
    return new Promise((resolve) => {
      show(h('p', { class: 'muted' }, 'Camera on…'));
      void openWorkout({
        def,
        level: block.level,
        goal: { kind: 'count', target: block.target },
        mode: 'session',
        coach,
        checkIn,
        label: `Set ${setIndex + 1} of ${block.sets}`,
        onClose: resolve,
      });
    });
  }

  // ------------------------------------------------------------ summary

  function finish(): void {
    coach.quiet();
    void wakeLock.release();
    const setsDone = results.reduce((n, r) => n + r.sets.length, 0);
    const totalSets = plan.blocks.reduce((n, b) => n + b.sets, 0);
    if (setsDone === 0) return close();

    const reps = results.reduce((n, r) => n + (r.def.kind === 'hold' ? 0 : r.sets.reduce((a, s) => a + s.count, 0)), 0);
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const kcal = Math.round((plan.kcal * setsDone) / totalSets);
    const notes: string[] = [];

    update((state) => {
      for (const r of results) {
        const before: ExerciseProgress = state.progress[r.def.id] ?? { level: options.baseLevel, steps: 0 };
        // Only judge blocks where every planned set was attempted.
        if (r.sets.length < r.block.sets) continue;
        const setResults: SetResult[] = r.sets.map((s) => ({ count: s.count, target: s.target, avgScore: s.avgScore }));
        const after = adjust(before, setResults);
        state.progress[r.def.id] = after;
        if (after.level > before.level) notes.push(`${r.def.name}: you have earned the next version, ${r.def.versions[after.level - 1]!.name}!`);
        else if (after.level < before.level) notes.push(`${r.def.name}: back to ${r.def.versions[after.level - 1]!.name} for now, to build up again.`);
        else if (after.steps > before.steps) notes.push(`${r.def.name}: a little more next time.`);
        else if (after.steps < before.steps) notes.push(`${r.def.name}: a little less next time.`);
      }
      state.planStart ??= new Date().toISOString();
      state.sessions.push({ at: new Date().toISOString(), title: plan.title, focus: plan.focus, minutes, sets: setsDone, reps, kcal });
      if (state.sessions.length > MAX_HISTORY) state.sessions.splice(0, state.sessions.length - MAX_HISTORY);
    });

    const complete = setsDone === totalSets;
    if (complete) coach.fanfare();
    coach.say(complete ? 'Session complete. Great work today!' : 'Session finished. Well done for showing up.');
    show(
      h('div', { class: 'ss-pip', html: mascotSvg('cheer', 110) }),
      h('h2', null, complete ? 'Session complete!' : 'Session finished'),
      h(
        'div',
        { class: 'stats' },
        h('div', { class: 'stat' }, h('strong', null, String(reps)), h('small', null, 'verified reps')),
        h('div', { class: 'stat' }, h('strong', null, `${setsDone}/${totalSets}`), h('small', null, 'sets')),
        h('div', { class: 'stat' }, h('strong', null, `${minutes}`), h('small', null, 'minutes')),
        h('div', { class: 'stat' }, h('strong', null, `${kcal}`), h('small', null, 'kcal, roughly')),
      ),
      h(
        'ul',
        { class: 'ss-list' },
        ...results.map((r) =>
          h(
            'li',
            null,
            h('span', null, r.def.versions[r.block.level - 1]!.name),
            h('small', null, r.sets.map((s) => (s.endedBy === 'checkin-failed' ? 'skip' : String(s.count))).join(' · ') + (r.def.kind === 'hold' ? ' s' : '')),
          ),
        ),
      ),
      notes.length ? h('div', { class: 'card ss-notes' }, h('h3', null, 'Next time'), ...notes.map((n) => h('p', null, n))) : null,
      button('Done', { block: true, onClick: close }),
    );
  }

  function close(): void {
    demo?.stop();
    coach.quiet();
    void wakeLock.release();
    root.remove();
    options.onClose();
  }

  // ---------------------------------------------------------- the flow

  /** Decide, unpredictably, which sets begin with a coach check-in. */
  function planCheckIns(total: number): (CheckIn | null)[] {
    const list: (CheckIn | null)[] = new Array<CheckIn | null>(total).fill(null);
    const dev = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
    if (dev?.has('sim')) {
      // Development: only when asked, and at a fixed place, so tests are repeatable.
      if (dev.has('checkin') && total > 1) list[1] = 'one-hand';
      return list;
    }
    for (let i = 1; i < total; i++) if (Math.random() < 0.3) list[i] = Math.random() < 0.5 ? 'one-hand' : 'both-hands';
    // (Written with `some` because `every(c => c === null)` makes TypeScript think the list can only hold nulls.)
    const anyPlanned = list.some((c) => c !== null);
    if (total >= 3 && !anyPlanned) list[1 + Math.floor(Math.random() * (total - 1))] = 'one-hand';
    return list;
  }

  async function run(): Promise<void> {
    if (!(await overview())) return close();
    void wakeLock.acquire();
    await timedSteps('Warm-up', plan.warmup);

    const order: { block: SetPlan; def: ExerciseDef; setIndex: number }[] = [];
    for (const block of plan.blocks) for (let i = 0; i < block.sets; i++) order.push({ block, def: EXERCISES[block.exercise], setIndex: i });
    const checkIns = planCheckIns(order.length);

    for (let i = 0; i < order.length && !ended; i++) {
      const { block, def, setIndex } = order[i]!;
      if (setIndex === 0) {
        await intro(block, def);
        if (ended) break;
        results.push({ block, def, sets: [] });
      }
      const summary = await runSet(block, def, setIndex, checkIns[i] ?? null);
      if (summary === null) {
        // The camera could not start. There is no point carrying on.
        ended = true;
        break;
      }
      results[results.length - 1]!.sets.push(summary);
      const next = order[i + 1];
      if (next && !ended) {
        const nextName = next.def.versions[next.block.level - 1]!.name;
        await rest(block.restSec, summary, def, next.setIndex === 0 ? nextName : `${nextName}, set ${next.setIndex + 1} of ${next.block.sets}`);
      }
    }
    if (!ended) await timedSteps('Cool-down', plan.cooldown);
    finish();
  }

  void run();
}

/** A simple timed pause between two sets, used by the fitness test. */
export function interlude(title: string, text: string, seconds: number, coach: Coach): Promise<void> {
  const number = h('strong', { class: 'ss-clock' }, String(seconds));
  const timer = countdown(seconds, (left) => {
    number.textContent = String(left);
    if (left === 5) coach.say('Get ready.', 'cue');
  });
  const view = h(
    'div',
    { class: 'ss-view' },
    h('p', { class: 'ss-kicker' }, title),
    number,
    h('p', { class: 'ss-how' }, text),
    button('Skip', { block: true, variant: 'secondary', onClick: () => timer.skip() }),
  );
  const root = h('section', { class: 'session' }, h('div', { class: 'ss-stage' }, view));
  document.body.appendChild(root);
  animateIn(root, 'up');
  return timer.finished.then(() => root.remove());
}
