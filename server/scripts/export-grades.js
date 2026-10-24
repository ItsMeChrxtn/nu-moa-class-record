// Write a faculty member's grading sheet (Summary + one sheet per section) to a folder.
//
//   npm run export-grades -- <faculty email or username> "<output folder>"
//
// Uses MONGODB_URI (set it to the Atlas connection string to export the online data).
// Never overwrites an existing file: a number is added to the name instead.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { User } from '../src/models.js';
import { buildGradingWorkbook, gradingFileName } from '../src/exportWorkbook.js';

const [who, outDir] = process.argv.slice(2);
if (!who || !outDir) {
  console.error('Usage: npm run export-grades -- <faculty email or username> "<output folder>"');
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
const { wb, sections } = await buildGradingWorkbook(faculty);
const name = gradingFileName(faculty, sections);
let file = path.join(outDir, name);
for (let n = 2; fs.existsSync(file); n++) file = path.join(outDir, name.replace(/\.xlsx$/, ` (${n}).xlsx`));
await wb.xlsx.writeFile(file);
console.log(`Wrote ${file}`);
console.log(`Sheets: Summary, ${sections.map((s) => s.code).join(', ') || '(no sections)'}`);
await mongoose.disconnect();
