// Turns PDF text (grouped into lines of cells) into a class list.
// Works on class records and enrollment lists: each student row has an
// ID number (2023-150144) followed by a "LAST, FIRST MIDDLE" name, and
// usually a course code (BSIT-MWA-MNL).

const ID = /(\d{4}-\d{4,7})/;
const ID_CELL = /(?:^|\s)(\d{4}-\d{4,7})$/;
const NAME = /^[\p{L}][\p{L}\p{M} .'’-]*,\s*[\p{L}][\p{L}\p{M} .'’-]*$/u;
const ID_AND_NAME = /(\d{4}-\d{4,7})\s+([\p{L}][\p{L}\p{M} .'’-]*,\s*[\p{L}][\p{L}\p{M} .'’-]*?)(?=\s{2,}|\s+\d|\s+(?:BS|AB|BA|ACT)[A-Z]*-|\s+\S+@|$)/u;
// "BSIT-MWA-MNL", "BSCS-MNL", or "BSAccountancy" / "BSIT" (Official Classlist).
const COURSE = /^(?:(?:BS|AB|BA|ACT|BT|BE|BM)[A-Z]*(?:-[A-Z0-9]+)+|(?:BS|AB|BA)[A-Z][A-Za-z]{1,30})$/;
const SECTION = /^[A-Z]{2,5}\d{2,4}[A-Z]?$/;
export const EMAIL = /[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const emailIn = (cells) => cells.join(' ').match(EMAIL)?.[0].toLowerCase() || '';

// Masterlists can carry an enrollment status per row. Only enrolled students are imported:
// a row marked "Registered" (signed up but not yet enrolled) is left out.
const REGISTERED = /\bregistered\b/i;
const ENROLLED = /\benrolled\b/i;

const clean = (s) => s.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();

// Group positioned text items (pdf.js getTextContent) into rows of cells.
export function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const [, , , d, x, y] = it.transform;
    const h = Math.abs(d) || it.height || 8;
    let row = rows.find((r) => Math.abs(r.y - y) < Math.min(r.h, h) * 0.5);
    if (!row) rows.push((row = { y, h, items: [] }));
    row.items.push({ x, w: it.width, str: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    const cells = [];
    let end = -Infinity;
    for (const it of r.items) {
      const gap = it.x - end;
      if (cells.length && gap < r.h * 0.6) cells[cells.length - 1] += (gap > r.h * 0.12 ? ' ' : '') + it.str;
      else cells.push(it.str);
      end = it.x + it.w;
    }
    return cells.map(clean).filter(Boolean);
  });
}

export function parseStudentLines(lines) {
  const found = new Map();
  const skipped = new Map(); // registered, not enrolled
  let sectionCode = null;
  let registered = false; // status of the row being read

  // Email (if the list has one) is taken from the same row as the student.
  const add = (studentNo, name, course, email) => {
    name = clean(name).toUpperCase();
    const into = registered ? skipped : found;
    if (!found.has(studentNo) && !skipped.has(studentNo)) into.set(studentNo, { studentNo, name, course: course || '', email: email || '' });
  };

  for (const cells of lines) {
    const rowText = cells.join(' ');
    registered = REGISTERED.test(rowText) && !ENROLLED.test(rowText);
    if (!sectionCode) sectionCode = cells.find((c) => SECTION.test(c)) || null;

    let matched = false;
    cells.forEach((cell, i) => {
      if (!NAME.test(cell)) return;
      // Nearest ID to the left of the name, within two cells.
      for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
        const m = cells[j].match(ID_CELL);
        if (m) {
          const course = cells.slice(i + 1, i + 4).find((c) => COURSE.test(c));
          add(m[1], cell, course, emailIn(cells));
          matched = true;
          return;
        }
      }
    });
    if (matched) continue;

    // Fallback: ID and name ended up in the same cell / line.
    const flat = cells.join('  ');
    const m = flat.match(ID_AND_NAME);
    if (m) {
      const course = cells.find((c) => COURSE.test(c));
      add(m[1], m[2], course, emailIn(cells));
    }
  }

  const byName = (a, b) => a.name.localeCompare(b.name);
  return { students: [...found.values()].sort(byName), sectionCode, registered: [...skipped.values()].sort(byName) };
}

