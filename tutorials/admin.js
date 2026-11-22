// Admin tutorial: faculty accounts, sections across faculty, student passwords, activity log.

import { BASE, card } from './lib.js';

const modal = (h) => h.page.locator('.modal').last();
const tab = (h, name) => h.click(h.page.getByRole('tab', { name: new RegExp(`^\\s*${name}`) }));
const facultyRow = (h, text) => h.page.locator('.admin-card tbody tr', { hasText: text });
const confirm = (h) => h.confirm();
const done = async (h) => {
  const b = h.page.getByRole('button', { name: 'Done' });
  if (await b.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false)) {
    await h.sleep(1200);
    await h.click(b);
  }
  await h.ok(1500);
};

export const adminSteps = [
  {
    say: 'Welcome to the NU MOA Class Record administrator guide. The admin manages faculty accounts, sees every section, and reviews recent activity.',
    act: async (h) => h.showCard(card({
      kicker: 'Video tutorial · Administrator',
      title: 'Class Record<br><em>Admin guide</em>',
      lines: ['Faculty accounts', 'Reset, disable and delete', 'Move a section to another faculty', 'Student passwords', 'Activity log'],
      foot: 'All names and grades in this video are sample data.',
    })),
    after: 900,
  },
  {
    say: 'Sign in with your admin username and password. Admin accounts are created on the server only, never from the website.',
    act: async (h) => {
      await h.page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await h.replaceCursor();
      await h.type(h.page.getByLabel('Email', { exact: true }), 'admin', { delay: 80 });
      await h.type(h.page.getByLabel('Password', { exact: true }), 'Demo#2026', { delay: 70 });
      await h.click('form button.btn.primary');
      await h.page.waitForURL('**/admin');
      await h.replaceCursor();
      await h.ok();
    },
  },
  {
    say: 'The tiles show the number of faculty, sections, students, and student accounts in use.',
    act: async (h) => {
      const stats = h.page.locator('.stat');
      for (let i = 0; i < 4; i++) await h.hover(stats.nth(i), 650);
    },
  },
  {
    say: 'The Faculty tab lists every faculty account, with their email, sections, students, last sign-in, and status. To add a faculty member, click Add faculty.',
    act: async (h) => {
      await h.hover(h.page.locator('.admin-card table'), 1500);
      await h.click(h.page.locator('.admin-card .toolbar-actions .btn.primary'));
      await h.sleep(500);
    },
  },
  {
    say: 'Type their full name and email. Any email works, like Gmail or their NU email. They sign in with it.',
    act: async (h) => {
      await h.type(modal(h).getByPlaceholder('Dela Cruz, Juan P.'), 'Bautista, Carmela S.', { delay: 50 });
      await h.type(modal(h).getByPlaceholder('juan.delacruz@gmail.com'), 'carmela.bautista@example.com', { delay: 40 });
    },
  },
  {
    say: 'Click Create account. A temporary password is emailed to them, and shown here once. They choose their own password at first sign-in.',
    act: async (h) => {
      await h.click(modal(h).getByRole('button', { name: 'Create account' }));
      await done(h);
    },
  },
  {
    say: 'On each row, the pencil edits the name and email, and the key resets the password.',
    act: async (h) => {
      const row = facultyRow(h, 'RAMOS');
      await h.hover(row.getByTitle('Edit'), 1100);
      await h.click(row.getByTitle('Reset password'));
      await confirm(h);
      await done(h);
    },
  },
  {
    say: 'Disable stops an account from signing in, while its sections and published grades stay. Re-enable it any time.',
    act: async (h) => {
      const row = facultyRow(h, 'RAMOS');
      await h.click(row.getByTitle('Disable'));
      await confirm(h);
      await h.ok();
      await h.hover(row.getByText('Disabled'), 1200);
      await h.click(row.getByTitle('Re-enable'));
      await confirm(h);
      await h.ok();
    },
  },
  {
    say: 'The trash icon deletes an account, but only one with no sections. Type their email to confirm.',
    act: async (h) => {
      const row = facultyRow(h, 'BAUTISTA');
      await h.click(row.getByTitle('Delete account'));
      await h.confirm('carmela.bautista@example.com');
      await h.ok();
    },
  },
  {
    say: 'The Sections tab shows every section across all faculty. Filter by term, or search by code, subject, or faculty.',
    act: async (h) => {
      await tab(h, 'Sections');
      await h.sleep(600);
      await h.type(h.page.getByPlaceholder('Search code, subject or faculty…'), 'INF24', { delay: 120 });
      await h.sleep(600);
    },
  },
  {
    say: 'To hand a section to another faculty member, with its students and scores, pick the new faculty in its row.',
    act: async (h) => {
      const sel = h.page.getByLabel('Faculty for INF242');
      await h.point(sel);
      await sel.selectOption({ label: /RAMOS/i }).catch(async () => {
        const opts = await sel.locator('option').allTextContents();
        await sel.selectOption({ label: opts.find((o) => /ramos/i.test(o)) });
      });
      await confirm(h);
      await h.ok();
    },
  },
  {
    say: 'The Students tab lets you search any student by name or number, see their account status, and reset their password.',
    act: async (h) => {
      await tab(h, 'Students');
      await h.sleep(600);
      await h.type(h.page.getByPlaceholder('Search by name or student number…'), 'Reyes', { delay: 120 });
      await h.sleep(800);
      await h.click(h.page.locator('tbody tr').first().getByTitle('Reset password'));
      await confirm(h);
      await done(h);
    },
  },
  {
    say: 'The Activity tab is a log of deletes, password resets, publishing, and every admin change, with who did it and when.',
    act: async (h) => {
      await tab(h, 'Activity');
      await h.sleep(600);
      await h.hover(h.page.locator('.card').last(), 2500);
    },
  },
  {
    say: 'When you are finished, log out.',
    act: async (h) => h.logout(),
  },
  {
    say: 'That completes the admin guide. Thank you for watching.',
    act: async (h) => h.showCard(card({
      kicker: 'Quick recap',
      title: 'Admin<br><em>checklist</em>',
      lines: ['Add faculty by name and email', 'Key = reset, ban = disable', 'Sections: move to another faculty', 'Students: search and reset password', 'Activity: who did what, and when'],
      foot: 'New admin accounts: npm run create-admin on the server.',
    })),
    after: 1800,
  },
];
