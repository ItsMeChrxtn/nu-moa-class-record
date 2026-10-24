// Grading sheet: one workbook for a faculty member, a Summary sheet plus one sheet per section,
// laid out like the NU class record (CP / EA by period, MPT, CPT, grades and remarks).
import ExcelJS from 'exceljs';
import { Section, Enrollment } from './models.js';
import { attendanceItems, computeGrades } from './grading.js';
import { to12 } from './schedule.js';

const INK = 'FF0F172A';
const FILL = { CP: 'FFE8EEFC', EA: 'FFE2F5F2', MPT: 'FFFDF3DD', CPT: 'FFFDF3DD', BONUS: 'FFF4F5F7', GRADE: 'FF0F172A' };
const GROUP_NAME = { CP: 'Class Participation', EA: 'Enabling Activities', MPT: 'Midterm Performance Task', CPT: 'Culminating Performance Task' };
const ORDER = ['CP-MID', 'CP-POST', 'EA-MID', 'EA-POST', 'MPT', 'CPT'];
const thin = { style: 'thin', color: { argb: 'FFCBD2DC' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const titleCase = (s = '') => s.toLowerCase().replace(/(^|[\s.-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
const isFail = (eq) => eq === 'R' || eq === 'Repeat';
const groupKey = (i) => (i.component === 'CP' || i.component === 'EA' ? `${i.component}-${i.period}` : i.component);

function scheduleText(s) {
  if (s.schedule?.length) return s.schedule.map((r) => `${r.day} ${to12(r.start)}–${to12(r.end)}${r.room ? ` Rm ${r.room}` : ''}`).join('; ');
  // Older sections: "WED|FRI" + "7:00 - 9:40|10:00 - 12:40" -> "WED 7:00 - 9:40; FRI 10:00 - 12:40"
  const split = (v) => String(v || '').split('|').map((x) => x.trim()).filter(Boolean);
  const days = split(s.day);
  const times = split(s.time);
  const n = Math.max(days.length, times.length);
  const rows = Array.from({ length: n }, (_, i) => [days[i] ?? days.at(-1), times[i] ?? times.at(-1)].filter(Boolean).join(' '));
  return [rows.join('; '), s.room && `Rm ${s.room}`].filter(Boolean).join(' · ');
}

const weightsText = (w) =>
  w ? `Midterm: CP ${w.midterm?.CP ?? 0} · EA ${w.midterm?.EA ?? 0} · MPT ${w.midterm?.MPT ?? 0}   |   Final: CP ${w.final?.CP ?? 0} · EA ${w.final?.EA ?? 0} · MPT ${w.final?.MPT ?? 0} · CPT ${w.final?.CPT ?? 0}` : '';

// Excel sheet names: max 31 chars, no []:*?/\ and unique.
function sheetName(wanted, used) {
  let base = String(wanted).replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || 'Section';
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 27)} (${n})`;
  used.add(name.toLowerCase());
  return name;
}

export function gradingFileName(faculty, sections) {
  const last = (faculty.name.includes(',') ? faculty.name.split(',')[0] : faculty.name.split(/\s+/).slice(-2).join(' ')).trim().toUpperCase();
  const terms = [...new Set(sections.map((s) => `${s.term}|${s.academicYear}`))];
  let suffix = new Date().toISOString().slice(0, 10);
  if (terms.length === 1) {
    const [term, ay] = terms[0].split('|');
    const t = { first: 'T1', second: 'T2', third: 'T3' }[String(term).toLowerCase().split(/\s+/)[0]] || term;
    const y = String(ay).match(/(\d{2})(\d{2})\s*-\s*\d{2}(\d{2})/);
    suffix = `${t} AY${y ? `${y[2]}-${y[3]}` : ay}`;
  }
  return `GRADING SHEET ${last} ${suffix}.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
}

export async function buildGradingWorkbook(faculty) {
  const sections = await Section.find({ faculty: faculty._id }).sort({ academicYear: 1, term: 1, code: 1 });
  const wb = new ExcelJS.Workbook();
  wb.creator = titleCase(faculty.name);
  wb.created = new Date();
  const used = new Set(['summary']);
  const summary = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 6 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const summaryRows = [];

  for (const sec of sections) {
    const enrollments = (await Enrollment.find({ section: sec._id }).populate('student')).filter((e) => e.student);
    enrollments.sort((a, b) => a.student.name.localeCompare(b.student.name));

    // Columns: stored items in class-record order, attendance (if graded) at the end of its group.
    const attCols = enrollments.length ? attendanceItems(sec, enrollments[0]).map((a) => ({ ...a, max: (sec.attendance.sessions || []).filter((s) => s.period === a.period).length })) : [];
    const items = [...sec.items.map((i) => ({ _id: String(i._id), component: i.component, period: i.period, label: i.label, max: i.max })), ...attCols.map((a) => ({ ...a, att: true }))];
    items.sort((a, b) => ORDER.indexOf(groupKey(a)) - ORDER.indexOf(groupKey(b)) || (a.att ? 1 : 0) - (b.att ? 1 : 0));
    const groups = [];
    for (const it of items) {
      const k = groupKey(it);
      if (groups.at(-1)?.key === k) groups.at(-1).items.push(it);
      else groups.push({ key: k, component: it.component, period: it.component === 'CP' || it.component === 'EA' ? it.period : null, items: [it] });
    }

    const ws = wb.addWorksheet(sheetName(sec.code, used), {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 13 }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '11:13' },
    });

    // Header block
    ws.getCell('A1').value = 'NU MOA · CLASS RECORD';
    ws.getCell('A1').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1D4ED8' } };
    ws.getCell('A2').value = `${sec.code}${sec.subjectTitle ? ` · ${titleCase(sec.subjectTitle)}` : ''}`;
    ws.getCell('A2').font = { name: 'Arial', size: 16, bold: true, color: { argb: INK } };
    const info = [
      ['Faculty', titleCase(faculty.name), 'Section', sec.code],
      ['Subject', [sec.subjectCode, sec.subjectTitle && titleCase(sec.subjectTitle)].filter(Boolean).join(' — '), 'Units', sec.units ?? ''],
      ['Schedule', scheduleText(sec), 'Term & A.Y.', [sec.term, sec.academicYear].filter(Boolean).join(' ')],
      ['Percentage', weightsText(sec.weights), 'Students', enrollments.length],
      ['Attendance', sec.attendance?.component ? `Counts toward ${GROUP_NAME[sec.attendance.component]} (late = ${sec.attendance.late} pt, excused not counted)` : 'Not graded', 'Generated', new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })],
    ];
    info.forEach(([k1, v1, k2, v2], i) => {
      const r = ws.getRow(4 + i);
      r.getCell(2).value = k1;
      r.getCell(3).value = v1;
      r.getCell(8).value = k2;
      r.getCell(9).value = v2;
      for (const c of [2, 8]) r.getCell(c).font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF64748B' } };
      for (const c of [3, 9]) r.getCell(c).font = { name: 'Arial', size: 10, color: { argb: INK } };
      ws.mergeCells(4 + i, 3, 4 + i, 7);
    });

    // Table header: row 11 groups, row 12 item labels, row 13 max scores
    const H1 = 11, H2 = 12, H3 = 13, FIRST = 14;
    const fixed = ['#', 'Student No.', 'Student Name', 'Course'];
    fixed.forEach((t, i) => {
      ws.mergeCells(H1, i + 1, H3, i + 1);
      ws.getCell(H1, i + 1).value = t;
    });
    let col = fixed.length + 1;
    const itemCol = {};
    for (const g of groups) {
      const start = col;
      for (const it of g.items) {
        itemCol[it._id] = col;
        ws.getCell(H2, col).value = it.att ? 'Attendance' : it.label;
        ws.getCell(H3, col).value = it.max;
        col++;
      }
      if (col - 1 > start) ws.mergeCells(H1, start, H1, col - 1);
      ws.getCell(H1, start).value = `${GROUP_NAME[g.component]}${g.period ? ` · ${g.period === 'MID' ? 'Midterms' : 'Post Midterms'}` : ''}`;
      for (let c = start; c < col; c++) for (const r of [H1, H2, H3]) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[g.component] } };
    }
    const tail = ['Bonus', 'Midterm %', 'Midterm Eq', 'Final %', 'Final Eq', 'Remarks'];
    const tailCol = {};
    tail.forEach((t) => {
      tailCol[t] = col;
      ws.mergeCells(H1, col, H3, col);
      ws.getCell(H1, col).value = t;
      ws.getCell(H1, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: t === 'Bonus' ? FILL.BONUS : INK } };
      col++;
    });
    const lastCol = col - 1;
    for (const r of [H1, H2, H3])
      for (let c = 1; c <= lastCol; c++) {
        const cell = ws.getCell(r, c);
        const dark = c >= tailCol['Midterm %'];
        cell.font = { name: 'Arial', size: r === H3 ? 8 : 9, bold: r !== H3, color: { argb: dark ? 'FFFFFFFF' : r === H3 ? 'FF64748B' : INK } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = box;
      }
    ws.getRow(H1).height = 30;

    // Students
    let passing = 0;
    let sumMid = 0;
    let sumFin = 0;
    enrollments.forEach((e, idx) => {
      const r = ws.getRow(FIRST + idx);
      const g = computeGrades(sec, e);
      const att = Object.fromEntries(attendanceItems(sec, e).map((a) => [a._id, a.score]));
      r.getCell(1).value = idx + 1;
      r.getCell(2).value = e.student.studentNo;
      r.getCell(3).value = e.student.name;
      r.getCell(4).value = e.student.course || '';
      for (const it of items) {
        const v = it.att ? att[it._id] : e.scores.get(it._id);
        if (typeof v === 'number') r.getCell(itemCol[it._id]).value = v;
      }
      if (e.bonus) r.getCell(tailCol.Bonus).value = e.bonus;
      r.getCell(tailCol['Midterm %']).value = g.midterm.percent;
      r.getCell(tailCol['Midterm Eq']).value = g.midterm.equivalent;
      r.getCell(tailCol['Final %']).value = g.final.percent;
      r.getCell(tailCol['Final Eq']).value = g.final.equivalent;
      r.getCell(tailCol.Remarks).value = isFail(g.final.equivalent) ? (g.final.equivalent === 'Repeat' ? 'Repeat' : 'Failed') : 'Passed';
      if (!isFail(g.final.equivalent)) passing++;
      sumMid += g.midterm.percent || 0;
      sumFin += g.final.percent || 0;
      for (let c = 1; c <= lastCol; c++) {
        const cell = r.getCell(c);
        cell.border = box;
        cell.font = { name: 'Arial', size: 9, color: { argb: INK } };
        cell.alignment = { horizontal: c === 3 || c === 4 ? 'left' : 'center', vertical: 'middle' };
        if (idx % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      for (const k of ['Midterm %', 'Final %']) r.getCell(tailCol[k]).numFmt = '0.00';
      for (const [k, grade] of [['Midterm Eq', g.midterm], ['Final Eq', g.final], ['Remarks', g.final]])
        if (isFail(grade.equivalent)) r.getCell(tailCol[k]).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFB4232A' } };
        else r.getCell(tailCol[k]).font = { name: 'Arial', size: 9, bold: true, color: { argb: INK } };
    });
    if (!enrollments.length) ws.getCell(FIRST, 3).value = 'No students enrolled yet.';

    // Column widths
    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 14;
    ws.getColumn(3).width = 36;
    ws.getColumn(4).width = 15;
    for (let c = 5; c < tailCol.Bonus; c++) ws.getColumn(c).width = 8.5;
    ws.getColumn(tailCol.Bonus).width = 7;
    for (const k of ['Midterm %', 'Final %']) ws.getColumn(tailCol[k]).width = 10;
    for (const k of ['Midterm Eq', 'Final Eq']) ws.getColumn(tailCol[k]).width = 9;
    ws.getColumn(tailCol.Remarks).width = 10;

    const n = enrollments.length;
    summaryRows.push([
      sec.code,
      sec.subjectCode || '',
      sec.subjectTitle ? titleCase(sec.subjectTitle) : '',
      [sec.term, sec.academicYear].filter(Boolean).join(' '),
      scheduleText(sec),
      n,
      n ? Math.round((sumMid / n) * 100) / 100 : null,
      n ? Math.round((sumFin / n) * 100) / 100 : null,
      n ? `${passing} / ${n}` : '—',
      sec.published ? 'Published' : 'Hidden',
    ]);
  }

  // Summary sheet
  summary.getCell('A1').value = 'NU MOA · CLASS RECORD';
  summary.getCell('A1').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1D4ED8' } };
  summary.getCell('A2').value = 'Grading Sheet';
  summary.getCell('A2').font = { name: 'Arial', size: 18, bold: true, color: { argb: INK } };
  summary.getCell('A3').value = `${titleCase(faculty.name)} · ${sections.length} section${sections.length === 1 ? '' : 's'} · generated ${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`;
  summary.getCell('A3').font = { name: 'Arial', size: 10, color: { argb: 'FF475569' } };
  const head = ['Section', 'Subject Code', 'Subject Title', 'Term & A.Y.', 'Schedule', 'Students', 'Avg Midterm %', 'Avg Final %', 'Passing', 'Grades'];
  summary.getRow(6).values = head;
  summary.getRow(6).eachCell((c) => {
    c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = box;
  });
  summary.getRow(6).height = 24;
  summaryRows.forEach((vals, i) => {
    const r = summary.getRow(7 + i);
    r.values = vals;
    r.eachCell({ includeEmpty: true }, (c, n) => {
      c.font = { name: 'Arial', size: 10, bold: n === 1, color: { argb: INK } };
      c.border = box;
      c.alignment = { vertical: 'middle', horizontal: n >= 6 ? 'center' : 'left', wrapText: n === 5 };
    });
    for (const n of [7, 8]) r.getCell(n).numFmt = '0.00';
  });
  if (!summaryRows.length) summary.getCell('A7').value = 'No sections yet.';
  [12, 14, 34, 22, 40, 10, 14, 12, 10, 11].forEach((w, i) => (summary.getColumn(i + 1).width = w));

  return { wb, sections };
}
