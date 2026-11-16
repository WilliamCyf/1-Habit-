// The app after onboarding: a "Today" tab and a "Me" tab, with a tab bar
// at the bottom like a native iPhone app. More tabs (World, Progress) are
// added when those features are real, never as empty placeholders.
import { getState, resetAll, update } from '../app/store';
import { dailyNeed, energyTarget, goalBlurb, LEVEL_NAMES, roundKcal, startLevel, workoutBurn } from '../profile/energy';
import { HEALTH_QUESTIONS, NOT_MEDICAL_ADVICE } from '../profile/health';
import { LABELS, profileProblems, type Profile } from '../profile/profile';
import { formatHeight, formatWeight } from '../profile/units';
import { requestPersistence, storageUsage } from '../platform/storage';
import type { ThemeChoice } from '../state/save';
import { exportBackup, importBackup } from './backup';
import { button, coachSays, confirmSheet, icon, openSheet, segmented, toast } from './components';
import { animateIn, clear, formatNumber, h } from './dom';
import { openCalorieSheet } from './explain';
import { ageField, bodyFields, experienceField, genderField, goalField, limitsField, scheduleFields, type Draft } from './fields';
import type { IconName } from './icons';
import { installSteps, isStandalone, openInstallSheet } from './install';
import { mascotSvg } from './mascot';
import { trainingCards } from './train';

type Tab = 'today' | 'me';
declare const __APP_VERSION__: string;

function greeting(now = new Date()): string {
  const hour = now.getHours();
  return hour < 5 ? 'Still up?' : hour < 12 ? 'Good morning!' : hour < 18 ? 'Good afternoon!' : 'Good evening!';
}

function stat(name: IconName, value: string, label: string): HTMLElement {
  return h('div', { class: 'stat' }, icon(name, 'icon stat-icon'), h('strong', null, value), h('small', null, label));
}

function row(label: string, value: string): HTMLElement {
  return h('div', { class: 'row' }, h('span', null, label), h('strong', null, value));
}

function linkRow(name: IconName, label: string, action: (() => void) | string, note?: string): HTMLElement {
  const inner = [
    icon(name),
    h('span', { class: 'link-text' }, label, note ? h('small', null, note) : null),
    icon('chevron', 'icon chev'),
  ];
  return typeof action === 'string'
    ? h('a', { class: 'link-row', href: action }, ...inner)
    : h('button', { class: 'link-row', type: 'button', onclick: action }, ...inner);
}

// -------------------------------------------------------------- Today tab

function todayTab(p: Profile): HTMLElement {
  const state = getState();
  const level = startLevel(p, state.health?.anyYes ?? false);
  const target = energyTarget(p);
  const last = state.history[state.history.length - 1];
  return h(
    'div',
    { class: 'tab-content' },
    h('h1', { class: 'page-title' }, greeting()),
    coachSays(
      mascotSvg('happy', 64),
      last ? 'Welcome back! Here is your plan.' : 'Your coaching is ready. Let us find your level first.',
    ),

    ...trainingCards(p),

    h(
      'div',
      { class: 'card level-card' },
      h('small', null, 'Starting level'),
      h('strong', null, LEVEL_NAMES[level]),
      h('p', { class: 'muted' }, `${LABELS.goal[p.goal]}: ${goalBlurb(p.goal).toLowerCase()}`),
    ),
    h(
      'div',
      { class: 'stats' },
      stat('flame', formatNumber(roundKcal(dailyNeed(p))), 'kcal you burn per day'),
      stat('bolt', formatNumber(roundKcal(workoutBurn(p))), `kcal per ${p.minutesPerSession}-min workout`),
      stat('heart', formatNumber(roundKcal(target.kcal)), 'kcal gentle daily target'),
      stat('calendar', `${p.daysPerWeek} × ${p.minutesPerSession}`, 'days × minutes a week'),
    ),
    button('How is this calculated?', { variant: 'ghost', icon: 'calculator', block: true, onClick: () => openCalorieSheet(p) }),

    h(
      'div',
      { class: 'card' },
      h('h2', null, 'In the workshop'),
      h('p', { class: 'muted small' }, 'Repling is being built in stages. This is what arrives next.'),
      h(
        'ul',
        { class: 'roadmap' },
        h('li', { class: 'done' }, icon('check'), h('span', null, 'Your profile and safety check')),
        h('li', { class: 'done' }, icon('check'), h('span', null, 'Camera rep counting for push-ups, with a voice coach')),
        h('li', { class: 'done' }, icon('check'), h('span', null, 'Twelve exercises and a 4-week plan that adapts to you')),
        h('li', null, h('span', { class: 'dot' }), h('span', null, 'Points for every verified rep')),
        h('li', null, h('span', { class: 'dot' }), h('span', null, 'Your pet and garden')),
      ),
    ),

    h('div', { class: 'card list' }, linkRow('camera', 'Camera check', './diag.html', 'See the body tracking in action')),

    isStandalone()
      ? null
      : h(
          'div',
          { class: 'card' },
          h('h2', null, 'Add Repling to your Home Screen'),
          h('p', { class: 'muted small' }, 'It opens full-screen and works without internet.'),
          button('Show me how', { variant: 'secondary', block: true, icon: 'addSquare', onClick: openInstallSheet }),
        ),

    h('p', { class: 'muted small center' }, NOT_MEDICAL_ADVICE),
  );
}

