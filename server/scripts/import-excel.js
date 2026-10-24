// Import an NU MOA class record workbook (Cover Page + one sheet per section) into MongoDB.
//
//   npm run import -- "<path to .xlsx>" [--faculty-username cldelrosario]
//
// Without --faculty-username, the faculty account whose name matches the Cover Page is reused.
//
// Re-running replaces the items and scores of the imported sections with what is in the file.
// New student accounts get random temporary passwords, written to credentials/*.csv.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { User, Student, Section, Enrollment } from '../src/models.js';
import { DEFAULT_WEIGHTS } from '../src/grading.js';
import { hashPassword, tempPassword } from '../src/auth.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
if (!file) {
  console.error('Usage: npm run import -- "<path to .xlsx>" [--faculty-username cldelrosario]');
  process.exit(1);
}

// Cell value with formulas resolved to their cached result.
function val(cell) {
  let v = cell?.value;
  if (v && typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('result' in v) v = v.result;
    else if ('richText' in v) v = v.richText.map((t) => t.text).join('');
    else if ('error' in v) v = null;
    else if ('formula' in v || 'sharedFormula' in v) v = null;
  }
  return typeof v === 'string' ? v.trim() : v ?? null;
}
const text = (cell) => {
  const v = val(cell);
  return v == null ? '' : String(v).trim();
};

function readCover(wb) {
  const ws = wb.getWorksheet('Cover Page');
  if (!ws) throw new Error('Walang "Cover Page" sheet.');
  const sections = [];
  for (let r = 19; r <= 28; r++) {
    const code = text(ws.getCell(`E${r}`));
    if (!code) continue;
    sections.push({
      code,
      subjectCode: text(ws.getCell(`G${r}`)),
      subjectTitle: text(ws.getCell(`I${r}`)),
      day: text(ws.getCell(`N${r}`)),
      time: text(ws.getCell(`P${r}`)),
      room: text(ws.getCell(`R${r}`)),
      units: Number(val(ws.getCell(`T${r}`))) || null,
    });
  }
  return {
    facultyName: text(ws.getCell('C13')),
    academicYear: text(ws.getCell('M13')).replace(/\s+/g, ''),
    term: text(ws.getCell('R13')),
    department: text(ws.getCell('C15')),
    sections,
  };
}

