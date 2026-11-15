// The pre-exercise health questions. They follow the idea of the standard
// PAR-Q screening form used by gyms: a "yes" does not ban anyone from
// exercising, it means "check with a doctor first".

export const HEALTH_QUESTIONS: readonly string[] = [
  'Has a doctor ever said you have a heart condition or high blood pressure?',
  'Do you get chest pain when resting, in daily life, or when you exercise?',
  'Do you get dizzy and lose your balance, or have you fainted in the last 12 months?',
  'Do you have a bone, joint or muscle problem that exercise could make worse?',
  'Has a doctor advised you against exercise, or said to exercise only under supervision?',
  'Are you pregnant, recently gave birth, or have another condition or medicine that could affect exercising safely?',
];

export const NOT_MEDICAL_ADVICE =
  'Repling is a fitness tool, not medical advice. Stop if something hurts or you feel unwell.';
