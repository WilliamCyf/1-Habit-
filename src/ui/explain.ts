// "How is this calculated?" Shows the calorie maths step by step, using the
// user's own numbers, so nothing is a black box.
import { activityFactor, bmr, dailyNeed, energyTarget, roundKcal, SESSION_MET, workoutBurn } from '../profile/energy';
import { LABELS, type Profile } from '../profile/profile';
import { round1 } from '../profile/units';
import { button, fraction, openSheet } from './components';
import { formatNumber, h } from './dom';

function row(...parts: (string | HTMLElement)[]): HTMLElement {
  return h('p', { class: 'calc-row' }, ...parts);
}

export function openCalorieSheet(p: Profile): void {
  const offset = p.gender === 'male' ? 5 : p.gender === 'female' ? -161 : -78;
  const base = bmr(p);
  const factor = activityFactor(p.daysPerWeek);
  const need = dailyNeed(p);
  const target = energyTarget(p);
  const met = SESSION_MET[p.experience];
  const burn = workoutBurn(p);
  const kg = round1(p.weightKg);
  const cm = Math.round(p.heightCm);

  openSheet('How we calculate', (sheet) =>
    h(
      'div',
      { class: 'stack calc' },
      h('p', { class: 'muted' }, 'These are standard formulas. They are estimates: real bodies differ by 10% or more either way.'),

      h('h3', null, '1. Resting energy'),
      h('p', { class: 'muted small' }, 'What your body burns in a day just staying alive, like a car idling. Formula: Mifflin-St Jeor.'),
      row(`10 × ${kg} kg = ${formatNumber(10 * p.weightKg)}`),
      row(`6.25 × ${cm} cm = ${formatNumber(6.25 * p.heightCm)}`),
      row(`5 × ${p.age} years = ${formatNumber(5 * p.age)}`),
      row(`Adjustment (${LABELS.gender[p.gender].toLowerCase()}) = ${offset > 0 ? '+' : '−'}${Math.abs(offset)}`),
      row(
        h(
          'strong',
          null,
          `${formatNumber(10 * p.weightKg)} + ${formatNumber(6.25 * p.heightCm)} − ${formatNumber(5 * p.age)} ${offset > 0 ? '+' : '−'} ${Math.abs(
            offset,
          )} = ${formatNumber(base)} kcal`,
        ),
      ),

      h('h3', null, '2. Daily need'),
      h('p', { class: 'muted small' }, `Resting energy times an activity number. For ${p.daysPerWeek} training days a week the usual number is ${factor}.`),
      row(h('strong', null, `${formatNumber(base)} × ${factor} = ${formatNumber(need)} ≈ ${formatNumber(roundKcal(need))} kcal`)),

      h('h3', null, '3. Your gentle target'),
      h('p', { class: 'muted small' }, target.note),
      row(
        h(
          'strong',
          null,
          target.change === 0
            ? `Same as daily need: ${formatNumber(roundKcal(target.kcal))} kcal`
            : `${formatNumber(need)} ${target.change > 0 ? '+' : '−'} ${formatNumber(Math.abs(target.change))} = ${formatNumber(
                roundKcal(target.kcal),
              )} kcal`,
        ),
      ),

      h('h3', null, '4. One workout'),
      h(
        'p',
        { class: 'muted small' },
        `Effort is measured in METs: how many times harder than sitting still. A session at your level averages about ${met}, rests included.`,
      ),
      row('kcal = effort × weight × ', fraction('minutes', '60')),
      row(`= ${met} × ${kg} × `, fraction(String(p.minutesPerSession), '60')),
      row(h('strong', null, `= ${formatNumber(burn)} ≈ ${formatNumber(roundKcal(burn))} kcal`)),

      button('Got it', { block: true, onClick: () => sheet.close() }),
    ),
  );
}