function readSectionSheet(ws) {
  // Header row is the one with '#' in column C (row 9 in the template).
  let hr = 0;
  for (let r = 1; r <= 20 && !hr; r++) if (text(ws.getCell(r, 3)) === '#') hr = r;
  if (!hr) throw new Error(`${ws.name}: header row not found`);

  const cols = { items: [] };
  for (let c = 1; c <= ws.columnCount; c++) {
    const head = text(ws.getCell(hr, c));
    const sub = text(ws.getCell(hr + 1, c));
    const label = text(ws.getCell(hr + 2, c));
    const max = Number(val(ws.getCell(hr + 3, c)));
    if (head === 'Student Name') cols.name = c;
    else if (head === 'ID Number') cols.id = c; // last ID column left of the name (the FILTER from References)
    else if (head === 'Course') cols.course = c;
    else if (head === 'BONUS') cols.bonus = c;

    let component = null;
    if (/class participation/i.test(head)) component = 'CP';
    else if (/enabling activities/i.test(head)) component = 'EA';
    else if (/major performance/i.test(head)) component = sub === 'CPT' ? 'CPT' : 'MPT';
    if (component && max > 0) {
      const period = /^post/i.test(sub) ? 'POST' : 'MID';
      cols.items.push({ col: c, component, period, label: label || sub || component, max });
    }
  }
  if (!cols.name || !cols.id) throw new Error(`${ws.name}: walang ID Number / Student Name column`);

  // Percentage Allocation table: row with 'Components', then Midterm Grade / Final Grade rows.
  const weights = structuredClone(DEFAULT_WEIGHTS);
  for (let r = 1; r < hr; r++) {
    for (let c = 1; c <= ws.columnCount; c++) {
      if (text(ws.getCell(r, c)) !== 'Components') continue;
      for (let cc = c + 1; cc <= c + 8; cc++) {
        const k = text(ws.getCell(r, cc));
        if (!['CP', 'EA', 'MPT', 'CPT'].includes(k)) continue;
        const m = Number(val(ws.getCell(r + 1, cc)));
        const f = Number(val(ws.getCell(r + 2, cc)));
        if (k !== 'CPT') weights.midterm[k] = Number.isFinite(m) ? m : 0;
        weights.final[k] = Number.isFinite(f) ? f : 0;
      }
    }
  }

  const students = [];
  for (let r = hr + 4; r <= ws.rowCount; r++) {
    const id = text(ws.getCell(r, cols.id));
    if (!id) break;
    const scores = {};
    cols.items.forEach((it, idx) => {
      const v = val(ws.getCell(r, it.col));
      if (typeof v === 'number') scores[idx] = v;
    });
    const bonus = cols.bonus ? Number(val(ws.getCell(r, cols.bonus))) || 0 : 0;
    students.push({
      studentNo: id,
      name: text(ws.getCell(r, cols.name)),
      course: cols.course ? text(ws.getCell(r, cols.course)) : '',
      scores,
      bonus,
    });
  }
  return { items: cols.items, weights, students };
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const cover = readCover(wb);
  console.log(`Faculty: ${cover.facultyName} | ${cover.term} ${cover.academicYear}`);

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/class-record');
  const credentials = [];

  // Without --faculty-username, reuse the faculty account named on the Cover Page
  // (its username may have been changed since the first import).
  const facultyUsername = flag('faculty-username', null);
  let faculty = facultyUsername
    ? await User.findOne({ username: facultyUsername })
    : await User.findOne({ role: 'faculty', name: cover.facultyName });
  if (!faculty && !facultyUsername) faculty = await User.findOne({ username: 'faculty' });
  if (!faculty) {
    const pw = tempPassword();
    faculty = await User.create({
      username: facultyUsername || 'faculty',
      passwordHash: await hashPassword(pw),
      role: 'faculty',
      name: cover.facultyName || facultyUsername || 'faculty',
    });
    credentials.push(['FACULTY', faculty.username, faculty.name, pw]);
  }

  for (const info of cover.sections) {
    const ws = wb.getWorksheet(info.code);
    if (!ws) {
      console.warn(`  ! No sheet for ${info.code}, skipped.`);
      continue;
    }
    const data = readSectionSheet(ws);
    const section = await Section.findOneAndUpdate(
      { code: info.code, term: cover.term, academicYear: cover.academicYear },
      {
        ...info,
        term: cover.term,
        academicYear: cover.academicYear,
        department: cover.department,
        faculty: faculty._id,
        weights: data.weights,
        items: data.items.map(({ component, period, label, max }) => ({ component, period, label, max })),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const itemIds = section.items.map((i) => String(i._id));

    await Enrollment.deleteMany({ section: section._id });
    for (const s of data.students) {
      const student = await Student.findOneAndUpdate(
        { studentNo: s.studentNo },
        { name: s.name, course: s.course },
        { upsert: true, new: true }
      );
      if (!(await User.exists({ student: student._id }))) {
        const pw = tempPassword();
        await User.create({
          username: s.studentNo,
          passwordHash: await hashPassword(pw),
          role: 'student',
          name: s.name,
          student: student._id,
        });
        credentials.push([info.code, s.studentNo, s.name, pw]);
      }
      const scores = Object.fromEntries(Object.entries(s.scores).map(([idx, v]) => [itemIds[idx], v]));
      await Enrollment.create({ section: section._id, student: student._id, scores, bonus: s.bonus });
    }
    console.log(`  ✓ ${info.code}: ${data.students.length} students, ${data.items.length} items`);
  }

  if (credentials.length) {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../credentials');
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `initial-passwords-${Date.now()}.csv`);
    const csv = (v) => `"${String(v).replace(/"/g, '""')}"`;
    fs.writeFileSync(
      out,
      ['Section,Username,Name,TempPassword', ...credentials.map((r) => r.map(csv).join(','))].join('\n')
    );
    console.log(`\n${credentials.length} new accounts. Temporary passwords: ${out}`);
    console.log('Do not commit or share this file; give each student only their own password.');
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
