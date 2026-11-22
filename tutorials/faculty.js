// Faculty tutorials, in four parts: getting started, weekly schedule, sections and students, grades.

import { BASE, card } from './lib.js';
import { MASTERLIST } from './sample-masterlist.js';
import { unzip } from './preview.js';

const FACULTY = ['faculty.demo@example.com', 'Demo#2026'];
const cell = (h, row, col) => h.page.locator('table.record tbody tr').nth(row).locator('input.cell').nth(col);
const modal = (h) => h.page.locator('.modal').last();
const pick = async (h, label, value) => {
  const s = h.page.getByLabel(label, { exact: true });
  await h.point(s, 350);
  await s.selectOption(value);
  await h.sleep(250);
};

const intro = (part, title, lines) => ({
  say: `Welcome to the NU MOA Class Record faculty guide, part ${part}: ${title.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}.`,
  act: async (h) => h.showCard(card({ kicker: `Video tutorial · Faculty · Part ${part} of 4`, title, lines, foot: 'All names and grades in this video are sample data.' })),
  after: 900,
});
const outro = (say, title, lines, foot) => ({
  say,
  act: async (h) => h.showCard(card({ kicker: 'Quick recap', title, lines, foot })),
  after: 1800,
});
const openSection = (code) => async (h) => {
  if (!h.page.url().endsWith('/faculty')) {
    await h.page.goto(`${BASE}/faculty`, { waitUntil: 'networkidle' });
    await h.replaceCursor();
  }
  await h.click(h.page.locator('.section-card', { hasText: code }));
  await h.page.waitForURL('**/sections/**');
  await h.sleep(500);
};

// ---------------------------------------------------------------- Part 1

