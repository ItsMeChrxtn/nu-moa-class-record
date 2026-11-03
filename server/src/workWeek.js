// Work Week Schedule (the "workweek" sheet): Monday–Saturday in 20-minute rows, 7:00 AM – 9:00 PM.
// Classes are green (face-to-face) or blue (remote synchronous), admin/consultation blocks yellow,
// breaks white, and a day with nothing on it says DAY OFF. Totals: admin work, face-to-face, remote.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { SheetXml } from './classRecordExport.js';
import { splitPersonName, surnameOf } from './names.js';

export const WORKWEEK_TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../templates/workweek-template.xlsx');
const FIRST_ROW = 13; // 7:00 AM
const LAST_ROW = 54; // the 8:40 – 9:00 PM slot
const DAY_START = 7 * 60;
const SLOT = 20;
const COLUMN = { MON: 'B', TUE: 'C', WED: 'D', THU: 'E', FRI: 'F', SAT: 'G' };
// Style samples kept in the template (column Z): copied onto the blocks, then removed.
const SAMPLE = { admin: 'Z1', f2f: 'Z2', remote: 'Z3', break: 'Z4', dayOff: 'Z5' };
const DEFAULT_ADMIN_LABEL = 'Admin/Consultation Hours';

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const clock = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const round2 = (n) => Math.round(n * 100) / 100;
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
// "DEL ROSARIO, CHRISTIAN LLOYD E." -> "Christian Lloyd E. Del Rosario"
export const displayName = (n = '') => {
  const { surname, given } = splitPersonName(n);
  return titleCase([given, surname].filter(Boolean).join(' '));
};

function termNumber(term) {
  return { first: 1, second: 2, third: 3 }[String(term || '').toLowerCase().split(/\s+/)[0]];
}

