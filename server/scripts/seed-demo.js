// Fills a separate demo database with made-up faculty, students and scores, for tutorials and
// screenshots. Never touches the real database: it refuses any database whose name lacks "demo".
//
//   npm run seed-demo                       (mongodb://127.0.0.1:27017/class-record-demo)
//   npm run seed-demo -- --fresh-student    (also a student who has not signed in yet)
//   npm run seed-demo -- --publish-all      (INF242 is hidden from students unless this is given)
//
// All demo accounts use the password Demo#2026 (the not-yet-signed-in student: Temp#2026).

import mongoose from 'mongoose';
import { User, Student, Section, Enrollment, AuditLog, notifyGrades } from '../src/models.js';
import { hashPassword } from '../src/auth.js';

const uri = process.env.DEMO_MONGODB_URI || 'mongodb://127.0.0.1:27017/class-record-demo';
if (!/demo/i.test(new URL(uri).pathname)) {
  console.error(`Refusing to seed ${uri}: the database name must contain "demo".`);
  process.exit(1);
}
const publishAll = process.argv.includes('--publish-all');

// Small deterministic random generator, so every run gives the same scores.
let seed = 20261103;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const STUDENTS = [
  ['2024-100101', 'REYES, ANGELA MAE SANTOS', 'angela.reyes@example.com'],
  ['2024-100102', 'AQUINO, MARCO PAOLO DIAZ', 'marco.aquino@example.com'],
  ['2024-100103', 'BAUTISTA, JOANNA LIZA CRUZ', 'joanna.bautista@example.com'],
  ['2024-100104', 'CASTILLO, RAFAEL JOSE LIM', 'rafael.castillo@example.com'],
  ['2024-100105', 'DOMINGO, PATRICIA ANNE GO', 'patricia.domingo@example.com'],
  ['2024-100106', 'ESPIRITU, CARLO MIGUEL TAN', 'carlo.espiritu@example.com'],
  ['2024-100107', 'FERNANDEZ, BEA KATRINA UY', 'bea.fernandez@example.com'],
  ['2024-100108', 'GARCIA, JOSHUA DANIEL ONG', 'joshua.garcia@example.com'],
  ['2024-100109', 'HERNANDEZ, NICOLE MARIE YAP', 'nicole.hernandez@example.com'],
  ['2024-100110', 'IGNACIO, PAOLO ANDRES SY', 'paolo.ignacio@example.com'],
  ['2024-100111', 'JIMENEZ, CLARISSE JOY CO', 'clarisse.jimenez@example.com'],
  ['2024-100112', 'LOPEZ, GABRIEL LUIS CHUA', 'gabriel.lopez@example.com'],
  ['2024-100113', 'MENDOZA, TRISHA NICOLE ANG', 'trisha.mendoza@example.com'],
  ['2024-100114', 'NAVARRO, KEVIN JAMES DY', 'kevin.navarro@example.com'],
];
const FRESH_STUDENT = '2024-100115'; // used to show the first sign-in

const MID_ITEMS = [
  ['CP', 'MID', 'Q1', 30], ['CP', 'MID', 'Q2', 30], ['CP', 'MID', 'Q3', 25], ['CP', 'MID', 'Q4', 30],
  ['EA', 'MID', 'Act 1', 100], ['EA', 'MID', 'Act 2', 100], ['EA', 'MID', 'Act 3', 100], ['EA', 'MID', 'Act 4', 100],
  ['MPT', 'MID', 'MPT', 80],
];
const POST_ITEMS = [
  ['CP', 'POST', 'Q1', 25], ['CP', 'POST', 'Q2', 20],
  ['EA', 'POST', 'Act 1', 100], ['EA', 'POST', 'Act 2', 100],
  ['CPT', 'POST', 'CPT', 100],
];

const SECTIONS = [
  {
    code: 'INF241', subjectCode: 'CTWEBDEV', subjectTitle: 'WEB SYSTEMS AND TECHNOLOGIES', units: 3,
    schedule: [
      { day: 'MON', start: '07:00', end: '10:00', room: '401', type: 'LEC', mode: 'F2F' },
      { day: 'THU', start: '13:00', end: '16:00', room: 'CL3', type: 'LAB', mode: 'F2F' },
    ],
    items: [...MID_ITEMS, ...POST_ITEMS], students: STUDENTS.slice(0, 12), published: true,
  },
  {
    code: 'INF242', subjectCode: 'CTDBMS', subjectTitle: 'DATABASE MANAGEMENT SYSTEMS', units: 3,
    schedule: [
      { day: 'TUE', start: '10:00', end: '13:00', room: '402', type: 'LEC', mode: 'F2F' },
      { day: 'FRI', start: '09:00', end: '12:00', room: 'CL1', type: 'LAB', mode: 'F2F' },
    ],
    items: MID_ITEMS, students: [STUDENTS[0], ...STUDENTS.slice(4, 14)], published: false,
  },
];

async function main() {
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const passwordHash = await hashPassword('Demo#2026');

  const faculty = await User.create({
    username: 'faculty.demo@example.com', passwordHash, role: 'faculty', name: 'MARIA CLARA SANTOS',
    mustChangePassword: false,
  });
  await User.create({ username: 'admin', passwordHash, role: 'admin', name: 'DEMO ADMIN', mustChangePassword: false });

  const students = new Map();
  for (const [studentNo, name, email] of STUDENTS) {
    const s = await Student.create({ studentNo, name, course: 'BSIT-MWA-MNL', email });
    await User.create({ username: studentNo, passwordHash, role: 'student', name, student: s._id, mustChangePassword: false, lastLoginAt: new Date() });
    students.set(studentNo, s);
  }
  if (process.argv.includes('--fresh-student')) {
    const s = await Student.create({ studentNo: FRESH_STUDENT, name: 'OCAMPO, LIANNE GRACE VILLA', course: 'BSIT-MWA-MNL', email: 'lianne.ocampo@example.com' });
    await User.create({ username: FRESH_STUDENT, passwordHash: await hashPassword('Temp#2026'), role: 'student', name: s.name, student: s._id });
    students.set(FRESH_STUDENT, s);
  }

  for (const def of SECTIONS) {
    const section = await Section.create({
      code: def.code, subjectCode: def.subjectCode, subjectTitle: def.subjectTitle, units: def.units,
      schedule: def.schedule,
      day: def.schedule.map((m) => m.day).join('|'),
      time: def.schedule.map((m) => `${m.start} - ${m.end}`).join('|'),
      room: def.schedule.map((m) => m.room).join('|'),
      term: 'First Term', academicYear: '2026-2027', department: 'INFORMATION TECHNOLOGY',
      faculty: faculty._id,
      items: def.items.map(([component, period, label, max]) => ({ component, period, label, max })),
      published: def.published || publishAll,
    });
    const roster = [...def.students.map(([no]) => no), ...(students.has(FRESH_STUDENT) ? [FRESH_STUDENT] : [])];
    for (const no of roster) {
      const skill = 0.7 + rand() * 0.3;
      const scores = {};
      for (const item of section.items) scores[String(item._id)] = Math.min(item.max, Math.max(0, Math.round(item.max * (skill - 0.08 + rand() * 0.16))));
      await Enrollment.create({ section: section._id, student: students.get(no)._id, scores });
    }
    await notifyGrades(section);
    console.log(`  ✓ ${def.code}: ${roster.length} students, ${section.items.length} items`);
  }
  await AuditLog.deleteMany({});
  console.log(`Demo data ready in ${uri}. Password for every demo account: Demo#2026`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