export const facultyStart = [
  intro(1, 'Getting<br><em>started</em>', ['Sign in', 'Your dashboard', 'Export a whole term', 'My profile', 'Forgot your password']),
  {
    say: 'Open the Class Record website and sign in with your email address and password. The first time, use the temporary password from your welcome email. You will be asked to choose your own password right away.',
    act: async (h) => {
      await h.page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await h.replaceCursor();
      await h.sleep(1200);
      await h.type(h.page.getByLabel('Email', { exact: true }), FACULTY[0], { delay: 45 });
      await h.type(h.page.getByLabel('Password', { exact: true }), FACULTY[1], { delay: 70 });
    },
  },
  {
    say: 'Then click the blue button below to sign in.',
    act: async (h) => {
      await h.click('form button.btn.primary');
      await h.page.waitForURL('**/faculty');
      await h.replaceCursor();
      await h.ok();
    },
  },
  {
    say: 'This is your dashboard. The tiles at the top show your sections, your students, the class average, and how many sections are already visible to students.',
    act: async (h) => {
      await h.sleep(500);
      const stats = h.page.locator('.stat');
      for (let i = 0; i < 4; i++) await h.hover(stats.nth(i), 700);
    },
  },
  {
    say: "The Today panel lists today's classes from your section schedules, and marks the class happening now, the next one, and the ones that are done. The strip below counts your classes for each day of the week.",
    act: async (h) => {
      await h.hover('.today .today-list', 2200);
      await h.hover('.today .week-strip', 1800);
    },
  },
  {
    say: 'Each section card shows the schedule, the class average for midterms and finals, the number of students, and whether its grades are published or hidden. The Excel button downloads that section\'s grading sheet, and the trash icon deletes the section.',
    act: async (h) => {
      const c = h.page.locator('.section-card', { hasText: 'INF241' });
      await h.hover(c.locator('.sched'), 1100);
      await h.hover(c.locator('.term-progress'), 1500);
      await h.hover(c.locator('.chip').first(), 900);
      await h.hover(c.locator('.card-export'), 1100);
      await h.hover(c.locator('.card-delete'), 900);
    },
  },
  {
    say: 'Sections are grouped by academic year and term. Export grading sheet downloads the class record in Excel for the whole term, with one sheet for each section, in the official class record format.',
    act: async (h) => {
      await h.sleep(800);
      await h.download(h.page.getByRole('button', { name: /Export grading sheet/ }).first());
    },
  },
  {
    say: 'Here is the downloaded file, opened in Excel. The cover page has your name, the term, the academic year, and every section in the file.',
    act: async (h) => {
      await h.openFile([{ file: h.lastDownload, kind: 'xlsx', sheets: (n) => n === 'Cover Page' || n === 'INF241' }]);
      await h.sleep(1500);
      await h.zoom(0.5, 0.42, 1.6, 2600);
      await h.zoom(0.5, 0.72, 1.6, 2400);
      await h.zoom(0.5, 0.5, 1, 800);
    },
  },
  {
    say: 'Each section has its own sheet in the official class record format: the class list, every quiz and activity with its maximum score, the percentage allocation, and the midterm and final grades with their grade points, already computed.',
    act: async (h) => {
      await h.view(1, 1600);
      await h.zoom(0.62, 0.06, 2.4, 2600);
      await h.zoom(0.32, 0.2, 2.2, 2600);
      await h.zoom(0.85, 0.2, 2.6, 2800);
      await h.zoom(0.5, 0.5, 1, 1000);
    },
  },
  {
    say: 'Click your name at the top to open My profile. Here you can update your name, the email you sign in with, your employee ID, and your contact number. Password reset links are sent to this email.',
    act: async (h) => {
      await h.backTo('/faculty');
      await h.click(h.page.locator('header a.user-pill'));
      await h.page.waitForURL('**/faculty/profile');
      await h.sleep(600);
      await h.hover(h.page.getByLabel('Full name'), 1000);
      await h.hover(h.page.getByLabel('Email (used to sign in)'), 1500);
      await h.hover(h.page.getByLabel('Employee ID'), 900);
    },
  },
  {
    say: 'Changing your sign-in email needs your current password. Type a change, then click Save changes.',
    act: async (h) => {
      await h.type(h.page.getByLabel('Contact number'), '0917 555 0142', { delay: 70 });
      await h.click(h.page.getByRole('button', { name: 'Save changes' }));
      await h.ok();
    },
  },
  {
    say: 'When you are finished, click Log out, and confirm.',
    act: async (h) => h.logout(),
  },
  {
    say: 'If you forget your password, click Forgot your password on the sign-in page, and type your email. A reset link is sent to you, and it works for one hour.',
    act: async (h) => {
      await h.click(h.page.getByRole('link', { name: 'Forgot your password?' }));
      await h.page.waitForURL('**/forgot-password');
      await h.replaceCursor();
      await h.type(h.page.getByLabel('Email', { exact: true }), FACULTY[0], { delay: 45 });
      await h.click(h.page.getByRole('button', { name: 'Email me a reset link' }));
      await h.hover('.alert.ok', 1500);
    },
  },
  outro(
    'That is part one. Next, part two covers your weekly schedule. Thank you for watching.',
    'Getting<br><em>started</em>',
    ['Sign in with your email', 'Dashboard: today, sections, averages', 'Export grading sheet for the term', 'My profile: name, email, contact', 'Forgot your password? Use the link'],
    'Next: Part 2 · Weekly schedule',
  ),
];

// ---------------------------------------------------------------- Part 2

