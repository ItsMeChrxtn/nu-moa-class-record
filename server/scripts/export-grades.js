// Write a faculty member's grading sheet (NU class record format, one sheet per section) to a folder.
//
//   npm run export-grades -- <faculty email or username> "<output folder>" [--template "<blank CLREC .xlsx>"]
//
// Uses MONGODB_URI (set it to the Atlas connection string to export the online data).
// Never overwrites an existing file: a number is added to the name instead.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { User } from '../src/models.js';
import { TEMPLATE_PATH, buildClassRecord, gradingFileName } from '../src/classRecordExport.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const template = flag('template') || TEMPLATE_PATH;
const [who, outDir] = args;
if (!who || !outDir) {
  console.error('Usage: npm run export-grades -- <faculty email or username> "<output folder>" [--template "<blank CLREC .xlsx>"]');
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
const { buffer, sections, notes } = await buildClassRecord(faculty, template);
const name = gradingFileName(faculty, sections);
let file = path.join(outDir, name);
for (let n = 2; fs.existsSync(file); n++) file = path.join(outDir, name.replace(/\.xlsx$/, ` (${n}).xlsx`));
fs.writeFileSync(file, buffer);
console.log(`Wrote ${file}`);
console.log(`Section sheets: ${sections.map((s) => s.code).join(', ') || '(none)'}`);
for (const n of notes) console.log(`Note: ${n}`);
await mongoose.disconnect();
