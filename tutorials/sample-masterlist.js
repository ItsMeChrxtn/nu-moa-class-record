// Makes a made-up class master list PDF (no real students) for the "New Section" part of the tutorial.

import path from 'node:path';
import { HERE, launch } from './lib.js';

const STUDENTS = [
  ['2024-100201', 'ALCANTARA, MIGUEL ANTONIO REYES'],
  ['2024-100202', 'BELTRAN, SOPHIA NICOLE CRUZ'],
  ['2024-100203', 'CRUZ, NATHAN GABRIEL LIM'],
  ['2024-100204', 'DELA PENA, ANDREA JOY SANTOS'],
  ['2024-100205', 'ESTRADA, LUIS RAFAEL GO'],
  ['2024-100206', 'FLORES, KATHLEEN MAE TAN'],
  ['2024-100207', 'GONZALES, ADRIAN PAUL YU'],
  ['2024-100208', 'HIZON, MARIELLE ANNE DY'],
  ['2024-100209', 'ILAGAN, JOHN CARLO SY'],
  ['2024-100210', 'LACSON, BIANCA ROSE ONG'],
];

export const MASTERLIST = path.join(HERE, '.cache', 'INF243-masterlist.pdf');

export async function makeMasterList() {
  const rows = STUDENTS.map(
    ([no, name], i) =>
      `<tr><td>${i + 1}</td><td>${no}</td><td>${name}</td><td>BSIT-MWA-MNL</td><td>${name.split(',')[0].toLowerCase().replace(/\s+/g, '')}@example.com</td><td>Enrolled</td></tr>`
  );
  const html = `<!doctype html><html><head><style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:36px}
    h1{font-size:15px;margin:0 0 4px} h2{font-size:12px;margin:0 0 14px;font-weight:normal}
    .info p{margin:2px 0} table{border-collapse:collapse;width:100%;margin-top:14px}
    td,th{border:1px solid #999;padding:5px 6px;text-align:left}
  </style></head><body>
    <h1>NATIONAL UNIVERSITY - MOA</h1><h2>CLASS MASTER LIST (SAMPLE ONLY)</h2>
    <div class="info">
      <p>Section: INF243</p>
      <p>Subject Code: CTSYSINT</p>
      <p>Subject Title: SYSTEMS INTEGRATION AND ARCHITECTURE</p>
      <p>Day: WED</p>
      <p>Time: 1:00 PM - 4:00 PM</p>
      <p>Room: 403</p>
      <p>Units: 3</p>
      <p>Term: First Term</p>
      <p>Academic Year: 2026-2027</p>
    </div>
    <table><tr><th>#</th><th>Student No.</th><th>Name</th><th>Course</th><th>Email</th><th>Status</th></tr>${rows.join('')}</table>
  </body></html>`;
  const browser = await launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: MASTERLIST, format: 'A4' });
  await browser.close();
  return MASTERLIST;
}
