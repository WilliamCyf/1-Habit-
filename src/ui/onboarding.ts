// The first-run flow: welcome → health check → profile → your numbers →
// camera explained → install. One question per screen, with Pip guiding.
//
// It is written as a list of "steps". Each step knows what to show and
// whether the user has answered enough to continue. A small engine at the
// bottom walks through the list. Adding a step later means adding one entry.
import { getState, update } from '../app/store';
import { dailyNeed, energyTarget, goalBlurb, LEVEL_NAMES, roundKcal, startLevel, workoutBurn } from '../profile/energy';
import { HEALTH_QUESTIONS, NOT_MEDICAL_ADVICE } from '../profile/health';
import { isCompleteProfile, LABELS, type Profile } from '../profile/profile';
import { button, coachSays, icon, segmented } from './components';
import { animateIn, clear, formatNumber, h } from './dom';
import { openCalorieSheet } from './explain';
import { ageField, bodyFields, experienceField, genderField, goalField, limitsField, scheduleFields, type Draft } from './fields';
import type { IconName } from './icons';
import { installSteps, isStandalone } from './install';
import { mascotSvg, type Mood } from './mascot';

interface Step {
  id: string;
  mood: Mood;
  say: string;
  /** Build the middle of the screen. Call `refresh` when an answer changes. */
  body(refresh: () => void): HTMLElement;
  /** Has the user answered enough to continue? */
  ready(): boolean;
  cta?: string;
  /** Skip this step entirely when true. */
  skip?(): boolean;
  /** Runs when the user moves forward from this step. */
  leave?(): void;
}

function feature(name: IconName, title: string, text: string): HTMLElement {
  return h('li', null, h('span', { class: 'feature-icon' }, icon(name)), h('span', null, h('strong', null, title), h('small', null, text)));
}

function statCard(name: IconName, value: string, label: string): HTMLElement {
  return h('div', { class: 'stat' }, icon(name, 'icon stat-icon'), h('strong', null, value), h('small', null, label));
}

/** A drawing of the phone standing on the floor, facing someone doing a push-up. */
const SETUP_ART = `<svg viewBox="0 0 320 150" class="setup-art" role="img" aria-label="Phone standing upright on the floor, about one metre in front of the head of a person doing a push-up who faces it">
  <path d="M40 88L304 80L304 122L70 122Z" fill="currentColor" opacity="0.07"/>
  <path d="M10 122H310" stroke="currentColor" stroke-width="2" opacity="0.35" stroke-linecap="round"/>
  <rect x="18" y="94" width="11" height="28" rx="4" fill="currentColor" opacity="0.25"/>
  <g transform="rotate(-10 44 120)">
    <rect x="36" y="82" width="17" height="38" rx="4" fill="none" stroke="#7cf2b0" stroke-width="3"/>
    <circle cx="44.500" cy="88" r="2.200" fill="#7cf2b0"/>
  </g>
  <rect x="112" y="119" width="186" height="6" rx="3" fill="#ff7a6b"/>
  <g stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M140 97L214 104L288 116"/>
    <path d="M140 97L142 117"/>
  </g>
  <circle cx="125" cy="92" r="9" fill="currentColor"/>
  <g stroke="currentColor" stroke-width="1.500" opacity="0.6" stroke-linecap="round">
    <path d="M50 138H114" stroke-dasharray="4 5"/>
    <path d="M50 138l6-4M50 138l6 4M114 138l-6-4M114 138l-6 4"/>
  </g>
  <text x="82" y="149" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.75" font-family="inherit" font-weight="700">about 1 m</text>
</svg>`;