export const facultySchedule = [
  intro(2, 'Weekly<br><em>schedule</em>', ['Your timetable', 'Work hours', 'Consultation and admin hours', 'Break time', 'Loading report and work week files']),
  {
    say: 'Click Weekly schedule in the menu on the left. Your classes are placed on a Monday to Saturday timetable from each section\'s schedule, one color per section, with today highlighted.',
    act: async (h) => {
      await h.page.goto(`${BASE}/faculty`, { waitUntil: 'networkidle' });
      await h.replaceCursor();
      await h.sleep(600);
      await h.click(h.page.locator('.side-link', { hasText: 'Weekly schedule' }));
      await h.sleep(500);
      await h.hover(h.page.locator('.tt-grid, .timetable').first(), 1500);
    },
  },
  {
    say: 'At the top is your total working hours for the week, counted against forty hours: classes plus admin and consultation hours. Break time is shown but not counted.',
    act: async (h) => h.hover(h.page.getByText('Total working hours'), 2500),
  },
  {
    say: 'Your work hours are your time in and time out. Click Change to set them. Admin, consultation, and break blocks can only be placed inside these hours.',
    act: async (h) => {
      await h.click(h.page.getByRole('button', { name: 'Change' }));
      await h.sleep(600);
      await pick(h, 'Time out hour', '5');
      await h.sleep(500);
      await h.click(modal(h).locator('.btn.primary'));
      await h.ok();
    },
  },
  {
    say: 'To add consultation hours, click Admin / consultation. Type a label, pick the days, or use a shortcut like M W F, and set the start and end time.',
    act: async (h) => {
      await h.click(h.page.getByRole('button', { name: /Admin \/ consultation/ }));
      await h.sleep(600);
      await h.type(modal(h).locator('.field input').first(), 'Consultation');
      await h.click(modal(h).getByRole('button', { name: 'MWF', exact: true }));
      await pick(h, 'Start time AM or PM', 'PM');
      await pick(h, 'Start time hour', '1');
      await pick(h, 'End time AM or PM', 'PM');
      await pick(h, 'End time hour', '3');
    },
  },
  {
    say: 'Save it, and the block appears on all three days at once.',
    act: async (h) => {
      await h.click(modal(h).locator('.btn.primary'));
      await h.ok();
      await h.hover(h.page.locator('.tt-block.tt-other').first(), 1200);
    },
  },
  {
    say: 'Break time works the same way. It is shown on your schedule, but not counted as working hours.',
    act: async (h) => {
      await h.click(h.page.getByRole('button', { name: /Break time/ }));
      await h.sleep(600);
      await h.type(modal(h).locator('.field input').first(), 'Lunch');
      await h.click(modal(h).getByRole('button', { name: 'MWF', exact: true }));
      await pick(h, 'Start time AM or PM', 'PM');
      await pick(h, 'Start time hour', '12');
      await pick(h, 'End time AM or PM', 'PM');
      await pick(h, 'End time hour', '1');
      await h.click(modal(h).locator('.btn.primary'));
      await h.ok();
    },
  },
  {
    say: 'Click a block to edit it, copy it to more days, or remove it. Clicking a class opens that section.',
    act: async (h) => {
      await h.click(h.page.locator('.tt-block.tt-other').first());
      await h.sleep(1800);
      await h.click(modal(h).getByRole('button', { name: 'Cancel' }));
      await h.hover(h.page.locator('.tt-class, .tt-block:not(.tt-other):not(.tt-break)').first(), 1200);
    },
  },
  {
    say: 'Schedule files makes your Faculty Loading Report and Work Week Schedule in the school\'s Excel templates. Enter your employee ID, classification, and signatories once. They are saved for next time.',
    act: async (h) => {
      await h.click(h.page.getByRole('button', { name: /Schedule files/ }));
      await h.sleep(700);
      await h.type(modal(h).getByPlaceholder('e.g. 00-00000'), '19-01234', { delay: 70 });
      const cls = modal(h).locator('select').first();
      await h.point(cls);
      await cls.selectOption({ index: 1 });
      await h.sleep(400);
      await h.type(modal(h).getByPlaceholder('Name').first(), 'Marilou M. Jamis', { delay: 45 });
    },
  },
  {
    say: 'Download both files together as a ZIP, or each one by itself. LEC or LAB, room, and mode come from each section\'s schedule details.',
    act: async (h) => {
      await h.download(modal(h).locator('.modal-foot .btn.primary, .btn.primary').last());
    },
  },
  {
    say: 'The ZIP has two Excel files. This is the Faculty Loading Report: each class meeting with its schedule, lecture or lab, room, mode, units, and teaching hours, then your consultation and administration hours, the total load, and the signatories.',
    act: async (h) => {
      const files = (await h.offline(() => unzip(h.lastDownload))).sort((a, b) => /workweek/i.test(a) - /workweek/i.test(b)); // loading report first
      await h.openFile(files.map((file) => ({ file, kind: 'xlsx' })));
      await h.sleep(1500);
      await h.zoom(0.5, 0.28, 1.7, 3500);
      await h.zoom(0.42, 0.6, 1.7, 3000);
      await h.zoom(0.5, 0.88, 1.7, 2200);
      await h.zoom(0.5, 0.5, 1, 800);
    },
  },
  {
    say: 'The Work Week Schedule shows your week in twenty-minute rows: face-to-face classes in green, admin and consultation hours in yellow, break time, and your days off, with the totals at the bottom.',
    act: async (h) => {
      await h.view(1, 1500);
      await h.zoom(0.45, 0.28, 2.0, 2600);
      await h.zoom(0.55, 0.55, 2.0, 2400);
      await h.zoom(0.5, 0.82, 2.2, 2600);
      await h.zoom(0.5, 0.5, 1, 800);
    },
  },
  outro(
    'That is part two. Part three covers sections and students. Thank you for watching.',
    'Weekly<br><em>schedule</em>',
    ['Classes come from section schedules', 'Change your work hours', 'Add consultation and break blocks', 'Click a block to edit or remove', 'Schedule files → loading report + work week'],
    'Next: Part 3 · Sections and students',
  ),
];

