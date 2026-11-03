// Same rules as the Excel class record (Cover Page Grade_table + AQ/AS formulas).

export const COMPONENTS = ['CP', 'EA', 'MPT', 'CPT'];

export const DEFAULT_WEIGHTS = {
  midterm: { CP: 30, EA: 30, MPT: 40 },
  final: { CP: 30, EA: 30, MPT: 20, CPT: 20 },
};

// Grade point equivalence (VLOOKUP approximate match: largest threshold <= percentage).
// Thresholds are half a point below the printed range, so 95.5 counts as "96 - 100".
// A section can have its own scale (section.gradeScale); this is the NU default.
export const DEFAULT_SCALE = [
  { min: 95.5, eq: '4.0' },
  { min: 89.5, eq: '3.5' },
  { min: 83.5, eq: '3.0' },
  { min: 77.5, eq: '2.5' },
  { min: 71.5, eq: '2.0' },
  { min: 65.5, eq: '1.5' },
  { min: 59.5, eq: '1.0' },
];
export const FAIL_EQ = 'R';
export const MAX_SCALE_ROWS = 7; // what the class record's equivalence table can show

export const scaleOf = (section) =>
  (section?.gradeScale?.length ? section.gradeScale.map(({ min, eq }) => ({ min, eq })) : DEFAULT_SCALE).sort((a, b) => b.min - a.min);

export function equivalent(pct, passFail = false, scale = DEFAULT_SCALE) {
  if (pct == null || Number.isNaN(pct)) return null;
  const lowest = scale.length ? Math.min(...scale.map((s) => s.min)) : 59.5;
  if (passFail) return pct > lowest ? 'Pass' : 'Repeat';
  for (const { min, eq } of scale) if (pct >= min) return eq;
  return FAIL_EQ;
}

// Validates a scale from the client: 1–7 rows, thresholds 1–100 and different, short labels.
export function cleanScale(rows) {
  if (!Array.isArray(rows) || !rows.length) return { error: 'Add at least one grade.' };
  if (rows.length > MAX_SCALE_ROWS) return { error: `At most ${MAX_SCALE_ROWS} grades (the class record table has ${MAX_SCALE_ROWS} rows plus R).` };
  const out = [];
  for (const r of rows) {
    const min = Number(r?.min);
    const eq = String(r?.eq ?? '').trim().slice(0, 6);
    if (!(min > 0 && min <= 100)) return { error: 'Each grade needs a starting percentage between 1 and 100.' };
    if (!eq) return { error: 'Each grade needs an equivalent (e.g. 4.0).' };
    if (eq.toUpperCase() === FAIL_EQ) return { error: `"${FAIL_EQ}" is used for grades below the lowest range.` };
    out.push({ min: Math.round(min * 100) / 100, eq });
  }
  out.sort((a, b) => b.min - a.min);
  if (new Set(out.map((r) => r.min)).size !== out.length) return { error: 'Two grades start at the same percentage.' };
  return { rows: out };
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

export const MARKS = ['P', 'L', 'A', 'E'];
const markOf = (enrollment, sessionId) => {
  const m = enrollment.attendance;
  return (m instanceof Map ? m.get(String(sessionId)) : m?.[String(sessionId)]) || null;
};

// One attendance item per period, for this student: present = 1, late = section setting, absent = 0;
// excused sessions don't count. A session the faculty hasn't marked counts as absent (like a blank score).
export function attendanceItems(section, enrollment) {
  const att = section.attendance;
  if (!att?.component || !att.sessions?.length) return [];
  const late = att.late ?? 0.5;
  return ['MID', 'POST'].flatMap((period) => {
    const sessions = att.sessions.filter((s) => s.period === period);
    let max = 0;
    let score = 0;
    for (const s of sessions) {
      const mark = markOf(enrollment, s._id);
      if (mark === 'E') continue;
      max += 1;
      score += mark === 'P' ? 1 : mark === 'L' ? late : 0;
    }
    if (!max) return [];
    return [{ _id: `att-${period}`, component: att.component, period, label: 'Attendance', max, score: round2(score), sessions: sessions.length }];
  });
}

export function computeGrades(section, enrollment) {
  const att = attendanceItems(section, enrollment);
  const items = [...(section.items || []), ...att];
  const w = section.weights || DEFAULT_WEIGHTS;
  const raw = enrollment.scores || {};
  const scores = new Map(raw instanceof Map ? raw : Object.entries(raw));
  for (const a of att) scores.set(a._id, a.score);
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
  const scale = scaleOf(section);
  // A final-only subject has no midterm grade (and no MPT in its final grade).
  if (section.gradingMode === 'final') {
    const finalOnly =
      fraction(pick('CP'), scores) * (w.final.CP || 0) +
      fraction(pick('EA'), scores) * (w.final.EA || 0) +
      fraction(pick('CPT'), scores) * (w.final.CPT || 0) +
      (enrollment.bonus || 0);
    return {
      midterm: { percent: null, equivalent: null },
      final: { percent: round2(finalOnly), equivalent: equivalent(finalOnly, passFail, scale) },
    };
  }
  return {
    midterm: { percent: round2(midterm), equivalent: equivalent(midterm, passFail, scale) },
    final: { percent: round2(final), equivalent: equivalent(final, passFail, scale) },
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
