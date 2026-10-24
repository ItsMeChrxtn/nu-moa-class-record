// Write a faculty member's grading sheets (NU class record format) to a folder: one file per
// academic year + term, each with one sheet per section of that term.
//
//   npm run export-grades -- <faculty email or username> "<output folder>"
//        [--ay 2026-2027] [--term "Second Term"] [--template "<blank CLREC .xlsx>"]
//
// Uses MONGODB_URI (set it to the Atlas connection string to export the online data).
// Never overwrites an existing file: a number is added to the name instead.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { User } from '../src/models.js';
import { TEMPLATE_PATH, buildClassRecord, facultyTerms, gradingFileName } from '../src/classRecordExport.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const template = flag('template') || TEMPLATE_PATH;
const onlyAy = flag('ay');
const onlyTerm = flag('term');
const [who, outDir] = args;
if (!who || !outDir) {
  console.error('Usage: npm run export-grades -- <faculty email or username> "<output folder>" [--ay 2026-2027] [--term "Second Term"] [--template "<blank CLREC .xlsx>"]');
  process.exit(1);
}
if (!fs.existsSync(outDir)) {
  console.error(`Folder not found: ${outDir}`);
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/class-record');
const faculty = await User.findOne({ username: who.toLowerCase(), role: 'faculty' });
if (!faculty) {
  console.error(`No faculty account "${who}".`);
  process.exit(1);
}
const terms = (await facultyTerms(faculty)).filter(
  (t) => (!onlyAy || t.academicYear === onlyAy) && (!onlyTerm || t.term.trim().toLowerCase() === onlyTerm.trim().toLowerCase())
);
if (!terms.length) console.log('No sections for that academic year / term.');
for (const t of terms) {
  const { buffer, sections, notes } = await buildClassRecord(faculty, template, t);
  const name = gradingFileName(faculty, sections);
  let file = path.join(outDir, name);
  for (let n = 2; fs.existsSync(file); n++) file = path.join(outDir, name.replace(/\.xlsx$/, ` (${n}).xlsx`));
  fs.writeFileSync(file, buffer);
  console.log(`Academic Year ${t.academicYear || '(none)'} ${t.term || '(no term)'}: ${file}`);
  console.log(`  Section sheets: ${sections.map((s) => s.code).join(', ')}`);
  for (const n of notes) console.log(`  Note: ${n}`);
}
await mongoose.disconnect();