export function workWeekFileName(faculty, term, academicYear) {
  const last = titleCase(surnameOf(faculty.name)); // the whole surname: Del Rosario, Dela Cruz …
  const y = String(academicYear || '').match(/\d{2}(\d{2})\s*-\s*\d{2}(\d{2})/);
  const n = termNumber(term);
  return `${last}_workweek_${n ? `T${n}` : ''}${y ? `AY${y[1]}-${y[2]}` : ''}.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
}

export async function buildWorkWeek(faculty, sections, blocks, profile = {}, { term, academicYear } = {}) {
  const zip = await JSZip.loadAsync(fs.readFileSync(WORKWEEK_TEMPLATE));
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const ws = new SheetXml(await zip.file(sheetPath).async('string'));
  const style = Object.fromEntries(Object.entries(SAMPLE).map(([k, ref]) => [k, ws.styleOf(ref.slice(0, 1), Number(ref.slice(1)))]));
  for (const ref of Object.values(SAMPLE)) ws.remove(ref);
  ws.remove('Z6');

  // Everything that happens on each day, as { start, end, kind, text }.
  const byDay = Object.fromEntries(Object.keys(COLUMN).map((d) => [d, []]));
  const hours = { admin: 0, f2f: 0, remote: 0 };
  for (const s of sections) {
    for (const r of s.schedule || []) {
      if (!byDay[r.day] || !r.start || !r.end) continue;
      const remote = r.mode === 'ONLINE';
      const title = [s.subjectCode, s.subjectTitle].filter(Boolean).join(':').toUpperCase();
      const text = [title, s.code, `(${clock(r.start)} - ${clock(r.end)})`, r.room && !remote ? `RM:${r.room}` : r.room].filter(Boolean).join('\n');
      byDay[r.day].push({ start: toMin(r.start), end: toMin(r.end), kind: remote ? 'remote' : 'f2f', text });
      hours[remote ? 'remote' : 'f2f'] += (toMin(r.end) - toMin(r.start)) / 60;
    }
  }
  for (const b of blocks || []) {
    if (!byDay[b.day]) continue;
    const isBreak = b.kind === 'break';
    const name = isBreak ? 'BREAKTIME' : !b.label || b.label === DEFAULT_ADMIN_LABEL ? 'ADMIN HOUR' : b.label.toUpperCase();
    byDay[b.day].push({ start: toMin(b.start), end: toMin(b.end), kind: isBreak ? 'break' : 'admin', text: isBreak ? name : `${name}\n${clock(b.start)} - ${clock(b.end)}` });
    if (!isBreak) hours.admin += (toMin(b.end) - toMin(b.start)) / 60;
  }

  const merges = [];
  const notes = [];
  for (const [day, col] of Object.entries(COLUMN)) {
    const list = byDay[day].sort((a, b) => a.start - b.start);
    // A day with no class and no admin hours is a day off.
    if (!list.some((x) => x.kind !== 'break')) {
      for (let r = FIRST_ROW; r <= LAST_ROW; r++) ws.set(`${col}${r}`, r === FIRST_ROW ? 'DAY OFF' : null, { style: style.dayOff });
      merges.push(`${col}${FIRST_ROW}:${col}${LAST_ROW}`);
      continue;
    }
    // Like the school's sheet, a block runs from the row labelled with its start time to the row
    // labelled with its end time (7:00–11:00 fills 7:00 … 11:00). A block that starts when the one
    // above ends begins on the next row. Times between labels round outwards.
    const rowAt = (min, round) => FIRST_ROW + round((min - DAY_START) / SLOT);
    const isClass = (x) => x.kind === 'f2f' || x.kind === 'remote';
    // 1. Each block's full span, start row to end row.
    const spans = [];
    let busyUntil = -1; // end time (minutes) of the last block kept
    for (const x of list) {
      if (x.start < busyUntil) {
        notes.push(`${day}: "${x.text.split('\n')[0]}" overlaps an earlier block and was left out.`);
        continue;
      }
      const top = Math.max(FIRST_ROW, rowAt(x.start, Math.floor));
      const bottom = Math.min(LAST_ROW, rowAt(x.end, Math.ceil));
      if (bottom < top) continue;
      busyUntil = x.end;
      spans.push({ x, top, bottom });
    }
    // 2. Two blocks that meet share a row: a class keeps it (the admin hour or break before or
    //    after it gives it up), otherwise the earlier block keeps it.
    for (let i = 1; i < spans.length; i++) {
      const prev = spans[i - 1];
      const cur = spans[i];
      if (cur.top > prev.bottom) continue;
      if (isClass(cur.x) && !isClass(prev.x) && prev.bottom - 1 >= prev.top) prev.bottom = cur.top - 1;
      else cur.top = prev.bottom + 1;
    }
    // 3. Write them.
    for (const { x, top, bottom } of spans) {
      if (bottom < top) continue;
      for (let r = top; r <= bottom; r++) ws.set(`${col}${r}`, r === top ? x.text : null, { style: style[x.kind] });
      if (bottom > top) merges.push(`${col}${top}:${col}${bottom}`);
    }
  }

  const n = termNumber(term);
  const y = String(academicYear || '').match(/(\d{4})\s*-\s*(\d{4})/);
  ws.set('A6', [n ? `TERM ${n}` : term, y ? `AY${y[1]} - ${y[2]}` : academicYear].filter(Boolean).join(', '));
  ws.set('B8', profile.employeeId || '');
  ws.set('B9', displayName(faculty.name));
  ws.set('C62', displayName(faculty.name));
  ws.set('C66', profile.checkedBy || '');
  ws.set('C70', profile.endorsedBy || '');
  ws.set('F57', round2(hours.admin));
  ws.set('F58', round2(hours.f2f));
  ws.set('F59', hours.remote ? round2(hours.remote) : null);

  let xml = ws.toString();
  if (merges.length) {
    const add = merges.map((m) => `<mergeCell ref="${m}"/>`).join('');
    xml = xml.replace(/<mergeCells count="(\d+)">([\s\S]*?)<\/mergeCells>/, (all, c, inner) => `<mergeCells count="${Number(c) + merges.length}">${inner}${add}</mergeCells>`);
  }
  xml = xml.replace(/<dimension ref="[^"]*"\/>/, '<dimension ref="A1:L71"/>');
  zip.file(sheetPath, xml);

  // Excel recalculates the total when the file opens.
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
  return { buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), notes, hours };
}

