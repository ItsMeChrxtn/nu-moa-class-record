// Faculty Loading Report (the "STUDENT-CLASS-SCHEDULES" sheet): one row per class meeting, filled into
// the school's template. The template keeps its own formulas (teaching subtotal, total load, 40 − load);
// this only writes values. Unused class rows are hidden.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { SheetXml } from './classRecordExport.js';
import { DAYS } from './schedule.js';

export const LOADING_TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../templates/faculty-loading-template.xlsx');
const FIRST_ROW = 6;
const LAST_ROW = 25; // 20 class rows
// Below the class rows (see the template): Administration, consultation hours, preparations.
const CELL = { admin: 'K28', consultation: 'K35', preparations: 'K36' };
// [profile field, name cell, title cell]; the faculty's own name (A41) is a formula (=C2).
const SIGNATORIES = [
  ['checkedBy', 'C41', 'C42'],
  ['endorsedBy', 'F41', 'F42'],
  ['approvedBy', 'J41', 'J42'],
];
// The template lines the signatories up with leading spaces; keep the same indent.
const INDENT = { C: ' '.repeat(52), F: ' '.repeat(10), J: '' };

export const PROFILE_FIELDS = ['employeeId', 'classification', 'department', 'checkedBy', 'checkedByTitle', 'endorsedBy', 'endorsedByTitle', 'approvedBy', 'approvedByTitle'];

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const clock = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const round2 = (n) => Math.round(n * 100) / 100;

// Credit units per meeting: a LAB meeting is 1 unit; LEC meetings share the rest of the section's units.
function unitsFor(section, rows) {
  const total = Number(section.units) || 3;
  const labs = rows.filter((r) => r.type === 'LAB').length;
  const others = rows.length - labs;
  const lec = others ? Math.max(0, total - labs) / others : 0;
  return rows.map((r) => round2(r.type === 'LAB' ? 1 : lec));
}

// "TERM 1 AY2026-2027" and "1ST TERM-AY26-27" from the section's term and academic year.
function termParts(term, academicYear) {
  const n = { first: 1, second: 2, third: 3 }[String(term || '').toLowerCase().split(/\s+/)[0]];
  const y = String(academicYear || '').match(/(\d{4})\s*-\s*(\d{4})/);
  return {
    header: [n ? `TERM ${n}` : term, y ? `AY${y[1]}-${y[2]}` : academicYear].filter(Boolean).join(' '),
    file: [n ? `${['', '1ST', '2ND', '3RD'][n]} TERM` : String(term || '').toUpperCase(), y ? `AY${y[1].slice(2)}-${y[2].slice(2)}` : ''].filter(Boolean).join('-'),
  };
}

export function loadingFileName(faculty, term, academicYear) {
  const last = (faculty.name.includes(',') ? faculty.name.split(',')[0] : faculty.name.split(/\s+/).slice(-1)[0]).trim().toUpperCase();
  return `${last}_${termParts(term, academicYear).file}_STUDENT-CLASS-SCHEDULES.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
}

// sections: one term's sections (Mongoose docs); blocks: the faculty's weekly blocks; profile: saved report details.
export async function buildLoadingReport(faculty, sections, blocks, profile = {}, { term, academicYear } = {}) {
  const zip = await JSZip.loadAsync(fs.readFileSync(LOADING_TEMPLATE));
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const ws = new SheetXml(await zip.file(sheetPath).async('string'));

  // One row per meeting: sections in code order, meetings by day then start time.
  const meetings = [];
  for (const s of [...sections].sort((a, b) => a.code.localeCompare(b.code))) {
    const rows = (s.schedule || []).filter((r) => r.day && r.start && r.end);
    const units = unitsFor(s, rows);
    rows.forEach((r, i) => meetings.push({ s, r, units: units[i] }));
  }
  meetings.sort((a, b) => a.s.code.localeCompare(b.s.code) || DAYS.indexOf(a.r.day) - DAYS.indexOf(b.r.day) || a.r.start.localeCompare(b.r.start));
  const notes = [];
  if (meetings.length > LAST_ROW - FIRST_ROW + 1) notes.push(`Only the first ${LAST_ROW - FIRST_ROW + 1} of ${meetings.length} class meetings fit the report.`);

  ws.set('C1', profile.employeeId || '');
  ws.set('C2', faculty.name.toUpperCase());
  ws.set('C3', (profile.classification || '').toUpperCase());
  if (profile.department) ws.set('K1', profile.department.toUpperCase());
  ws.set('K3', termParts(term, academicYear).header);

  for (let row = FIRST_ROW; row <= LAST_ROW; row++) {
    const m = meetings[row - FIRST_ROW];
    if (!m) {
      for (const c of ['A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) ws.set(`${c}${row}`, null);
      ws.hideRow(row);
      continue;
    }
    const { s, r } = m;
    ws.set(`A${row}`, (s.subjectCode || '').toUpperCase());
    ws.set(`C${row}`, (s.subjectTitle || '').toUpperCase());
    ws.set(`D${row}`, s.code);
    ws.set(`E${row}`, r.day);
    ws.set(`F${row}`, `${clock(r.start)} - ${clock(r.end)}`);
    ws.set(`G${row}`, r.type || '');
    // Numeric rooms as numbers, so Excel doesn't flag "number stored as text".
    ws.set(`H${row}`, /^\d+$/.test(r.room || '') ? Number(r.room) : r.room || 'TBA');
    ws.set(`I${row}`, r.mode || 'F2F');
    ws.set(`J${row}`, m.units);
    ws.set(`K${row}`, round2((toMin(r.end) - toMin(r.start)) / 60));
  }

  // Weekly blocks: consultation hours on their own line, other working blocks under Administration.
  // Break time is never counted.
  const hours = (list) => round2(list.reduce((h, b) => h + (toMin(b.end) - toMin(b.start)) / 60, 0));
  const work = (blocks || []).filter((b) => b.kind !== 'break');
  const consult = work.filter((b) => /consult/i.test(b.label || ''));
  ws.set(CELL.consultation, hours(consult));
  ws.set(CELL.admin, hours(work.filter((b) => !consult.includes(b))));
  ws.set(CELL.preparations, new Set(sections.map((s) => s.subjectCode || s.subjectTitle || s.code)).size);

  for (const [key, nameCell, titleCell] of SIGNATORIES) {
    if (profile[key]) ws.set(nameCell, INDENT[nameCell[0]] + profile[key].toUpperCase());
    if (profile[`${key}Title`]) ws.set(titleCell, INDENT[titleCell[0]] + profile[`${key}Title`]);
  }

  zip.file(sheetPath, ws.toString());
  // Excel recalculates the totals when the file opens.
  let workbook = await zip.file('xl/workbook.xml').async('string');
  workbook = workbook.replace(/<calcPr\b([^>]*?)\/>/, (m, a) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"/>`);
  zip.file('xl/workbook.xml', workbook);
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship\b[^>]*Target="calcChain\.xml"\/>/, ''));
    const types = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml', types.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''));
  }
  return { buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), meetings: meetings.length, notes };
}