// ----------------------------------------------------------------- Me tab

function openEditProfile(p: Profile): void {
  const draft: Draft = { ...p, limits: [...p.limits] };
  let units = getState().settings.units;
  const noop = () => {};
  openSheet('Edit profile', (sheet) =>
    h(
      'div',
      { class: 'stack' },
      h('h3', null, 'About you'),
      genderField(draft, noop),
      ageField(draft, noop),
      h('h3', null, 'Body'),
      bodyFields(draft, units, (u) => void (units = u), noop),
      h('h3', null, 'Goal'),
      goalField(draft, noop),
      h('h3', null, 'Experience'),
      experienceField(draft, noop),
      h('h3', null, 'Schedule'),
      scheduleFields(draft, noop),
      h('h3', null, 'Areas to protect'),
      limitsField(draft, noop),
      button('Save changes', {
        block: true,
        onClick: () => {
          const problems = profileProblems(draft);
          if (problems.length) {
            const names: Record<string, string> = {
              gender: 'gender',
              age: 'age',
              heightCm: 'height',
              weightKg: 'weight',
              goal: 'goal',
              experience: 'experience',
              daysPerWeek: 'days per week',
              minutesPerSession: 'minutes',
              limits: 'areas to protect',
            };
            toast(`Please check: ${problems.map((f) => names[f]).join(', ')}`, 4000);
            return;
          }
          update((s) => {
            s.profile = draft as Profile;
            s.settings.units = units;
          });
          sheet.close();
          toast('Profile saved');
        },
      }),
    ),
  );
}

function openHealthSheet(): void {
  const existing = getState().health;
  const answers: (boolean | null)[] = HEALTH_QUESTIONS.map((_, i) => existing?.answers[i] ?? null);
  openSheet('Health check', (sheet) =>
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
            (v) => void (answers[i] = v === 'yes'),
          ),
        ),
      ),
      h('p', { class: 'notice' }, 'If any answer is yes, please check with a doctor before exercising. I will keep your plan one level gentler.'),
      button('Save answers', {
        block: true,
        onClick: () => {
          if (answers.some((a) => a === null)) return toast('Please answer every question');
          update((s) => {
            s.health = {
              answeredAt: new Date().toISOString(),
              answers: answers.map((a) => a === true),
              anyYes: answers.some((a) => a === true),
              acknowledged: true,
            };
          });
          sheet.close();
          toast('Health check saved');
        },
      }),
    ),
  );
}