// Section details from the header of a class record / master list.
// NU class records put each value just above its label ("BASIC NETWORKING" over
// "Subject Title"); other lists use "Label: value" on one line. Both are tried.
const FIELDS = [
  { key: 'subjectTitle', labels: ['subject title', 'descriptive title', 'course title', 'subject description'] },
  { key: 'subjectCode', labels: ['subject code', 'course code'] },
  // "Subject: BASIC NETWORKING (CTBASNTL)" / "Subject Name  BAITBUSL: I.T. APPLICATION TOOLS IN BUSINESS"
  { key: 'subject', labels: ['subject name', 'subject'] },
  { key: 'code', labels: ['section', 'section code', 'block'] },
  { key: 'day', labels: ['day', 'days'] },
  { key: 'time', labels: ['time', 'schedule'] },
  { key: 'room', labels: ['room'] },
  { key: 'units', labels: ['units', 'unit'] },
  { key: 'termYear', labels: ['term and academic year', 'term & academic year', 'term/academic year', 'term', 'semester'] },
  { key: 'academicYear', labels: ['academic year', 'school year', 'a.y.', 's.y.'] },
];
const LABEL_KEYS = new Map(FIELDS.flatMap((f) => f.labels.map((l) => [l, f.key])));
const norm = (s) => s.toLowerCase().replace(/[:\s]+$/, '').replace(/\s+/g, ' ').trim();

export function parseSectionInfo(items) {
  const pos = items
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({ str: clean(it.str), x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || 8 }));
  const labels = pos.filter((p) => LABEL_KEYS.has(norm(p.str)));
  const isLabel = new Set(labels);
  const raw = {};
  const labelFor = (key) => labels.find((l) => LABEL_KEYS.get(norm(l.str)) === key);

  // 1) Schedule table (Grade Submission Report): "Day | Time | Room" headers with one row per meeting below.
  const dayL = labelFor('day');
  if (dayL) {
    const timeL = labelFor('time');
    const roomL = labelFor('room');
    const rows = pos
      .filter((p) => p.y < dayL.y && p.y > dayL.y - dayL.h * 10 && Math.abs(p.x - dayL.x) < dayL.h * 6 && isDays(p.str))
      .sort((a, b) => b.y - a.y);
    if (rows.length) {
      const nearest = (r, l, test) =>
        l && pos.filter((p) => p !== r && Math.abs(p.y - r.y) < r.h * 0.6 && test(p.str)).sort((a, b) => Math.abs(a.x - l.x) - Math.abs(b.x - l.x))[0]?.str;
      raw.day = rows.map((r) => r.str).join('|');
      const times = rows.map((r) => nearest(r, timeL, (s) => TIME.test(s)));
      // The same time on every day is stored once; it then applies to all days.
      if (times.every(Boolean)) raw.time = new Set(times).size === 1 ? times[0] : times.join('|');
      // One room per meeting, kept in the same order as the days.
      const rooms = rows.map((r) => nearest(r, roomL, isRoom) || '');
      if (rooms.some(Boolean)) raw.room = new Set(rooms).size === 1 ? rooms[0] : rooms.join(' / ');
    }
  }

  // 2) Value printed just above the label, within the label's column (NU class record header).
  for (const l of labels) {
    const key = LABEL_KEYS.get(norm(l.str));
    // "Label:" has its value on the same line (step 3).
    if (raw[key] || /:\s*$/.test(l.str)) continue;
    const right = labels.filter((o) => o !== l && Math.abs(o.y - l.y) < 2 && o.x > l.x).reduce((m, o) => Math.min(m, o.x), l.x + 120);
    const above = pos
      .filter((p) => !isLabel.has(p) && p.y > l.y + l.h * 0.4 && p.y < l.y + l.h * 3 && p.x >= l.x - l.h * 2 && p.x < right - 2)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    if (!above.length) continue;
    const rowY = above[0].y;
    const row = above.filter((p) => Math.abs(p.y - rowY) < l.h * 0.6).sort((a, b) => a.x - b.x);
    // Only the run of text that starts at the label; a wide gap means the next table column.
    const run = [row[0]];
    for (const p of row.slice(1)) {
      const prev = run[run.length - 1];
      if (p.x - (prev.x + prev.w) > l.h * 2.5) break;
      run.push(p);
    }
    const value = run.map((p) => p.str).join(' ');
    if (valid(key, value)) raw[key] = value;
  }

  // 3) "Label: value" or "Label   value" (Official Classlist) on the same line.
  const lines = itemsToLines(items).map((cells) => cells.join('  '));
  for (const line of lines) {
    for (const f of FIELDS) {
      if (raw[f.key]) continue;
      for (const l of f.labels) {
        const label = l.replace(/[.*+?^${}()|[\]\\/&]/g, '\\$&');
        const m = line.match(new RegExp(`(?:^|\\s)${label}(?:\\s*[:\\-]\\s*|\\s{2,})(.+?)(?=\\s{2,}|$)`, 'i'));
        if (m && valid(f.key, m[1].trim())) {
          raw[f.key] = m[1].trim();
          break;
        }
      }
    }
  }

  // 4) Free-standing "AY 2025 - 2026 3rd Term".
  if (!raw.termYear && !raw.academicYear) {
    const m = lines.join('\n').match(/\b(?:A\.?\s?Y\.?|S\.?\s?Y\.?)\s*(\d{4}\s*[-–]\s*\d{2,4})\s*,?\s*((?:1st|2nd|3rd|first|second|third|summer)\s*(?:term|semester|sem)?)?/i);
    if (m) raw.termYear = `${m[2] || ''} ${m[1]}`;
  }

  const info = {};
  if (raw.subject) {
    const paren = raw.subject.match(/^(.*?)\s*\(([A-Z0-9-]{3,15})\)\s*$/i); // TITLE (CODE)
    const colon = raw.subject.match(/^([A-Z0-9-]{3,15})\s*[:–-]\s+(.+)$/i); // CODE: TITLE
    if (paren) {
      raw.subjectTitle ||= paren[1];
      raw.subjectCode ||= paren[2];
    } else if (colon) {
      raw.subjectCode ||= colon[1];
      raw.subjectTitle ||= colon[2];
    } else if (/^[A-Z0-9-]{3,15}$/i.test(raw.subject)) raw.subjectCode ||= raw.subject;
    else raw.subjectTitle ||= raw.subject;
  }
  if (raw.code && SECTION.test(raw.code.replace(/\s+/g, '').toUpperCase())) info.code = raw.code.replace(/\s+/g, '').toUpperCase();
  if (raw.subjectCode && /^[A-Z0-9-]{3,15}$/i.test(raw.subjectCode)) info.subjectCode = raw.subjectCode.toUpperCase();
  if (raw.subjectTitle && /[a-z]/i.test(raw.subjectTitle)) info.subjectTitle = raw.subjectTitle;
  if (raw.day) info.day = raw.day.toUpperCase().replace(/\s*(\/|,|&|\band\b)\s*/g, '|').replace(/\s+/g, '');
  if (raw.time && TIME.test(raw.time)) {
    // "03:00PM - 06:20PM" -> "3:00 PM - 6:20 PM"
    info.time = raw.time.replace(/\s*\/\s*/g, '|').replace(/\b0(\d:)/g, '$1').replace(/(\d)\s*([AP]M)\b/gi, '$1 $2');
  }
  if (raw.room) info.room = raw.room;
  const units = parseFloat(raw.units);
  if (units > 0 && units < 10) info.units = String(units);
  const ty = `${raw.termYear || ''} ${raw.academicYear || ''}`;
  const ay = ty.match(/(\d{4})\s*[-–]\s*(\d{2,4})/);
  if (ay) info.academicYear = `${ay[1]}-${ay[2].length === 2 ? ay[1].slice(0, 2) + ay[2] : ay[2]}`;
  const term = (raw.termYear || '').replace(/(A\.?\s?Y\.?|S\.?\s?Y\.?)?\s*\d{4}\s*[-–]\s*\d{2,4}/i, '').replace(/[,·]/g, ' ').trim();
  if (term) info.term = normalizeTerm(term);
  return info;
}

