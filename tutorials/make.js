// Builds the tutorial videos into tutorials/output/.
//
//   npm run build                        all videos
//   npm run build -- student admin       only some (faculty-1 … faculty-4, student, admin)
//   VOICE=en-PH-RosaNeural npm run build      another edge-tts voice
//
// Needs MongoDB running locally. Uses its own database (class-record-demo) with made-up data;
// the real database is never touched and no real email is sent.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, record, seed, startDemoServer } from './lib.js';
import { makeMasterList } from './sample-masterlist.js';
import { facultyStart, facultySchedule, facultySections, facultyGrades } from './faculty.js';
import { studentSteps } from './student.js';
import { adminSteps } from './admin.js';

const only = process.argv.slice(2);
const videos = [
  { key: 'faculty-1', name: 'faculty-1-getting-started', steps: facultyStart },
  { key: 'faculty-2', name: 'faculty-2-weekly-schedule', steps: facultySchedule, signIn: ['faculty.demo@example.com', 'Demo#2026'] },
  { key: 'faculty-3', name: 'faculty-3-sections-and-students', steps: facultySections, signIn: ['faculty.demo@example.com', 'Demo#2026'] },
  { key: 'faculty-4', name: 'faculty-4-grades', steps: facultyGrades, signIn: ['faculty.demo@example.com', 'Demo#2026'] },
  { key: 'student', name: 'student-guide', steps: studentSteps, seedFlags: ['--publish-all'] },
  { key: 'admin', name: 'admin-guide', steps: adminSteps },
].filter((v) => !only.length || only.includes(v.key));

console.log('Building the web app…');
execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'ignore', shell: true });
await makeMasterList();

const server = startDemoServer();
await server.ready;
try {
  for (const v of videos) {
    await seed('--fresh-student', ...(v.seedFlags || []));
    await record(v.name, v.steps, { setup: v.signIn && ((h) => h.signInQuietly(...v.signIn)) });
  }
} finally {
  server.stop();
}
console.log(`\nDone. Videos are in ${path.join('tutorials', 'output')}`);
process.exit(0);