function meTab(p: Profile): HTMLElement {
  const state = getState();
  const units = state.settings.units;
  const storageNote = h('small', null, 'Checking…');
  void Promise.all([requestPersistence(), storageUsage()]).then(([persist, usage]) => {
    const protectedText =
      persist === 'granted' ? 'Protected from automatic clean-up' : isStandalone() ? 'Saved on this phone' : 'Add to Home Screen to protect it';
    storageNote.textContent = usage ? `${protectedText} · ${usage.usedMb.toFixed(1)} MB used` : protectedText;
  });
  const healthDate = state.health
    ? new Date(state.health.answeredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'not answered';

  return h(
    'div',
    { class: 'tab-content' },
    h('h1', { class: 'page-title' }, 'Me'),

    h(
      'div',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Profile'), h('button', { class: 'text-btn', type: 'button', onclick: () => openEditProfile(p) }, 'Edit')),
      row('Gender', LABELS.gender[p.gender]),
      row('Age', `${p.age}`),
      row('Height', formatHeight(p.heightCm, units)),
      row('Weight', formatWeight(p.weightKg, units)),
      row('Goal', LABELS.goal[p.goal]),
      row('Experience', LABELS.experience[p.experience]),
      row('Schedule', `${p.daysPerWeek} days · ${p.minutesPerSession} min`),
      row('Protecting', p.limits.length ? p.limits.map((l) => LABELS.limit[l]).join(', ') : 'Nothing'),
    ),

    h(
      'div',
      { class: 'card stack' },
      h('h2', null, 'Preferences'),
      h('span', { class: 'field-label' }, 'Units'),
      segmented(
        'Units',
        [
          { value: 'metric', label: 'cm · kg' },
          { value: 'imperial', label: 'ft · lb' },
        ],
        units,
        (u) => update((s) => void (s.settings.units = u)),
      ),
      h('span', { class: 'field-label' }, 'Coach’s voice'),
      segmented(
        'Coach voice',
        [
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ],
        state.settings.voice ? 'on' : 'off',
        (v) => update((s) => void (s.settings.voice = v === 'on')),
      ),
      h('span', { class: 'field-label' }, 'Beeps and chimes'),
      segmented(
        'Sound effects',
        [
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ],
        state.settings.sound ? 'on' : 'off',
        (v) => update((s) => void (s.settings.sound = v === 'on')),
      ),
      h('span', { class: 'field-label' }, 'Appearance'),
      segmented<ThemeChoice>(
        'Appearance',
        [
          { value: 'system', label: 'Auto' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ],
        state.settings.theme,
        (t) => update((s) => void (s.settings.theme = t)),
      ),
    ),

    h(
      'div',
      { class: 'card list' },
      h('h2', null, 'Health and safety'),
      linkRow('heart', 'Health check', openHealthSheet, `Answered ${healthDate}${state.health?.anyYes ? ' · gentler plan' : ''}`),
      linkRow('calculator', 'How calories are calculated', () => openCalorieSheet(p)),
    ),

    h(
      'div',
      { class: 'card list' },
      h('h2', null, 'Your data'),
      h('div', { class: 'row note-row' }, icon('shield'), h('span', { class: 'link-text' }, 'Stored only on this phone', storageNote)),
      linkRow('download', 'Export a backup', () => void exportBackup(), 'Save a copy to Files'),
      linkRow('upload', 'Import a backup', importBackup, 'Restore from a saved copy'),
      linkRow('trash', 'Erase everything', async () => {
        const yes = await confirmSheet({
          title: 'Erase everything?',
          message: 'This deletes your profile and all progress from this phone. Export a backup first if you might want it back.',
          confirm: 'Erase everything',
          danger: true,
        });
        if (yes) resetAll();
      }),
    ),

    h(
      'div',
      { class: 'card list' },
      h('h2', null, 'Help'),
      isStandalone() ? null : linkRow('addSquare', 'Add to Home Screen', openInstallSheet),
      linkRow('camera', 'Camera check', './diag.html', 'Speed and tracking diagnostics'),
      linkRow('info', 'About and privacy', () =>
        openSheet('About Repling', (sheet) =>
          h(
            'div',
            { class: 'stack' },
            h('div', { class: 'center', html: mascotSvg('happy', 96) }),
            h('p', null, 'A home workout coach that counts real reps with your camera.'),
            h('h3', null, 'Privacy'),
            h(
              'p',
              { class: 'muted' },
              'The camera picture is analysed on this phone and then thrown away. Nothing is recorded, saved or uploaded. There is no account and no server, and the app is locked so it cannot contact any other website.',
            ),
            h('h3', null, 'Safety'),
            h('p', { class: 'muted' }, NOT_MEDICAL_ADVICE),
            h('h3', null, 'Credits'),
            h('p', { class: 'muted' }, 'Body tracking by MediaPipe (Google, Apache 2.0 licence). All artwork is original.'),
            h('p', { class: 'muted small' }, `Version ${__APP_VERSION__}`),
            button('Close', { block: true, variant: 'secondary', onClick: () => sheet.close() }),
          ),
        ),
      ),
    ),

    isStandalone() ? null : h('div', { class: 'card' }, h('h2', null, 'Add to Home Screen'), installSteps()),
  );
}

// -------------------------------------------------------------- the shell

let tab: Tab = 'today';

export function renderHome(root: HTMLElement): () => void {
  const content = h('main', { class: 'scroll home-scroll' });
  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'today', label: 'Today', icon: 'today' },
    { id: 'me', label: 'Me', icon: 'person' },
  ];
  const tabButtons = tabs.map((t) =>
    h('button', { class: 'tab', type: 'button', role: 'tab', onclick: () => select(t.id) }, icon(t.icon), h('span', null, t.label)),
  );
  const shell = h('section', { class: 'screen home' }, content, h('nav', { class: 'tabbar', role: 'tablist' }, ...tabButtons));

  /** Redraw the current tab. `animate` only when the tab actually changed. */
  function draw(animate: boolean): void {
    const p = getState().profile;
    if (!p) return;
    const keepScroll = animate ? 0 : content.scrollTop;
    const view = tab === 'today' ? todayTab(p) : meTab(p);
    clear(content);
    content.appendChild(view);
    content.scrollTop = keepScroll;
    if (animate) animateIn(view, 'up');
    tabButtons.forEach((b, i) => b.setAttribute('aria-selected', String(tabs[i]!.id === tab)));
  }

  function select(next: Tab): void {
    if (next === tab) return void (content.scrollTop = 0);
    tab = next;
    draw(true);
  }

  clear(root);
  root.appendChild(shell);
  draw(true);
  // The caller subscribes this to the store, so edits show up immediately.
  return () => draw(false);
}
