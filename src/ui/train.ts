// Everything on the Today tab that is about training: today's planned
// session, the fitness test, and the exercise library.
import { getState, update } from '../app/store';
import { Coach } from '../coach/coach';
import { startLevel } from '../profile/energy';
import { NOT_MEDICAL_ADVICE } from '../profile/health';
import type { Profile } from '../profile/profile';
import { EXERCISES, EXERCISE_IDS, placement, unit, type ExerciseDef, type Level } from '../exercises/library';
import { buildSession, levelFor, levelFromTest, sameDay, targetFor, weekIndexOf, weeklySplit, weekStart, type Progress, type SessionPlan } from '../plan/plan';
import type { SaveData } from '../state/save';
import type { SetSummary } from '../workout/setRunner';
import { weeklyQuests } from '../economy/award';
import { button, icon, openSheet, toast } from './components';
import { exerciseDemo } from './demo';
import { h } from './dom';
import { mascotSvg } from './mascot';
import { interlude, openSession } from './session';
import { openWorkout } from './workout';

export interface TrainingState {
  baseLevel: Level;
  weekIndex: number;
  /** Sessions finished since Monday. */
  doneThisWeek: number;
  doneToday: boolean;
  plan: SessionPlan;
}

/** Work out where the user is in their plan right now. */
export function trainingState(state: Readonly<SaveData>, p: Profile, now = new Date()): TrainingState {
  const cautious = p.age >= 65 || (state.health?.anyYes ?? false);
  // The fitness test places you; before it, we go by what you told us.
  const baseLevel: Level = state.fitness ? (Math.max(1, state.fitness.level - (cautious ? 1 : 0)) as Level) : startLevel(p, state.health?.anyYes ?? false);
  const monday = weekStart(now).getTime();
  const thisWeek = state.sessions.filter((s) => Date.parse(s.at) >= monday);
  const last = state.sessions[state.sessions.length - 1];
  const weekIndex = state.planStart ? weekIndexOf(new Date(state.planStart), now) : 0;
  return {
    baseLevel,
    weekIndex,
    doneThisWeek: thisWeek.length,
    doneToday: !!last && sameDay(new Date(last.at), now),
    plan: buildSession({ profile: p, baseLevel, progress: state.progress as Progress, weekIndex, sessionIndex: thisWeek.length }),
  };
}

// ---------------------------------------------------------- exercise sheet

/** Demo, the three versions, tips, and a button to practise one set. */
export function openExerciseSheet(def: ExerciseDef, level: Level, target: number, p: Profile): void {
  const demo = exerciseDemo(def, level);
  const sheet = openSheet(def.name, (s) =>
    h(
      'div',
      { class: 'stack' },
      h('div', { class: 'card demo-card' }, demo.element),
      h('p', { class: 'target-line' }, h('strong', null, `${target} ${unit(def, target)}`), ` · ${placement(def).toLowerCase()}`),
      h(
        'div',
        { class: 'versions' },
        ...def.versions.map((v, i) =>
          h('div', { class: `version ${i + 1 === level ? 'current' : ''}` }, h('small', null, ['Beginner', 'Standard', 'Advanced'][i]!), h('strong', null, v.name), h('span', null, v.how)),
        ),
      ),
      h(
        'ul',
        { class: 'tips' },
        ...def.tips.map((tip) => h('li', null, tip)),
        def.id === 'pushup' && p.limits.includes('wrists') ? h('li', null, 'Sore wrists? Make fists and rest on your knuckles to keep your wrists straight.') : null,
        def.id === 'pushup' && p.limits.includes('shoulders') ? h('li', null, 'Protecting your shoulders: keep your elbows close to your sides.') : null,
      ),
      button('Practise one set', {
        block: true,
        icon: 'camera',
        onClick: () => {
          demo.stop();
          s.close();
          void openWorkout({ def, level, goal: { kind: 'count', target }, mode: 'practice', onClose: () => undefined });
        },
      }),
      h('p', { class: 'muted small center' }, NOT_MEDICAL_ADVICE),
    ),
  );
  const originalClose = sheet.close;
  sheet.close = () => {
    demo.stop();
    originalClose();
  };
}

