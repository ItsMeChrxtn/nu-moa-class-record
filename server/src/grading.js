// Same rules as the Excel class record (Cover Page Grade_table + AQ/AS formulas).

export const COMPONENTS = ['CP', 'EA', 'MPT', 'CPT'];

export const DEFAULT_WEIGHTS = {
  midterm: { CP: 30, EA: 30, MPT: 40 },
  final: { CP: 30, EA: 30, MPT: 20, CPT: 20 },
};

// VLOOKUP approximate match: largest threshold <= percentage.
const EQUIVALENCE = [
  [95.5, '4.0'],
  [89.5, '3.5'],
  [83.5, '3.0'],
  [77.5, '2.5'],
  [71.5, '2.0'],
  [65.5, '1.5'],
  [59.5, '1.0'],
];

export function equivalent(pct, passFail = false) {
  if (pct == null || Number.isNaN(pct)) return null;
  if (passFail) return pct > 59.5 ? 'Pass' : 'Repeat';
  for (const [min, eq] of EQUIVALENCE) if (pct >= min) return eq;
  return 'R';
}

function scoreOf(scores, itemId) {
  const v = scores instanceof Map ? scores.get(String(itemId)) : scores?.[String(itemId)];
  return typeof v === 'number' ? v : 0;
}

// Fraction earned over a set of items; blank scores count as 0, like the SUM() in Excel.
function fraction(items, scores) {
  const max = items.reduce((s, i) => s + i.max, 0);
  if (!max) return 0;
  const got = items.reduce((s, i) => s + scoreOf(scores, i._id), 0);
  return got / max;
}

export function computeGrades(section, enrollment) {
  const items = section.items || [];
  const w = section.weights || DEFAULT_WEIGHTS;
  const scores = enrollment.scores || {};
  const pick = (component, period) =>
    items.filter((i) => i.component === component && (!period || i.period === period));

  const midterm =
    fraction(pick('CP', 'MID'), scores) * (w.midterm.CP || 0) +
    fraction(pick('EA', 'MID'), scores) * (w.midterm.EA || 0) +
    fraction(pick('MPT'), scores) * (w.midterm.MPT || 0);

  const final =
    fraction(pick('CP'), scores) * (w.final.CP || 0) +
    fraction(pick('EA'), scores) * (w.final.EA || 0) +
    fraction(pick('MPT'), scores) * (w.final.MPT || 0) +
    fraction(pick('CPT'), scores) * (w.final.CPT || 0) +
    (enrollment.bonus || 0);

  const passFail = /the nationalian/i.test(section.subjectTitle || '');
  return {
    midterm: { percent: round2(midterm), equivalent: equivalent(midterm, passFail) },
    final: { percent: round2(final), equivalent: equivalent(final, passFail) },
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