export function renderOnboarding(root: HTMLElement, onDone: () => void): void {
  const saved = getState();
  // Working copies. Answers are saved quietly as they change, so closing the
  // app half-way loses nothing.
  const draft: Draft = { ...saved.draft, ...(saved.profile ?? {}) };
  if (draft.limits) draft.limits = [...draft.limits];
  const answers: (boolean | null)[] = HEALTH_QUESTIONS.map((_, i) => saved.health?.answers[i] ?? null);
  let acknowledged = saved.health?.acknowledged ?? false;
  let units = saved.settings.units;

  const saveDraft = () => update((s) => void (s.draft = { ...draft }), { quiet: true });
  const anyYes = () => answers.some((a) => a === true);
  const saveHealth = () =>
    update(
      (s) =>
        void (s.health = {
          answeredAt: new Date().toISOString(),
          answers: answers.map((a) => a === true),
          anyYes: anyYes(),
          acknowledged: anyYes() ? acknowledged : true,
        }),
      { quiet: true },
    );

  const steps: Step[] = [
    {
      id: 'welcome',
      mood: 'cheer',
      say: '',
      cta: 'Let’s go',
      ready: () => true,
      body: () =>
        h(
          'div',
          { class: 'welcome' },
          h('div', { class: 'welcome-pip', html: mascotSvg('cheer', 150) }),
          h('h1', null, 'Hi, I’m Pip!'),
          h('p', { class: 'muted' }, 'Your pocket coach for home workouts. No equipment, just a mat.'),
          h(
            'ul',
            { class: 'features' },
            feature('camera', 'Your camera counts every rep', 'No typing and no cheating. Real reps only.'),
            feature('sparkle', 'Reps grow a little world', 'Earn points to care for a pet and a garden.'),
            feature('shield', 'Private by design', 'Your video never leaves this phone. Nothing is recorded.'),
          ),
        ),
    },
    {
      id: 'health',
      mood: 'care',
      say: 'First, a quick safety check. Six yes-or-no questions.',
      ready: () => answers.every((a) => a !== null),
      leave: saveHealth,
      body: (refresh) =>
        h(
          'div',
          { class: 'stack' },
          ...HEALTH_QUESTIONS.map((question, i) =>
            h(
              'div',
              { class: 'card question' },
              h('p', null, question),
              segmented(
                question,
                [
                  { value: 'no', label: 'No' },
                  { value: 'yes', label: 'Yes' },
                ],
                (answers[i] === null ? '' : answers[i] ? 'yes' : 'no') as 'yes' | 'no',
                (v) => {
                  answers[i] = v === 'yes';
                  refresh();
                },
              ),
            ),
          ),
          h('p', { class: 'muted small' }, 'Your answers stay on this phone.'),
        ),
    },
    {
      id: 'advice',
      mood: 'care',
      say: 'Thank you for telling me. Your safety comes first.',
      skip: () => !anyYes(),
      ready: () => acknowledged,
      leave: saveHealth,
      body: (refresh) => {
        const box = h('input', { type: 'checkbox', class: 'check-input' });
        box.checked = acknowledged;
        box.addEventListener('change', () => {
          acknowledged = box.checked;
          refresh();
        });
        return h(
          'div',
          { class: 'stack' },
          h(
            'div',
            { class: 'card notice-card' },
            h('h2', null, 'Please check with a doctor first'),
            h(
              'p',
              null,
              'You answered yes to at least one question. That does not mean you cannot exercise. It means a doctor should tell you what is safe for you before you start something new.',
            ),
            h('p', null, 'If you continue, I will start you one level gentler, and you can stop any workout with one tap.'),
          ),
          h('label', { class: 'check-row' }, box, h('span', null, 'I understand. I have checked with a doctor, or I choose to continue carefully.')),
          h('p', { class: 'muted small' }, NOT_MEDICAL_ADVICE),
        );
      },
    },
    {
      id: 'about',
      mood: 'happy',
      say: 'Nice to meet you! Two basics, so I get the maths right.',
      ready: () => draft.gender !== undefined && draft.age !== undefined,
      body: (refresh) => {
        const changed = () => (saveDraft(), refresh());
        return h(
          'div',
          { class: 'stack' },
          genderField(draft, changed),
          h('p', { class: 'muted small' }, 'Only used for the calorie estimate.'),
          ageField(draft, changed),
        );
      },
    },
    {
      id: 'body',
      mood: 'think',
      say: 'These help me estimate the energy you burn. Rough numbers are fine.',
      ready: () => draft.heightCm !== undefined && draft.weightKg !== undefined,
      body: (refresh) =>
        bodyFields(
          draft,
          units,
          (u) => {
            units = u;
            update((s) => void (s.settings.units = u), { quiet: true });
          },
          () => (saveDraft(), refresh()),
        ),
    },
    {
      id: 'goal',
      mood: 'happy',
      say: 'What would you like most from your training?',
      ready: () => draft.goal !== undefined,
      body: (refresh) => goalField(draft, () => (saveDraft(), refresh())),
    },
    {
      id: 'experience',
      mood: 'happy',
      say: 'How would you describe yourself right now? There is no wrong answer.',
      ready: () => draft.experience !== undefined,
      body: (refresh) => experienceField(draft, () => (saveDraft(), refresh())),
    },
    {
      id: 'schedule',
      mood: 'think',
      say: 'How much time can you give? Small and regular beats big and rare.',
      ready: () => draft.daysPerWeek !== undefined && draft.minutesPerSession !== undefined,
      body: (refresh) =>
        h(
          'div',
          { class: 'stack' },
          scheduleFields(draft, () => (saveDraft(), refresh())),
          h('p', { class: 'muted small' }, 'Tip: 3 or 4 days a week is a great start. Rest days are when your body gets stronger.'),
        ),
    },
    {
      id: 'limits',
      mood: 'care',
      say: 'Anything I should go easy on? I will swap exercises to protect it.',
      ready: () => draft.limits !== undefined,
      body: (refresh) =>
        h(
          'div',
          { class: 'stack' },
          limitsField(draft, () => (saveDraft(), refresh())),
          h('p', { class: 'muted small' }, 'For example, sore wrists means push-ups on your fists or forearms instead of flat hands.'),
        ),
    },
    {
      id: 'numbers',
      mood: 'cheer',
      say: 'Here is your starting point!',
      cta: 'Looks good',
      ready: () => isCompleteProfile(draft),
      leave: () => {
        if (isCompleteProfile(draft)) update((s) => void (s.profile = { ...draft, limits: [...draft.limits] }), { quiet: true });
      },
      body: () => {
        if (!isCompleteProfile(draft)) return h('p', { class: 'muted' }, 'Some answers are missing. Go back and fill them in.');
        const p: Profile = draft;
        const level = startLevel(p, anyYes());
        const target = energyTarget(p);
        return h(
          'div',
          { class: 'stack' },
          h(
            'div',
            { class: 'card level-card' },
            h('small', null, 'Starting level'),
            h('strong', null, LEVEL_NAMES[level]),
            h('p', { class: 'muted' }, `${LABELS.goal[p.goal]}: ${goalBlurb(p.goal).toLowerCase()}`),
            h('p', { class: 'muted small' }, 'A camera fitness test will fine-tune this before your first plan.'),
          ),
          h(
            'div',
            { class: 'stats' },
            statCard('flame', `${formatNumber(roundKcal(dailyNeed(p)))}`, 'kcal you burn per day'),
            statCard('bolt', `${formatNumber(roundKcal(workoutBurn(p)))}`, `kcal per ${p.minutesPerSession}-min workout`),
            statCard('heart', `${formatNumber(roundKcal(target.kcal))}`, 'kcal gentle daily target'),
            statCard('calendar', `${p.daysPerWeek} × ${p.minutesPerSession}`, 'days × minutes a week'),
          ),
          button('How is this calculated?', { variant: 'ghost', icon: 'calculator', block: true, onClick: () => openCalorieSheet(p) }),
          h('p', { class: 'muted small' }, `These are estimates. ${NOT_MEDICAL_ADVICE}`),
        );
      },
    },
    {
      id: 'camera',
      mood: 'happy',
      say: 'Here is how the camera part works.',
      cta: 'Got it',
      ready: () => true,
      body: () =>
        h(
          'div',
          { class: 'stack' },
          h('div', { class: 'card art-card', html: SETUP_ART }),
          h(
            'ul',
            { class: 'features compact' },
            feature('phone', 'Stand your phone up, facing you', 'For push-ups, on the floor about 1 m in front of your head. For standing moves, about 2 m away. Side-on works too.'),
            feature('person', 'I will talk you into place', 'I will say when I can see you, and what to fix if I cannot.'),
            feature('shield', 'Nothing leaves your phone', 'No video is recorded, saved or uploaded. Ever.'),
          ),
          h('p', { class: 'muted small' }, 'I will ask for the camera only when your first set starts, and switch it off between sets.'),
          button('Try the camera check now', { variant: 'secondary', icon: 'camera', block: true, href: './diag.html' }),
        ),
    },
    {
      id: 'install',
      mood: 'happy',
      say: 'Last thing: put me on your Home Screen, so I open like a real app.',
      cta: 'Finish',
      skip: () => isStandalone(),
      ready: () => true,
      body: () => h('div', { class: 'card' }, installSteps()),
    },
  ];

  // ----------------------------------------------------------- the engine

  const visible = () => steps.filter((s) => !s.skip?.());
  const backBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Back' }, icon('back'));
  const bar = h('div', { class: 'ob-bar-fill' });
  const main = h('div', { class: 'ob-main scroll' });
  const cta = h('button', { class: 'btn block', type: 'button' }, 'Continue');
  const shell = h(
    'section',
    { class: 'screen onboarding' },
    h('header', { class: 'ob-head' }, backBtn, h('div', { class: 'ob-bar', role: 'progressbar', 'aria-label': 'Setup progress' }, bar)),
    main,
    h('footer', { class: 'ob-foot' }, cta),
  );

  let current: Step = steps[0]!;

  function show(step: Step, direction: 'right' | 'left'): void {
    current = step;
    const list = visible();
    const index = list.indexOf(step);
    update((s) => void (s.onboardingStep = steps.indexOf(step)), { quiet: true });

    backBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
    bar.style.transform = `scaleX(${((index + 1) / list.length).toFixed(3)})`;
    cta.textContent = step.cta ?? 'Continue';

    const refresh = () => void (cta.disabled = !step.ready());
    const content = h(
      'div',
      { class: 'ob-content' },
      step.say ? coachSays(mascotSvg(step.mood, 64), step.say) : null,
      step.body(refresh),
    );
    clear(main);
    main.appendChild(content);
    main.scrollTop = 0;
    animateIn(content, direction);
    refresh();
  }

  function next(): void {
    if (!current.ready()) return;
    current.leave?.();
    const list = visible();
    const following = list[list.indexOf(current) + 1];
    if (following) return show(following, 'right');
    // End of the list: lock in the profile and open the app.
    if (!isCompleteProfile(draft)) return;
    update((s) => {
      s.profile = { ...draft, limits: [...draft.limits] };
      s.draft = {};
      s.onboardingDone = true;
      s.onboardingStep = 0;
    }, { quiet: true });
    onDone();
  }

  function back(): void {
    const list = visible();
    const previous = list[list.indexOf(current) - 1];
    if (previous) show(previous, 'left');
  }

  cta.addEventListener('click', next);
  backBtn.addEventListener('click', back);

  // Reopen where the user left off, but never past an unanswered step.
  const wanted = steps[Math.min(saved.onboardingStep, steps.length - 1)] ?? steps[0]!;
  let resume = steps[0]!;
  for (const step of visible()) {
    resume = step;
    if (step === wanted || !step.ready()) break;
  }

  clear(root);
  root.appendChild(shell);
  show(resume, 'right');
}
