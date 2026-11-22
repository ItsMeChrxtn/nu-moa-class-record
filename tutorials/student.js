// Student tutorial: first sign-in, new password, reading the grade breakdown, notifications.

import { BASE, card } from './lib.js';

export const studentSteps = [
  {
    say: 'Welcome to the NU MOA Class Record. This video shows students how to sign in and view their grades online.',
    act: async (h) => {
      await h.showCard(card({
        kicker: 'Video tutorial · For students',
        title: 'Class Record<br><em>Student guide</em>',
        lines: ['Sign in for the first time', 'Set your own password', 'Read your grade breakdown', 'Certificates and notifications', 'Forgot your password'],
        foot: 'All names and grades in this video are sample data.',
      }));
    },
    after: 900,
  },
  {
    say: 'Your faculty will send you an email with a temporary password. Open the Class Record website, and type your email address, then the temporary password from the email.',
    act: async (h) => {
      await h.page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await h.replaceCursor();
      await h.sleep(1500);
      await h.type(h.page.getByLabel('Email', { exact: true }), 'lianne.ocampo@example.com', { delay: 90 });
      await h.type(h.page.getByLabel('Password', { exact: true }), 'Temp#2026', { delay: 90 });
    },
  },
  {
    say: 'Then click Log in.',
    act: async (h) => {
      await h.click('form button.btn.primary');
      await h.page.waitForURL('**/change-password');
      await h.replaceCursor();
      await h.ok();
    },
    after: 900,
  },
  {
    say: 'The first time you sign in, you must choose your own password. Type the temporary password, then a new password with at least eight characters, and type it again to confirm.',
    act: async (h) => {
      await h.sleep(600);
      await h.type(h.page.getByLabel('Current password'), 'Temp#2026', { delay: 70 });
      await h.type(h.page.getByLabel('New password', { exact: true }), 'MyGrades#2026', { delay: 70 });
      await h.type(h.page.getByLabel('Confirm new password'), 'MyGrades#2026', { delay: 70 });
    },
  },
  {
    say: 'Click Save password. Keep your password private, and never share it with classmates.',
    act: async (h) => {
      await h.click(h.page.getByRole('button', { name: 'Save password' }));
      await h.page.waitForURL('**/records');
      await h.replaceCursor();
    },
    after: 600,
  },
  {
    say: 'A message tells you which grades your faculty has made available. Click OK.',
    act: async (h) => {
      await h.sleep(1200);
      await h.ok();
      await h.ok(1500); // a second notice, if there is one
    },
  },
  {
    say: 'This is your records page. You have one account for all your classes, so your password stays the same even if another faculty adds you. Pick a class here. Each card shows your latest grade.',
    act: async (h) => {
      await h.sleep(800);
      const cards = h.page.locator('.class-picker button');
      await h.hover(cards.nth(0), 1300);
      await h.hover(cards.nth(1), 1300);
    },
  },
  {
    say: 'The banner shows the subject, your faculty, and your class schedule. On the right are your midterm grade and your final grade, with the percentage and the grade point.',
    act: async (h) => {
      await h.hover('.sr-banner h2', 1500);
      await h.hover('.sr-facts', 1300);
      const tiles = h.page.locator('.sr-grades .grade-tile');
      await h.hover(tiles.nth(0), 1200);
      await h.hover(tiles.nth(1), 1200);
    },
  },
  {
    say: 'Below the banner, every quiz, activity, and performance task is listed with your score and the maximum score, grouped by component.',
    act: async (h) => {
      await h.click(h.page.locator('.term-tabs button').first());
      await h.sleep(400);
      await h.page.locator('.sr-scores').scrollIntoViewIfNeeded();
      await h.hover('.sr-scores', 1600);
      await h.page.mouse.wheel(0, 300);
      await h.sleep(1000);
    },
  },
  {
    say: 'On the side, "How your grade adds up" shows how each component, multiplied by its percentage, becomes your grade. Below it, you can download a grade certificate as a PDF, and see your attendance.',
    act: async (h) => {
      await h.hover(h.page.locator('.sr-side').getByText(/How your/), 2400);
      await h.hover(h.page.locator('.sr-side').getByText(/Certificates/).first(), 1600);
      await h.hover(h.page.locator('.sr-side').getByText(/Attendance/).first(), 1200);
    },
  },
  {
    say: 'Click PDF to download a certificate of your grade. It is made right on your device, and is not an official transcript.',
    act: async (h) => {
      await h.download(h.page.locator('.sr-side').getByRole('button', { name: /Download the/ }).first());
      await h.sleep(600);
    },
  },
  {
    say: 'Here is the downloaded certificate. It shows your name, your grade and grade point, the course, section, and term, the faculty in charge, and the date it was issued.',
    act: async (h) => {
      await h.openFile([{ file: h.lastDownload, kind: 'pdf' }]);
      await h.sleep(1500);
      await h.zoom(0.5, 0.42, 1.6, 3000);
      await h.zoom(0.5, 0.75, 1.7, 2600);
      await h.zoom(0.5, 0.5, 1, 800);
    },
  },
  {
    say: 'You can print it, or share it. Now back to the records page.',
    act: async (h) => {
      await h.backTo('/records');
      await h.sleep(800);
    },
  },
  {
    say: 'Use the Midterms and Finals tabs to switch between the two terms.',
    act: async (h) => {
      await h.page.mouse.wheel(0, -500);
      await h.sleep(400);
      await h.click(h.page.locator('.term-tabs button').nth(1));
      await h.sleep(900);
      await h.click(h.page.locator('.term-tabs button').nth(0));
    },
  },
  {
    say: 'When your faculty publishes new grades, you get a notification. Click the bell to see them.',
    act: async (h) => {
      await h.hover('.bell-btn', 2400);
      await h.click('.bell-btn');
      await h.sleep(3200);
      await h.page.keyboard.press('Escape');
    },
  },
  {
    say: 'To see another class, just pick it from the cards at the top.',
    act: async (h) => {
      await h.page.mouse.wheel(0, -800);
      await h.sleep(300);
      await h.click(h.page.locator('.class-picker button').nth(1));
      await h.sleep(1500);
    },
  },
  {
    say: 'If a score looks wrong, talk to your faculty. When you are done, click Log out.',
    act: async (h) => {
      await h.sleep(1500);
      await h.logout();
    },
  },
  {
    say: 'Forgot your password? Click Forgot your password on the sign-in page, type your email, and click Email me a reset link. The link is sent to the email on your class list, and it works for one hour.',
    act: async (h) => {
      await h.click(h.page.getByRole('link', { name: 'Forgot your password?' }));
      await h.page.waitForURL('**/forgot-password');
      await h.replaceCursor();
      await h.type(h.page.getByLabel('Email', { exact: true }), 'lianne.ocampo@example.com', { delay: 90 });
      await h.click(h.page.getByRole('button', { name: 'Email me a reset link' }));
      await h.hover('.alert.ok', 1500);
    },
  },
  {
    say: 'No email after a few minutes? Ask your faculty to reset your password for you.',
    act: async (h) => h.hover('.auth-note', 1500),
  },
  {
    say: 'That is all. Log in with your email, set your own password, and check your grades anytime, even on your phone. Thank you for watching.',
    act: async (h) => {
      await h.showCard(card({
        kicker: 'Quick recap',
        title: 'Student<br><em>checklist</em>',
        lines: ['Log in with your email', 'Use the temporary password from the email', 'Set your own password (8+ characters)', 'Pick a class and check every score'],
        foot: 'Forgot your password? Use the link on the sign-in page.',
      }));
    },
    after: 1800,
  },
];