const DAY = /^(MON(DAY)?|TUE(S|SDAY)?|WED(NESDAY)?|THU(R|RS|RSDAY)?|FRI(DAY)?|SAT(URDAY)?|SUN(DAY)?|MWF|MW|TTH|TF|TH)$/i;
const TIME = /\d{1,2}:\d{2}/;
const isDays = (s) => s.split(/\s*(?:\/|,|&|\||\band\b)\s*/i).every((t) => DAY.test(t.trim()));
// "1032", "VR_1200A", "LAB-2"; not the room *type* column (Lec / Lab).
const isRoom = (s) => /^[A-Z0-9][A-Z0-9_./-]{1,14}$/i.test(s) && !/^(lec|lab|lecture|laboratory)$/i.test(s);
// What each header field must look like before it is accepted.
const VALID = {
  code: (v) => SECTION.test(v.replace(/\s+/g, '').toUpperCase()),
  day: isDays,
  time: (v) => TIME.test(v),
  room: isRoom,
  subjectCode: (v) => /^[A-Z0-9-]{3,15}$/i.test(v),
  units: (v) => parseFloat(v) > 0 && parseFloat(v) < 10,
};
const valid = (key, v) => !VALID[key] || VALID[key](String(v).trim());
const ORDINAL = { '1st': 'First', '2nd': 'Second', '3rd': 'Third' };
const normalizeTerm = (t) =>
  t.replace(/\s+/g, ' ').split(' ').map((w) => ORDINAL[w.toLowerCase()] || w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');

export const isStudentNo =(s) => new RegExp(`^${ID.source}$`).test(String(s).trim());
