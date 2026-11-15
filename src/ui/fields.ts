// The profile questions. Each function builds the inputs for one topic and
// writes answers into a "draft" object. Onboarding shows them one topic per
// screen; the Edit Profile sheet shows them all at once. Same parts, two layouts.
import {
  DAY_OPTIONS,
  EXPERIENCES,
  GENDERS,
  GOALS,
  LABELS,
  LIMITS,
  MINUTE_OPTIONS,
  RANGE,
  type Limit,
  type Profile,
} from '../profile/profile';
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg, round1, type UnitSystem } from '../profile/units';
import { chips, choiceCards, numberField, segmented } from './components';
import { h } from './dom';

export type Draft = Partial<Profile>;
type Changed = () => void;

export function genderField(draft: Draft, changed: Changed): HTMLElement {
  return choiceCards(
    'Gender',
    GENDERS.map((g) => ({ value: g, label: LABELS.gender[g] })),
    draft.gender,
    (v) => {
      draft.gender = v;
      changed();
    },
  );
}

export function ageField(draft: Draft, changed: Changed): HTMLElement {
  return numberField({
    label: 'Age',
    unit: 'years',
    value: draft.age,
    min: RANGE.age.min,
    max: RANGE.age.max,
    onChange: (v) => {
      draft.age = v;
      changed();
    },
  });
}

/**
 * Height and weight, with a metric/imperial switch. The draft always holds
 * metric; in imperial mode we convert as the user types.
 */
export function bodyFields(
  draft: Draft,
  units: UnitSystem,
  setUnits: (u: UnitSystem) => void,
  changed: Changed,
): HTMLElement {
  const box = h('div', { class: 'stack' });
  const draw = (system: UnitSystem) => {
    const inputs = h('div', { class: 'stack' });
    if (system === 'metric') {
      inputs.append(
        numberField({
          label: 'Height',
          unit: 'cm',
          value: draft.heightCm === undefined ? undefined : Math.round(draft.heightCm),
          min: RANGE.heightCm.min,
          max: RANGE.heightCm.max,
          onChange: (v) => {
            draft.heightCm = v;
            changed();
          },
        }),
        numberField({
          label: 'Weight',
          unit: 'kg',
          value: draft.weightKg === undefined ? undefined : round1(draft.weightKg),
          min: RANGE.weightKg.min,
          max: RANGE.weightKg.max,
          decimal: true,
          onChange: (v) => {
            draft.weightKg = v;
            changed();
          },
        }),
      );
    } else {
      const start = draft.heightCm === undefined ? undefined : cmToFeetInches(draft.heightCm);
      let feet = start?.feet;
      let inches = start?.inches;
      const syncHeight = () => {
        const cm = feet === undefined || inches === undefined ? undefined : feetInchesToCm(feet, inches);
        draft.heightCm = cm !== undefined && cm >= RANGE.heightCm.min && cm <= RANGE.heightCm.max ? cm : undefined;
        changed();
      };
      inputs.append(
        h(
          'div',
          { class: 'pair' },
          numberField({ label: 'Height', unit: 'ft', value: feet, min: 3, max: 7, onChange: (v) => ((feet = v), syncHeight()) }),
          numberField({ label: ' ', unit: 'in', value: inches, min: 0, max: 11, onChange: (v) => ((inches = v), syncHeight()) }),
        ),
        numberField({
          label: 'Weight',
          unit: 'lb',
          value: draft.weightKg === undefined ? undefined : Math.round(kgToLb(draft.weightKg)),
          min: Math.ceil(kgToLb(RANGE.weightKg.min)),
          max: Math.floor(kgToLb(RANGE.weightKg.max)),
          onChange: (v) => {
            draft.weightKg = v === undefined ? undefined : lbToKg(v);
            changed();
          },
        }),
      );
    }
    return inputs;
  };
  let inputs = draw(units);
  box.append(
    segmented(
      'Units',
      [
        { value: 'metric', label: 'cm · kg' },
        { value: 'imperial', label: 'ft · lb' },
      ],
      units,
      (u) => {
        setUnits(u);
        const next = draw(u);
        inputs.replaceWith(next);
        inputs = next;
      },
    ),
    inputs,
  );
  return box;
}

export function goalField(draft: Draft, changed: Changed): HTMLElement {
  const sub = {
    'fat-loss': 'Burn more, feel lighter',
    muscle: 'Get stronger and firmer',
    general: 'Feel fit and healthy',
    endurance: 'Last longer, tire less',
  } as const;
  const icon = { 'fat-loss': 'flame', muscle: 'bolt', general: 'heart', endurance: 'sparkle' } as const;
  return choiceCards(
    'Goal',
    GOALS.map((g) => ({ value: g, label: LABELS.goal[g], sub: sub[g], icon: icon[g] })),
    draft.goal,
    (v) => {
      draft.goal = v;
      changed();
    },
  );
}

export function experienceField(draft: Draft, changed: Changed): HTMLElement {
  const sub = {
    new: 'I rarely work out, or I am coming back after a long break',
    some: 'I work out now and then and know the basic moves',
    experienced: 'I train most weeks and want a real challenge',
  } as const;
  return choiceCards(
    'Experience',
    EXPERIENCES.map((e) => ({ value: e, label: LABELS.experience[e], sub: sub[e] })),
    draft.experience,
    (v) => {
      draft.experience = v;
      changed();
    },
  );
}

export function scheduleFields(draft: Draft, changed: Changed): HTMLElement {
  return h(
    'div',
    { class: 'stack' },
    h('span', { class: 'field-label' }, 'Days per week'),
    chips(
      'Days per week',
      DAY_OPTIONS.map((d) => ({ value: d, label: String(d) })),
      draft.daysPerWeek === undefined ? [] : [draft.daysPerWeek],
      ([v]) => {
        draft.daysPerWeek = v;
        changed();
      },
    ),
    h('span', { class: 'field-label' }, 'Minutes per session'),
    chips(
      'Minutes per session',
      MINUTE_OPTIONS.map((m) => ({ value: m, label: String(m) })),
      draft.minutesPerSession === undefined ? [] : [draft.minutesPerSession],
      ([v]) => {
        draft.minutesPerSession = v;
        changed();
      },
    ),
  );
}

/**
 * Sore or injured areas. "None" is its own button so that the user has to
 * answer on purpose: an untouched question is not the same as "no limits".
 */
export function limitsField(draft: Draft, changed: Changed): HTMLElement {
  type Option = Limit | 'none';
  const current: Option[] = draft.limits === undefined ? [] : draft.limits.length === 0 ? ['none'] : [...draft.limits];
  const box = h('div');
  const draw = (selected: Option[]) => {
    box.replaceChildren(
      chips<Option>(
        'Areas to protect',
        [...LIMITS.map((l) => ({ value: l as Option, label: LABELS.limit[l] })), { value: 'none' as Option, label: 'None, all good' }],
        selected,
        (values) => {
          const before = draft.limits === undefined ? [] : draft.limits.length === 0 ? ['none'] : draft.limits;
          const pickedNone = values.includes('none') && !before.includes('none');
          const next: Option[] = pickedNone ? ['none'] : values.filter((v) => v !== 'none');
          draft.limits = next.filter((v): v is Limit => v !== 'none');
          if (next.length === 0) draft.limits = undefined;
          changed();
          draw(next);
        },
        { multi: true },
      ),
    );
  };
  draw(current);
  return box;
}