// ---------------------------------------------------------------- Part 3

export const facultySections = [
  intro(3, 'Sections and<br><em>students</em>', ['New section from the master list', 'Send student accounts', 'Section details and schedule', 'Add, remove and reset students', 'Delete a section']),
  {
    say: 'To create a section, click New Section on your dashboard.',
    act: async (h) => {
      await h.page.goto(`${BASE}/faculty`, { waitUntil: 'networkidle' });
      await h.replaceCursor();
      await h.sleep(600);
      await h.click(h.page.getByRole('button', { name: 'New Section' }).first());
    },
  },
  {
    say: 'Drop the class master list PDF from the portal into this box, or click it to choose the file. The PDF is read right in your browser. It is not uploaded anywhere.',
    act: async (h) => {
      await h.sleep(1500);
      const [chooser] = await Promise.all([h.page.waitForEvent('filechooser'), h.click('.dropzone')]);
      await h.sleep(800);
      await chooser.setFiles(MASTERLIST);
    },
  },
  {
    say: 'The section code, subject, schedule, units, term, and the class list are filled in automatically. Only enrolled students are imported. Students marked Registered are left out, and listed so you can see who was skipped.',
    act: async (h) => {
      await h.hover(modal(h).locator('.alert.info').first(), 1500);
      await h.hover(modal(h).locator('.split-col').first(), 2500);
    },
  },
  {
    say: 'Check the highlighted fields. You can remove a student from the list, or add one by hand at the bottom.',
    act: async (h) => {
      await h.hover(h.page.getByLabel('Subject title'), 1200);
      await h.hover(modal(h).getByPlaceholder('Student No.'), 1300);
    },
  },
  {
    say: 'The schedule has one row per meeting: the day, start and end time, room, lecture or laboratory, and the mode. These go into your schedule files.',
    act: async (h) => {
      await h.hover(h.page.getByLabel('Lecture or laboratory for row 1'), 1000);
      await h.page.getByLabel('Lecture or laboratory for row 1').selectOption({ index: 1 });
      await h.hover(h.page.getByLabel('Mode for row 1'), 1200);
    },
  },
  {
    say: 'Under Grading, choose Midterm and final, or Final only for subjects without a midterm. To save time, copy the items and percentages from another section. Then click Create section.',
    act: async (h) => {
      await h.hover(modal(h).getByText('Final only').first(), 1500);
      const select = h.page.getByLabel(/Copy items and percentages/);
      await h.point(select);
      await select.selectOption({ index: 1 });
      await h.sleep(800);
      await h.click(h.page.getByRole('button', { name: 'Create section' }));
    },
    after: 700,
  },
  {
    say: 'The students are now enrolled. Next, send them their accounts. Click Send student accounts.',
    act: async (h) => {
      await h.sleep(1200);
      await h.click(h.page.getByRole('button', { name: 'Send student accounts' }));
    },
  },
  {
    say: 'Each student gets an email with a temporary password, and logs in with that email. Students who have already signed in are never changed. You can also resend to students already emailed, or create accounts for students without an email, and hand out their passwords yourself; they log in with their student number.',
    act: async (h) => {
      await h.sleep(800);
      await h.hover(modal(h).getByText('Resend to students already emailed'), 1700);
      await h.hover(modal(h).getByText('Also create accounts for students without email'), 1700);
    },
  },
  {
    say: 'A student has one account for all their classes. If another faculty already created this student’s account, they are marked From another class. They keep the same sign-in, and their password is not changed. Your section appears on their account once you show its grades.',
    act: async (h) => {
      await h.hover(modal(h).locator('.alert.info', { hasText: 'another class' }), 3200);
      await h.hover(modal(h).locator('.acct-chip', { hasText: 'From another class' }), 2600);
    },
  },
  {
    say: 'Click Create and send. The summary shows who was emailed, and who was skipped because they already have an account.',
    act: async (h) => {
      await h.click(h.page.getByRole('button', { name: /Create & send/ }));
      await h.page.getByRole('button', { name: 'Done' }).waitFor();
      await h.sleep(500);
      await h.hover(modal(h).locator('.alert.info', { hasText: 'Skipped' }), 2800);
      await h.click(h.page.getByRole('button', { name: 'Done' }));
    },
  },
  {
    say: 'On the section page, the dot beside each student shows their account status: no account, emailed, or signed in.',
    act: async (h) => {
      await h.click(h.page.getByRole('tab', { name: /Midterms/ }));
      await h.sleep(400);
      await h.hover(h.page.locator('table.record tbody tr').first().locator('.acct-dot'), 1800);
    },
  },
  {
    say: 'Manage, then Section details, lets you change the code, subject, term, grading, and schedule at any time.',
    act: async (h) => {
      await h.click(h.page.getByRole('button', { name: 'Manage' }));
      await h.sleep(500);
      await h.click(h.page.getByText('Code, subject, schedule, term'));
      await h.sleep(1600);
      await h.click(modal(h).getByRole('button', { name: 'Cancel' }));
    },
  },
  {
    say: 'To add students later, choose Manage, then Students. Import another PDF, or type a student in.',
    act: async (h) => {
      await h.click(h.page.getByRole('button', { name: 'Manage' }));
      await h.sleep(500);
      await h.click(h.page.getByText('Import or add to the class list'));
      await h.sleep(600);
      await h.type(modal(h).getByPlaceholder('Student No.'), '2024-100212', { delay: 60 });
      await h.type(modal(h).getByPlaceholder('LAST, FIRST NAME'), 'NOLASCO, ERIKA FAYE LIM', { delay: 40 });
      await h.type(modal(h).getByPlaceholder('Course'), 'BSIT-MWA-MNL', { delay: 40 });
      await h.click(modal(h).getByTitle('Add student'));
    },
  },
  {
    say: 'Click Enroll. Students already in the section are skipped, and their scores are kept.',
    act: async (h) => {
      await h.click(modal(h).getByRole('button', { name: /Enroll/ }));
      await h.sleep(1500);
      await h.click(h.page.getByRole('button', { name: 'Later' }));
    },
  },
  {
    say: 'If a student forgets their password, click the key icon on their row. A new temporary password is emailed to them, or shown to you once if they have no email.',
    act: async (h) => {
      const row = h.page.locator('table.record tbody tr').first();
      await h.click(row.getByTitle('Reset password'));
      await h.confirm();
      await h.sleep(1500);
      const done = h.page.getByRole('button', { name: 'Done' });
      if (await done.isVisible().catch(() => false)) await h.click(done);
      await h.ok(1500);
    },
  },
  {
    say: 'To remove a student who dropped, click the remove icon on their row and confirm. Their account is kept.',
    act: async (h) => {
      const row = h.page.locator('table.record tbody tr').last();
      await h.click(row.getByTitle('Remove from section'));
      await h.confirm();
      await h.ok();
    },
  },
  {
    say: 'To delete a whole section, choose Manage, then Delete section, and type the section code to confirm. This removes its items and scores. Student accounts are kept.',
    act: async (h) => {
      await h.click(h.page.getByRole('button', { name: 'Manage' }));
      await h.sleep(500);
      await h.click(h.page.getByText('Delete section', { exact: true }));
      await h.confirm('INF243');
      await h.page.waitForURL('**/faculty');
      await h.ok();
    },
  },
  outro(
    'That is part three. Part four covers grades: items, scores, attendance, percentages, and publishing. Thank you for watching.',
    'Sections and<br><em>students</em>',
    ['New Section → drop the master list PDF', 'Send accounts; one account per student', 'Manage → Section details / Students', 'Key icon = reset a student password', 'Manage → Delete section'],
    'Next: Part 4 · Grades',
  ),
];