export function openLibrarySheet(p: Profile, t: TrainingState): void {
  const state = getState();
  openSheet('Exercise library', (sheet) =>
    h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted small' }, 'Every exercise here is counted by your camera. Tap one to see the demo and practise it.'),
      h(
        'div',
        { class: 'card list' },
        ...EXERCISE_IDS.map((id) => {
          const def = EXERCISES[id];
          const level = levelFor(id, t.baseLevel, state.progress as Progress, p.limits);
          const avoided = def.avoid.some((l) => p.limits.includes(l));
          return h(
            'button',
            {
              class: 'link-row',
              type: 'button',
              onclick: () => {
                sheet.close();
                openExerciseSheet(def, level, targetFor(id, level, state.progress[id]?.steps ?? 0, t.weekIndex, p.goal), p);
              },
            },
            h('span', { class: 'link-text' }, def.versions[level - 1]!.name, h('small', null, avoided ? 'Not in your plan: loads an area you are protecting' : def.focus.join(' · '))),
            icon('chevron', 'icon chev'),
          );
        }),
      ),
    ),
  );
}

// ------------------------------------------------------------ fitness test

/** Most push-ups and squats in 60 seconds each: places the user at a level. */
function runFitnessTest(p: Profile): void {
  const settings = getState().settings;
  const coach = new Coach({ voice: settings.voice, sound: settings.sound });
  coach.unlock();
  const set = (def: ExerciseDef, level: Level, label: string) =>
    new Promise<SetSummary | null>((resolve) => void openWorkout({ def, level, goal: { kind: 'time', seconds: 60 }, mode: 'session', coach, label, onClose: (summary) => resolve(summary) }));

  void (async () => {
    // Push-ups: knees or toes both count, and we note which.
    const pushups = await set(EXERCISES.pushup, 2, 'Fitness test · 1 of 2');
    if (!pushups) return;
    coach.say(`${pushups.count} push-ups. Rest.`);
    // Sore knees? Test the legs with glute bridges instead of squats.
    const legs = p.limits.includes('knees') ? EXERCISES.bridge : EXERCISES.squat;
    const legWord = legs.id === 'bridge' ? 'glute bridges' : 'squats';
    await interlude('Rest', `${pushups.count} push-ups. Next: as many ${legWord} as you can in 60 seconds.`, 40, coach);
    // The easiest depth counts here, so nobody scores zero for stiff hips.
    const squats = await set(legs, 1, 'Fitness test · 2 of 2');
    if (!squats) return;
    const onKnees = pushups.variant === 'knee';
    const level = levelFromTest(pushups.count, onKnees, squats.count);
    update((state) => {
      state.fitness = { at: new Date().toISOString(), pushups: pushups.count, pushupsOnKnees: onKnees, squats: squats.count, level };
      state.planStart ??= new Date().toISOString();
    });
    coach.say('Test complete. Your plan is ready.');
    openSheet('Your starting point', (sheet) =>
      h(
        'div',
        { class: 'stack center-text' },
        h('div', { class: 'center', html: mascotSvg('cheer', 110) }),
        h(
          'div',
          { class: 'stats' },
          h('div', { class: 'stat' }, h('strong', null, String(pushups.count)), h('small', null, onKnees ? 'knee push-ups in 60 s' : 'push-ups in 60 s')),
          h('div', { class: 'stat' }, h('strong', null, String(squats.count)), h('small', null, `${legWord} in 60 s`)),
        ),
        h('p', null, ['Your plan starts gently and builds from there.', 'Your plan starts at a steady, standard level.', 'Your plan starts strong, with the advanced versions.'][level - 1]!),
        h('p', { class: 'muted small' }, 'This is only a starting point. The plan adjusts after every session to what you actually do.'),
        button('See my plan', { block: true, onClick: () => sheet.close() }),
      ),
    );
  })();
}

function openFitnessIntro(p: Profile): void {
  const legWord = p.limits.includes('knees') ? 'glute bridges (kinder to your knees)' : 'squats';
  openSheet('Fitness test', (sheet) =>
    h(
      'div',
      { class: 'stack' },
      h('p', null, 'Two short efforts, counted by your camera, so your plan starts at the right level.'),
      h(
        'ul',
        { class: 'tips' },
        h('li', null, 'As many push-ups as you can in 60 seconds. On your knees or toes, either counts.'),
        h('li', null, 'A 40-second rest.'),
        h('li', null, `As many ${legWord} as you can in 60 seconds.`),
      ),
      h('p', { class: 'muted small' }, 'Go at a pace you can control. Stop whenever you need to: what you managed still counts. Stand side-on to the phone, about 2 m away.'),
      button('Start the test', {
        block: true,
        icon: 'camera',
        onClick: () => {
          sheet.close();
          runFitnessTest(p);
        },
      }),
      h('p', { class: 'muted small center' }, NOT_MEDICAL_ADVICE),
    ),
  );
}

// --------------------------------------------------------- Today's cards

