// Grading sheet in the faculty's own NU class record format.
//
// Starts from the blank CLREC workbook (server/templates/class-record-template.xlsx) and fills it the
// way a faculty would by hand: Cover Page section list, References class list, and one copy of the
// TEMPLATE sheet per section (section code in U6, item names / max scores in rows 11–12, scores from
// row 13). The workbook's own formulas compute the grades. The file is edited at the XML level so
// formulas, named ranges, images, comments and the other sheets stay exactly as they are.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { Section, Enrollment } from './models.js';
import { attendanceItems } from './grading.js';
import { to12 } from './schedule.js';

export const TEMPLATE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../templates/class-record-template.xlsx');

// Fixed item columns of the TEMPLATE sheet.
const SLOTS = {
  'CP-MID': cols('J', 'P'),
  'CP-POST': cols('Q', 'W'),
  'EA-MID': cols('X', 'AD'),
  'EA-POST': cols('AE', 'AK'),
  MPT: ['AL'],
  CPT: ['AM'],
};
const BONUS = 'AN';
const FIRST_ROW = 13;
const TEMPLATE_ROWS = 50; // rows 13–62 carry the grade formulas
const COVER_ROWS = 10; // Cover Page section list, rows 19–28

function colNum(letters) {
  return letters.split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
}
function colName(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
function cols(a, b) {
  const out = [];
  for (let n = colNum(a); n <= colNum(b); n++) out.push(colName(n));
  return out;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const groupKey = (i) => (i.component === 'CP' || i.component === 'EA' ? `${i.component}-${i.period}` : i.component);

// Minimal editor for a worksheet's <sheetData>: set / clear cells, keeping each cell's style.
class SheetXml {
  constructor(xml) {
    const m = xml.match(/<sheetData\s*\/>|<sheetData>([\s\S]*?)<\/sheetData>/);
    if (!m) throw new Error('sheetData not found');
    this.before = xml.slice(0, m.index);
    this.after = xml.slice(m.index + m[0].length);
    this.rows = new Map();
    for (const rm of (m[1] || '').matchAll(/<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = Number(rm[1].match(/\br="(\d+)"/)[1]);
      const cells = new Map();
      for (const cm of (rm[3] || '').matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) cells.set(cm[0].match(/\br="([A-Z]+)\d+"/)[1], cm[0]);
      this.rows.set(r, { attrs: rm[1], cells });
    }
  }
  row(r) {
    if (!this.rows.has(r)) this.rows.set(r, { attrs: ` r="${r}"`, cells: new Map() });
    return this.rows.get(r);
  }
  styleOf(col, r) {
    return this.rows.get(r)?.cells.get(col)?.match(/\bs="(\d+)"/)?.[1];
  }
  // value: number, string, or null (empty cell, style kept). opts.text: write '' as empty text, not a blank cell.
  set(ref, value, opts = {}) {
    const [, col, rs] = ref.match(/^([A-Z]+)(\d+)$/);
    const r = Number(rs);
    const row = this.row(r);
    const s = this.styleOf(col, r);
    const sa = s ? ` s="${s}"` : '';
    let xml;
    if (value === '' && opts.text) xml = `<c r="${ref}"${sa} t="inlineStr"><is><t></t></is></c>`;
    else if (value === null || value === undefined || value === '') xml = `<c r="${ref}"${sa}/>`;
    else if (typeof value === 'number') xml = `<c r="${ref}"${sa}><v>${value}</v></c>`;
    else xml = `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
    row.cells.set(col, xml);
    row.attrs = row.attrs.replace(/\sspans="[^"]*"/, ''); // spans is only a hint; drop it once cells change
  }
  // Copy a whole row (cells, styles, formulas) to a new row number, e.g. for more than 50 students.
  cloneRow(from, to) {
    const src = this.rows.get(from);
    if (!src) return;
    const cells = new Map();
    for (const [col, xml] of src.cells) {
      let x = xml.replace(new RegExp(`\\br="${col}${from}"`), `r="${col}${to}"`);
      if (/<f\b[^>]*t="shared"/.test(x)) x = x.replace(/<f\b[^>]*\/>|<f\b[^>]*>[\s\S]*?<\/f>/, ''); // shared formulas can't be copied as-is
      x = x.replace(/<f\b([^>]*)>([\s\S]*?)<\/f>/, (m, a, f) => `<f${a}>${f.replace(new RegExp(`(\\$?[A-Z]{1,3})${from}(?!\\d)`, 'g'), `$1${to}`)}</f>`);
      x = x.replace(/<v>[\s\S]*?<\/v>|<v\/>/, '');
      cells.set(col, x);
    }
    this.rows.set(to, { attrs: src.attrs.replace(/\br="\d+"/, `r="${to}"`).replace(/\sspans="[^"]*"/, ''), cells });
  }
  toString() {
    const rows = [...this.rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, row]) => {
        const cells = [...row.cells.entries()].sort((a, b) => colNum(a[0]) - colNum(b[0])).map(([, x]) => x).join('');
        return cells ? `<row${row.attrs}>${cells}</row>` : `<row${row.attrs}/>`;
      });
    return `${this.before}<sheetData>${rows.join('')}</sheetData>${this.after}`;
  }
}

function sharedStrings(xml) {
  return [...(xml || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
}

// Map a section's items (plus attendance) onto the template's fixed columns. When a group has more
// items than columns, the extra ones are combined into the last column so the grade stays exact.
function columnsFor(section, enrollments) {
  const att = enrollments.length
    ? attendanceItems(section, enrollments[0]).map((a) => ({ ...a, label: 'Attend.', max: (section.attendance.sessions || []).filter((s) => s.period === a.period).length, att: true }))
    : [];
  const items = [...section.items.map((i) => ({ _id: String(i._id), component: i.component, period: i.period, label: i.label, max: i.max })), ...att];
  const columns = [];
  const notes = [];
  for (const [key, slots] of Object.entries(SLOTS)) {
    const group = items.filter((i) => groupKey(i) === key).sort((a, b) => (a.att ? 1 : 0) - (b.att ? 1 : 0));
    if (!group.length) continue;
    const single = group.length <= slots.length ? group.map((i) => [i]) : [...group.slice(0, slots.length - 1).map((i) => [i]), group.slice(slots.length - 1)];
    if (group.length > slots.length) notes.push(`${section.code}: ${group.length} ${key} items for ${slots.length} columns; the last column combines ${single.at(-1).map((i) => i.label).join(', ')}`);
    single.forEach((parts, n) => {
      columns.push({
        col: slots[n],
        label: parts.length === 1 ? parts[0].label : `${parts[0].label}–${parts.at(-1).label}`,
        max: parts.reduce((s, i) => s + i.max, 0),
        parts,
      });
    });
  }
  return { columns, notes };
}

function scoreFor(column, enrollment, attScores) {
  let total = 0;
  let any = false;
  for (const it of column.parts) {
    const v = it.att ? attScores[it._id] : enrollment.scores.get(it._id);
    if (typeof v === 'number') {
      total += v;
      any = true;
    }
  }
  return any ? Math.round(total * 100) / 100 : null;
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

export async function buildClassRecord(faculty, templatePath = TEMPLATE_PATH) {
  const sections = await Section.find({ faculty: faculty._id }).sort({ academicYear: 1, term: 1, code: 1 });
  const zip = await JSZip.loadAsync(fs.readFileSync(templatePath));
  const read = (p) => zip.file(p)?.async('string');
  const notes = [];

  let workbook = await read('xl/workbook.xml');
  let wbRels = await read('xl/_rels/workbook.xml.rels');
  let types = await read('[Content_Types].xml');
  const strings = sharedStrings(await read('xl/sharedStrings.xml'));

  // Locate the sheets by name.
  const sheetEls = [...workbook.matchAll(/<sheet\b[^>]*\/>/g)].map((m) => m[0]);
  const target = (name) => {
    const el = sheetEls.find((s) => s.includes(`name="${name}"`));
    if (!el) throw new Error(`The template has no "${name}" sheet`);
    const rid = el.match(/r:id="([^"]+)"/)[1];
    return { el, path: `xl/${wbRels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))[1].replace(/^\/?xl\//, '')}` };
  };
  const template = target('TEMPLATE');
  const cover = target('Cover Page');
  const refs = target('References');
  const templateIndex = sheetEls.indexOf(template.el);
  const templateXml = await read(template.path);
  const templateRelsPath = template.path.replace('worksheets/', 'worksheets/_rels/') + '.rels';
  const templateRels = (await read(templateRelsPath)) || '';

  // Unique names for new parts.
  const files = Object.keys(zip.files);
  const nextNum = (re) => Math.max(0, ...files.map((f) => Number(f.match(re)?.[1] || 0))) + 1;
  let sheetN = nextNum(/^xl\/worksheets\/sheet(\d+)\.xml$/);
  let ridN = Math.max(0, ...[...wbRels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))) + 1;
  let sheetId = Math.max(0, ...sheetEls.map((s) => Number(s.match(/sheetId="(\d+)"/)[1]))) + 1;
  const counters = {};
  const copyPart = async (fromPath) => {
    // e.g. xl/drawings/drawing2.xml -> xl/drawings/drawing7.xml (plus its own .rels, which point to shared media)
    const m = fromPath.match(/^(.*\/)([A-Za-z]+?)(\d*)\.(\w+)$/);
    const key = `${m[1]}${m[2]}.${m[4]}`;
    counters[key] ??= nextNum(new RegExp(`^${m[1].replace(/\//g, '\\/')}${m[2]}(\\d+)\\.${m[4]}$`));
    const to = `${m[1]}${m[2]}${counters[key]++}.${m[4]}`;
    zip.file(to, await zip.file(fromPath).async('uint8array'));
    const relFrom = `${m[1]}_rels/${m[2]}${m[3]}.${m[4]}.rels`;
    if (zip.file(relFrom)) zip.file(`${m[1]}_rels/${path.posix.basename(to)}.rels`, await zip.file(relFrom).async('uint8array'));
    const override = types.match(new RegExp(`<Override PartName="/${fromPath.replace(/\./g, '\\.')}" ContentType="([^"]+)"/>`));
    if (override) types = types.replace('</Types>', `<Override PartName="/${to}" ContentType="${override[1]}"/></Types>`);
    return to;
  };

  // ---------- Cover Page ----------
  const coverSheet = new SheetXml(await read(cover.path));
  coverSheet.set('C13', faculty.name);
  const terms = [...new Set(sections.map((s) => s.term).filter(Boolean))];
  const years = [...new Set(sections.map((s) => s.academicYear).filter(Boolean))];
  if (years.length === 1) coverSheet.set('M13', years[0].replace(/\s*-\s*/, ' - '));
  if (terms.length === 1) {
    // Use the Cover Page's own dropdown value (T3:T5) so its term list still matches.
    const options = ['T3', 'T4', 'T5'].map((ref) => {
      const c = coverSheet.rows.get(Number(ref.slice(1)))?.cells.get('T') || '';
      const i = c.match(/t="s"[^>]*><v>(\d+)<\/v>/)?.[1];
      return i !== undefined ? strings[Number(i)] : null;
    });
    coverSheet.set('R13', options.find((o) => o && o.trim().toLowerCase() === terms[0].trim().toLowerCase()) || terms[0]);
  }
  if (sections.length > COVER_ROWS) notes.push(`The Cover Page lists ${COVER_ROWS} sections; sheets after the ${COVER_ROWS}th won't show their subject details in the header.`);
  sections.slice(0, COVER_ROWS).forEach((s, i) => {
    const r = 19 + i;
    coverSheet.set(`E${r}`, s.code);
    coverSheet.set(`G${r}`, s.subjectCode || null);
    coverSheet.set(`I${r}`, s.subjectTitle || null);
    // Same one-line style as a hand-filled Cover Page ("MON|THU", "11:00 AM - 1:00 PM"); a time or
    // room shared by every meeting is written once.
    const rows = s.schedule || [];
    const uniq = (list) => [...new Set(list.filter(Boolean))].join('|');
    coverSheet.set(`N${r}`, (rows.length ? rows.map((x) => x.day).join('|') : s.day) || null);
    coverSheet.set(`P${r}`, (rows.length ? uniq(rows.map((x) => `${to12(x.start)} - ${to12(x.end)}`)) : s.time) || null);
    coverSheet.set(`R${r}`, (rows.length ? uniq(rows.map((x) => x.room)) : s.room) || null);
    coverSheet.set(`T${r}`, s.units ?? null);
  });
  zip.file(cover.path, coverSheet.toString());

  // ---------- Sections ----------
  const refSheet = new SheetXml(await read(refs.path));
  let refRow = 1;
  const newSheetEls = [];
  const newNames = [];
  const templateNames = [...workbook.matchAll(/<definedName\b[^>]*localSheetId="(\d+)"[^>]*>[^<]*<\/definedName>/g)].filter((m) => Number(m[1]) === templateIndex).map((m) => m[0]);

  for (const [k, sec] of sections.entries()) {
    const enrollments = (await Enrollment.find({ section: sec._id }).populate('student')).filter((e) => e.student);
    enrollments.sort((a, b) => a.student.name.localeCompare(b.student.name));
    const { columns, notes: n } = columnsFor(sec, enrollments);
    notes.push(...n);

    // The sheet's formulas point at TEMPLATE!<name>; each copy uses its own sheet-scoped names instead.
    const sheetName = sec.code.replace(/[[\]:*?/\\']/g, '-').slice(0, 31);
    const quoted = `'${sheetName}'!`;
    const ws = new SheetXml(
      templateXml
        .replace(/TEMPLATE!/g, quoted)
        .replace(/\stabSelected="1"/g, '')
        .replace(/(<sheetPr\b[^>]*?)\scodeName="[^"]*"/, '$1') // code names must be unique per sheet
        // A component with no items yet (e.g. no EA) would divide by zero; count it as 0, like the app does.
        .replace(/\(SUM\((\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+)\)\/SUM\(([^()]+)\)\)/g, 'IFERROR(SUM($1)/SUM($2),0)')
    );

    ws.set('U6', sec.code);
    const w = sec.weights || {};
    [['AG', 'CP'], ['AH', 'EA'], ['AI', 'MPT']].forEach(([c, key]) => ws.set(`${c}4`, w.midterm?.[key] ?? 0));
    ws.set('AJ4', null);
    [['AG', 'CP'], ['AH', 'EA'], ['AI', 'MPT'], ['AJ', 'CPT']].forEach(([c, key]) => ws.set(`${c}5`, w.final?.[key] ?? 0));

    // Item names and max scores: clear every slot, then fill the used ones.
    for (const c of Object.values(SLOTS).flat()) {
      ws.set(`${c}11`, null);
      ws.set(`${c}12`, null);
    }
    // MPT / CPT keep the template's labels and default max when the section has no such item yet,
    // so the grade formulas count them as 0 (like the app) instead of dividing by zero.
    ws.set('AL11', 'MPT');
    ws.set('AM11', 'CPT');
    ws.set('AL12', 50);
    ws.set('AM12', 100);
    for (const c of columns) {
      ws.set(`${c.col}11`, c.label);
      ws.set(`${c.col}12`, c.max);
    }

    // Students: same order as the References rows, so the FILTER in F/G/H lines up with the scores.
    const rowsNeeded = Math.max(TEMPLATE_ROWS, enrollments.length);
    for (let i = TEMPLATE_ROWS; i < enrollments.length; i++) ws.cloneRow(FIRST_ROW + TEMPLATE_ROWS - 1, FIRST_ROW + i);
    for (let i = 0; i < rowsNeeded; i++) {
      const r = FIRST_ROW + i;
      const e = enrollments[i];
      const attScores = e ? Object.fromEntries(attendanceItems(sec, e).map((a) => [a._id, a.score])) : {};
      ws.set(`D${r}`, e ? e.student.studentNo : null);
      if (i >= TEMPLATE_ROWS) ws.set(`E${r}`, i + 1);
      for (const c of Object.values(SLOTS).flat()) ws.set(`${c}${r}`, null);
      for (const c of columns) ws.set(`${c.col}${r}`, e ? scoreFor(c, e, attScores) : null);
      ws.set(`${BONUS}${r}`, e?.bonus ? e.bonus : null);
    }
    if (enrollments.length > TEMPLATE_ROWS) notes.push(`${sec.code}: ${enrollments.length} students; rows after ${TEMPLATE_ROWS} were added below the template's rows.`);

    for (const e of enrollments) {
      refSheet.set(`A${refRow}`, e.student.studentNo);
      refSheet.set(`B${refRow}`, e.student.name);
      // Empty text (not a blank cell), so the section sheet's FILTER shows nothing instead of 0.
      refSheet.set(`C${refRow}`, e.student.course || '', { text: true });
      refSheet.set(`D${refRow}`, sec.code);
      refRow++;
    }

    // Parts: worksheet, its relationships, and copies of its drawing / comments / printer settings.
    const sheetPath = `xl/worksheets/sheet${sheetN++}.xml`;
    zip.file(sheetPath, ws.toString());
    let rels = templateRels;
    for (const m of [...templateRels.matchAll(/Target="\.\.\/([^"]+)"/g)]) {
      const copied = await copyPart(`xl/${m[1]}`);
      rels = rels.replace(`Target="../${m[1]}"`, `Target="../${copied.replace(/^xl\//, '')}"`);
    }
    if (rels) zip.file(`xl/worksheets/_rels/${path.posix.basename(sheetPath)}.rels`, rels);
    types = types.replace('</Types>', `<Override PartName="/${sheetPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);

    const rid = `rId${ridN++}`;
    wbRels = wbRels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${sheetPath.replace(/^xl\//, '')}"/></Relationships>`);
    newSheetEls.push(`<sheet name="${esc(sheetName)}" sheetId="${sheetId++}" r:id="${rid}"/>`);
    const index = templateIndex + 1 + k;
    for (const def of templateNames)
      newNames.push(def.replace(/localSheetId="\d+"/, `localSheetId="${index}"`).replace(/>TEMPLATE!/, `>${quoted}`).replace(/>'TEMPLATE'!/, `>${quoted}`));
  }
  zip.file(refs.path, refSheet.toString());

  // ---------- Workbook ----------
  // Sheets after TEMPLATE move right by the number of new sheets; their sheet-scoped names follow.
  workbook = workbook.replace(/localSheetId="(\d+)"/g, (m, i) => (Number(i) > templateIndex ? `localSheetId="${Number(i) + sections.length}"` : m));
  workbook = workbook.replace(template.el, template.el + newSheetEls.join(''));
  if (newNames.length) workbook = workbook.replace('</definedNames>', `${newNames.join('')}</definedNames>`);
  // Let Excel recalculate everything when the file opens; drop the stale calculation chain.
  workbook = workbook.replace(/<calcPr\b([^>]*?)\/>/, (m, a) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"/>`);
  zip.file('xl/workbook.xml', workbook);
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    wbRels = wbRels.replace(/<Relationship\b[^>]*Target="calcChain\.xml"\/>/, '');
    types = types.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '');
  }
  zip.file('xl/_rels/workbook.xml.rels', wbRels);
  zip.file('[Content_Types].xml', types);

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { buffer, sections, notes };
}