// ---------------------------------------------------------------- Part 4

export const facultyGrades = [
  intro(4, 'Encoding<br><em>grades</em>', ['Items and scores', 'Finals and bonus', 'Attendance', 'Percentages and grade scale', 'Publish and export']),
  {
    say: 'Open a section and choose the Midterms tab. This is your class record. Above it are the class average, how many are passing, and the grade distribution.',
    act: async (h) => {
      await openSection('INF242')(h);
      await h.click(h.page.getByRole('tab', { name: /Midterms/ }));
      await h.sleep(400);
      await h.hover(h.page.locator('.record-stats .stat').nth(1), 1100);
      await h.hover(h.page.locator('.record-stats .stat.dist'), 1500);
    },
  },
  {
    say: 'To add a quiz, activity, or performance task, click Midterm item. Choose the component, type a label, and enter the maximum score.',
    act: async (h) => {
      await h.click(h.page.getByRole('button', { name: /Midterm item/ }).first());
      await h.sleep(700);
      await h.click(modal(h).locator('label', { hasText: 'Class Participation' }));
      await h.type(modal(h).getByLabel('Label'), 'Q5');
      await h.type(modal(h).getByLabel('Max score'), '20');
    },
  },
  {
    say: 'Click Add item, and the new column appears, ready for scores.',
    act: async (h) => {
      await h.click(h.page.getByRole('button', { name: 'Add item' }));
      await h.ok();
      await h.hover(h.page.locator('table.record thead th', { hasText: 'Q5' }).first(), 1000);
    },
  },
  {
    say: 'To encode, click a cell, type the score, and press Enter to move down. The arrow keys move up and down too. Each score is saved right away.',
    act: async (h) => {
      await h.click(cell(h, 0, 4));
      for (const score of ['18', '15', '20', '17', '19']) {
        await h.page.keyboard.press('Control+A');
        await h.page.keyboard.type(score, { delay: 120 });
        await h.sleep(250);
        await h.page.keyboard.press('Enter');
        await h.sleep(450);
      }
      await h.page.keyboard.press('Escape');
    },
  },
  {
    say: 'The midterm grade and grade point update instantly, using the same formula as the Excel class record. A score above the maximum is refused.',
    act: async (h) => h.hover(h.page.locator('table.record tbody tr').first().locator('td').last(), 2200),
  },
  {
    say: 'To delete an item, point at its column and click the small x. Its scores are deleted too, so you are asked first.',
    act: async (h) => {
      const head = h.page.locator('table.record thead th', { hasText: 'Q5' }).first();
      await h.hover(head, 600);
      await h.click(h.page.getByTitle('Delete Q5'));
      await h.sleep(1200);
      await h.click(h.page.getByRole('button', { name: 'Cancel' }).last());
    },
  },
  {
    say: 'The Finals tab opens once the midterm performance task has scores. Add finals items the same way, including the culminating performance task.',
    act: async (h) => {
      await h.click(h.page.getByRole('tab', { name: /Finals/ }));
      await h.sleep(500);
      await h.click(h.page.getByRole('button', { name: /Finals item/ }).first());
      await h.sleep(600);
      await h.click(modal(h).locator('label', { hasText: 'Culminating' }));
      await h.type(modal(h).getByLabel('Label'), 'CPT');
      await h.type(modal(h).getByLabel('Max score'), '100');
      await h.click(h.page.getByRole('button', { name: 'Add item' }));
      await h.ok();
    },
  },
  {
    say: 'The Finals tab also has the Bonus column, added straight to the final grade, and shows the midterm grade for reference.',
    act: async (h) => {
      const row = h.page.locator('table.record tbody tr').first();
      const bonus = row.locator('input.cell').last();
      await h.click(bonus);
      await h.page.keyboard.type('2', { delay: 150 });
      await h.page.keyboard.press('Enter');
      await h.sleep(500);
      await h.page.keyboard.press('Escape');
      await h.hover(row.locator('td').last(), 1200);
    },
  },
  {
    say: 'For attendance, open the Attendance tab. Choose whether it counts toward Class Participation, Enabling Activities, or is not graded, and how many points a late counts.',
    act: async (h) => {
      await h.click(h.page.getByRole('tab', { name: /Attendance/ }));
      await h.sleep(600);
      await h.hover(h.page.locator('.att-set .segmented'), 1500);
      await h.hover(h.page.locator('.att-set-row select'), 1200);
    },
  },
  {
    say: "Take today's attendance adds today's class in one click. For another day, click Other date: pick the date, Midterms or Finals, and an optional label. Everyone starts as present.",
    act: async (h) => {
      await h.click(h.page.getByRole('button', { name: /Other date/ }));
      await h.sleep(300);
      await h.type(h.page.getByLabel('Label'), 'Lab', { delay: 80 });
      await h.click(h.page.getByRole('button', { name: 'Add session', exact: true }));
      await h.ok();
    },
  },
  {
    say: 'Each student has three buttons: Present, Late, and Absent. Everyone starts as present, so just tap Late or Absent for the ones who are not. The dates on the left open any session, and All dates shows the whole record.',
    act: async (h) => {
      const cards = h.page.locator('.roll-card');
      await h.click(cards.nth(1).locator('.rb-L'));
      await h.sleep(400);
      await h.click(cards.nth(2).locator('.rb-A'));
      await h.sleep(400);
      await h.hover(h.page.locator('.att-sessions'), 1400);
      await h.click(h.page.getByRole('tab', { name: 'All dates' }));
      await h.sleep(1600);
    },
  },
  {
    say: 'Under Manage, Percentage and grade scale sets the weight of each component, and the grade point equivalence table. Each grade must add up to one hundred percent. Reset to NU default brings back the standard table.',
    act: async (h) => {
      await h.page.mouse.wheel(0, -900);
      await h.sleep(400);
      await h.click(h.page.getByRole('button', { name: 'Manage' }));
      await h.sleep(500);
      await h.click(h.page.getByText('Percentage & grade scale'));
      await h.sleep(1200);
      await h.hover(modal(h).getByText('Grade Point Equivalence'), 1500);
      await h.hover(modal(h).getByText(/Reset to NU default/i), 1200);
      await h.click(modal(h).getByRole('button', { name: 'Cancel' }));
    },
  },
  {
    say: 'When grades are ready, switch on Visible to students. Each student gets a notice, and sees only their own scores. Switch it off again to hide them.',
    act: async (h) => {
      await h.click(h.page.locator('label.switch'));
      await h.ok();
    },
  },
  {
    say: 'Export downloads this section\'s grading sheet in the class record Excel format, ready for submission.',
    act: async (h) => h.download(h.page.getByRole('button', { name: /^Export$/ })),
  },
  {
    say: 'Here is the exported sheet. It has the new quiz, the attendance column, the culminating performance task, the bonus, and every grade, computed by the class record’s own formulas.',
    act: async (h) => {
      await h.openFile([{ file: h.lastDownload, kind: 'xlsx', sheets: (n) => n === 'INF242' }]);
      await h.sleep(1300);
      await h.zoom(0.42, 0.18, 2.3, 3000);
      await h.zoom(0.85, 0.2, 2.6, 3000);
      await h.zoom(0.5, 0.5, 1, 900);
    },
  },
  outro(
    'That completes the faculty guide. Add items, encode scores, take attendance, and publish when ready. Thank you for watching.',
    'Encoding<br><em>grades</em>',
    ['+ Midterm / Finals item, then encode', 'Bonus is on the Finals tab', 'Attendance tab: sessions and marks', 'Manage → Percentage & grade scale', 'Visible to students, then Export'],
    'Questions? Contact the Class Record administrator.',
  ),
];