function sessionList(plan: SessionPlan): HTMLElement {
  return h(
    'ul',
    { class: 'plan-list' },
    ...plan.blocks.map((b) => {
      const def = EXERCISES[b.exercise];
      return h('li', null, h('span', null, def.versions[b.level - 1]!.name), h('small', null, `${b.sets} × ${b.target}${def.kind === 'hold' ? ' s' : ''}`));
    }),
  );
}

/** The training cards shown at the top of the Today tab. */
export function trainingCards(p: Profile): HTMLElement[] {
  const state = getState();
  const t = trainingState(state, p);
  const days = weeklySplit(p.daysPerWeek).length;
  const cards: HTMLElement[] = [];
  const start = () => openSession({ plan: t.plan, baseLevel: t.baseLevel, onClose: () => undefined });

  const dots = h(
    'div',
    { class: 'week-dots', role: 'img', 'aria-label': `${Math.min(t.doneThisWeek, days)} of ${days} sessions done this week` },
    ...Array.from({ length: days }, (_x, i) => h('span', { class: i < t.doneThisWeek ? 'done' : '' })),
  );

  if (!state.fitness && state.sessions.length === 0) {
    cards.push(
      h(
        'div',
        { class: 'card workout-card' },
        h('small', null, 'First, find your level'),
        h('strong', null, '2-minute fitness test'),
        h('p', { class: 'muted' }, 'Two short efforts, counted by your camera. It places your plan at the right difficulty.'),
        button('Take the test', { block: true, icon: 'camera', onClick: () => openFitnessIntro(p) }),
        h(
          'button',
          {
            class: 'text-btn',
            type: 'button',
            onclick: () => {
              update((s) => void (s.planStart ??= new Date().toISOString()));
              toast('No problem. Your plan starts from what you told me.');
            },
          },
          state.planStart ? '' : 'Skip the test for now',
        ),
      ),
    );
    if (!state.planStart) return cards;
  }

  const weekDone = t.doneThisWeek >= days;
  cards.push(
    h(
      'div',
      { class: 'card workout-card' },
      h('small', null, t.doneToday ? 'Done for today' : weekDone ? 'This week is complete' : `Today · week ${t.plan.week} of 4${t.plan.deload ? ' · easier week' : ''}`),
      h('strong', null, t.doneToday ? 'Rest and recover' : weekDone ? 'Bonus session' : t.plan.title),
      dots,
      t.doneToday
        ? h('p', { class: 'muted' }, 'Muscles grow while you rest. Your next session will be ready tomorrow.')
        : h('p', { class: 'muted' }, `About ${t.plan.minutes} min · around ${t.plan.kcal} kcal · warm-up and cool-down included`),
      t.doneToday ? null : sessionList(t.plan),
      t.doneToday
        ? button(`Do another: ${t.plan.title}`, { block: true, variant: 'secondary', onClick: start })
        : button('Start session', { block: true, icon: 'camera', onClick: start }),
    ),
  );

  cards.push(
    h(
      'div',
      { class: 'card' },
      h('h2', null, 'This week’s quests'),
      ...weeklyQuests(state, p.daysPerWeek, new Date()).map((q) =>
        h(
          'div',
          { class: `quest ${q.claimed ? 'claimed' : ''}` },
          h('div', { class: 'quest-top' }, h('span', null, q.title), h('small', null, q.claimed ? 'Done ✓' : `+${q.reward} points`)),
          h('div', { class: 'quest-bar' }, h('div', { style: `transform:scaleX(${(q.progress / q.goal).toFixed(3)})` })),
          h('small', { class: 'muted' }, `${q.progress} of ${q.goal}`),
        ),
      ),
      h('p', { class: 'muted small' }, 'Quests reset every Monday. Missing one costs nothing.'),
    ),
  );

  cards.push(
    h(
      'div',
      { class: 'card list' },
      h(
        'button',
        { class: 'link-row', type: 'button', onclick: () => openLibrarySheet(p, t) },
        icon('sparkle'),
        h('span', { class: 'link-text' }, 'Exercise library', h('small', null, `${EXERCISE_IDS.length} camera-counted exercises to practise`)),
        icon('chevron', 'icon chev'),
      ),
      state.fitness
        ? h(
            'button',
            { class: 'link-row', type: 'button', onclick: () => openFitnessIntro(p) },
            icon('bolt'),
            h('span', { class: 'link-text' }, 'Retake the fitness test', h('small', null, `Last time: ${state.fitness.pushups} push-ups, ${state.fitness.squats} for legs`)),
            icon('chevron', 'icon chev'),
          )
        : null,
    ),
  );
  return cards;
}
