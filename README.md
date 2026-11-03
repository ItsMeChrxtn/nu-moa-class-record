# NU MOA Class Record (MERN)

A web-based replacement for the Excel class record. Faculty encode scores; each student sees **only their own** records online.

- **server/**: Express + Mongoose API (auth, sections, scores, grade computation)
- **client/**: React + Vite UI (faculty grid, student records page)

## Setup

Requires Node.js 20+ and MongoDB (local or Atlas).

```bash
npm run setup
```

Copy `server/.env.example` to `server/.env` and set `JWT_SECRET` to a long random string.

## Import the Excel class record

```bash
npm run import -- "D:\NU MOA\NU MOA A.Y. 2026 - 2027\1ST TERM\CLREC CLDEL ROSARIO T1 AY2026-2027.xlsx"
```

- Reads the **Cover Page** (faculty, term, A.Y., list of sections) and each section's sheet.
- The student ID comes from column **F** (the FILTER from *References*). Column D is not used.
- Items (Q1, Act 1, MPT, CPT…) are read from the header rows; columns without a max score are skipped.
- Each sheet's Percentage Allocation is imported too.
- **Re-importing replaces the items and scores** of the sections in the file.
- The faculty account whose name matches the Cover Page is reused (username `cldelrosario`); if none exists, a new one is created (use `--faculty-username` to choose the username).
- New accounts (faculty and each student, username = student number) get a random temporary password saved in `server/credentials/*.csv`. **Do not commit or share that file.** Give each student only their own password; they change it at first login.

## New section from a PDF master list

On the faculty dashboard, click **New Section** and drop the master list PDF. The PDF is read in the browser only; it is never uploaded.

- **Section details are filled in automatically** from the PDF header: section code, subject code and title, schedule, units, term and A.Y.
- **Schedule:** one row per meeting, each with a day, start time, end time and room; add as many rows as needed. Change it later with **Details** on the section page.
- **Student emails** are saved when the class list has them on the same row as the student (shown in the preview, in the admin Students tab, and as a tooltip on the student name). Filled fields are highlighted for review, and anything you typed yourself is never overwritten.
- Supported layouts: the NU class record export and the NU Grade Submission Report. Other lists work if they use `Label: value` lines.
- Students are found by a student number (e.g. `2023-150144`) followed by a `LAST, FIRST` name, plus the course when present (e.g. `BSIT-MWA-MNL`).
- Review and edit the list before saving (remove rows or add students manually).
- Items and percentages can be copied from another section.
- On the section page, the **Students** button imports more students. Scores of students already enrolled are kept.
- **Student accounts** (button on the section page) creates accounts and emails each student their student number and temporary password (Brevo). Students who already signed in are never changed; already-emailed students are skipped unless *Resend* is chosen; students without an email can get accounts with the passwords shown on screen (CSV download, also saved in `server/credentials/`). The grade grid shows each student’s account status. Importing a class list no longer creates accounts by itself.

## Admin

There are three roles: **admin**, **faculty** and **student**. The admin console (`/admin`) has four tabs:

- **Faculty**: add faculty by full name and **email** (any provider, e.g. Gmail or NU email; faculty sign in with this email). A temporary password is shown once, saved in `server/credentials/`, and emailed to them through Brevo when email is set up. Edit name and email, reset passwords, disable / re-enable accounts (a disabled account is signed out and cannot sign in; its sections and published grades stay), and delete accounts that own no sections.
- **Sections**: every section across all faculty; move a section (with its students and scores) to another faculty.
- **Students**: search all students by name or number and reset any student's password.
- **Activity**: a log of section creates/deletes, published/hidden grades, deleted items, removed students, password resets and all admin changes, with who did it and when.

Admin accounts are created only from the command line, never from the web app:

```bash
npm run create-admin -- admin "Juan Dela Cruz"     # create
npm run create-admin -- admin --reset              # new temporary password
```

### Email (Brevo)

New faculty accounts and faculty password resets are emailed (sign-in link, email, temporary password). Set in `server/.env`, then restart the server:

```
BREVO_API_KEY=xkeysib-…          # Brevo → SMTP & API → API keys
MAIL_FROM_EMAIL=…                # a sender verified in Brevo → Senders, domains & IPs
MAIL_FROM_NAME=NU MOA Class Record
APP_URL=http://localhost:5173    # address used in the sign-in link
```

If Brevo restricts API keys to approved IP addresses, add the server's IP in Brevo → Security → Authorised IPs. Without email set up, the password is only shown on screen. The admin's Faculty tab shows "Email on/off".

## Delete a section

Use the trash icon on a section card (dashboard) or **Manage → Delete section** on the section page. You must type the section code to confirm. This deletes the section's items, scores and enrollments; student accounts are kept.

## Run

```bash
npm run dev
```

Open http://localhost:5173.

For production: `npm run build`, then `npm start`. The server (port 5000) also serves the React build.

## Grading (same as the Excel file)

- **Dashboards.** Faculty home: today's date, a Today's classes panel (from each section's schedule, with Now / Next / Done), stat tiles, and each section card's class average per term. Admin: faculty, sections, students and student accounts in use. Students in more than one class pick it from cards showing their latest grade.
- **Weekly schedule (faculty).** Faculty home → **Weekly schedule**: a Monday–Saturday timetable (half-hour rows, 7 AM–6 PM, stretched to fit) built from the latest term's section schedules, one colour per section, today's column highlighted. **+ Consultation hours** adds the faculty's own blocks (consultation, meetings…; stored on the faculty account, `GET/PUT /api/faculty/schedule-blocks`); click a block to edit or remove it, click a class to open the section.
- **Weekly schedule: working hours and breaks.** Besides classes, the faculty adds **Admin / consultation** blocks (counted) and **Break time** blocks (shown, not counted). A block can be added on several days at once (pick the days, or Mon–Fri / Mon–Sat / MWF / TTh), all with the same time; editing a block can also copy it to more days. Exact duplicates are skipped. Each faculty has **work hours** (time in / time out, default 7:00 AM – 4:00 PM, changed from the schedule): admin, consultation and break blocks can only be picked inside them (earlier or later times are greyed out in the pickers and refused by the server), the grid shades the time outside them, and the work hours cannot be narrowed while a block would fall outside. The schedule shows total working hours (classes + admin/consultation) against 40 hours a week.
- **Faculty Loading Report (Excel).** Weekly schedule → **Loading report** fills the school's loading report template (`server/templates/faculty-loading-template.xlsx`, 20 class rows; unused rows are hidden): one row per class meeting with subject, section, day, time (AM/PM), LEC/LAB, room, mode, credit units (a LAB meeting = 1 unit, LEC meetings share the rest of the section's units) and teaching hours; consultation blocks go to Consultation Hours, other working blocks to Administration; break time is left out. The employee ID, classification (Full Time Probationary / Full Time Regular / Part Time) and the three signatories (name + position from a dropdown, or Other) are entered once and saved on the faculty account; the school is fixed to School of Information Technology. The template's own formulas (teaching subtotal, total load, 40 − load) are kept. LEC/LAB and mode are set per schedule row in **Section details**.
- **Work Week Schedule (Excel).** Filled into the school's work week template (`server/templates/workweek-template.xlsx`): Monday–Saturday in 20-minute rows from 7:00 AM to 9:00 PM; each block runs from the row labelled with its start time to the row labelled with its end time (7:00–11:00 fills 7:00 … 11:00); where two blocks meet, a class keeps the shared row and an admin hour or break gives it up, otherwise the earlier block keeps it (matches the school's own sheet); face-to-face classes green, ONLINE classes blue (remote synchronous), admin/consultation blocks yellow, breaks as BREAKTIME, and a day with no class or admin hours as DAY OFF; totals for admin work, face-to-face and remote; the faculty, Program Chair and Dean names from the saved report details. Block styles are copied from sample cells in column Z of the template, which are then removed.
- **Schedule files in one download.** Weekly schedule → **Schedule files** downloads a ZIP with the Faculty Loading Report and the Work Week Schedule (or either one alone): `GET /api/faculty/schedule-files`, `/loading-report`, `/workweek`.
- **Times always show AM/PM.** Time fields use hour / minute / AM-PM pickers instead of the browser's time box (which follows the PC's 24-hour setting), and older one-line times are shown with AM/PM.
- **Loading and popups (SweetAlert style).** Every save, update, delete, download, sign-in and sign-out opens a pixel-style loading screen ("LOADING..." in navy-to-royal-blue on a white card with the ink border and offset shadow, over a pixel-bordered, checkered blue progress bar, the current step and the percentage; downloads follow the real download progress), then a result popup: success (closes by itself), error (waits for OK) or info. Confirmations such as delete and log out use the same popup, and pages show the same pixel loader (with a sweeping bar) while their data loads. Quick, frequent saves (score cells, attendance marks) stay silent. It all hooks into `api()` / `downloadFile()` / `track()` in `client/src/api.js`; the popups are in `client/src/Feedback.jsx`.
- **Grade notices for students.** When a section is published (or a published section gets its first finals item), each enrolled student gets a notice: midterm grades once the section has midterm items, final grades once it has finals items, each only once. Students see a popup the first time they open the app afterwards and a bell in the top bar with the list (`GET /api/me/notifications`, `POST /api/me/notifications/read`).
- **Grade certificates (students).** The student page's **Certificates** card downloads a landscape A4 PDF per term, made in the browser with jsPDF (loaded only on click): navy border, cream paper with a gold frame and guilloche watermark, the student's name in script, the grade and grade point, course, section and term, a gold seal, the faculty-in-charge and the issue date, and small print saying it is not an official transcript. Fonts are bundled in `client/public/cert-fonts` (Great Vibes, Playfair Display SC, Crimson Text; SIL Open Font License, licence files included). The finals certificate appears once finals items exist. jsPDF's optional HTML/SVG add-ons are aliased to an empty module in `vite.config.js`, so they never reach the bundle.
- **Masterlist status.** When the class list PDF has a status per student, only **Enrolled** students are imported; rows marked **Registered** (signed up but not yet enrolled) are left out, and the import lists them so the faculty can see who was skipped.
- **Student page layout.** A class banner (subject, term, faculty, schedule, midterm and final grade), Midterms / Finals tabs, the term's scores per component on the left, and on the right how the grade adds up, the certificates and attendance.
- **Final-only subjects.** A section can be graded **Midterm and final** (default) or **Final only** (New Section / Section details → Grading). A final-only section has no midterm grade: one Final grade tab, items are CP, EA and CPT only (no MPT; every item is a finals item), and the final grade = CP + EA + CPT (+ bonus) with its own percentages (default 30 / 30 / 40). Students see only the final grade, its certificate and a final-grade notice. Switching an existing section to final only moves its midterm CP/EA items to finals and the MPT share of the final grade to the CPT; it is refused while the section has an MPT item.
- **Midterms and Finals tabs.** A section page has a Midterms tab (CP, EA, MPT and the midterm grade) and a Finals tab (CP, EA, CPT, bonus, the midterm grade for reference and the final grade). The Finals tab appears once the Midterm Performance Task has scores, or once finals items exist. **+ Midterm item** / **+ Finals item** only offers that term's components (MPT is always Midterms, CPT always Finals; the server enforces it). Students see the same two tabs; Finals shows once the faculty adds finals items.
- **Midterm %** = CP(Midterms) × 30 + EA(Midterms) × 30 + MPT × 40
- **Final %** = CP(all) × 30 + EA(all) × 30 + MPT × 20 + CPT × 20 + Bonus
- Each component = total score ÷ total max of its items. Missing scores count as 0.
- Equivalence: ≥95.5 = 4.0, ≥89.5 = 3.5, ≥83.5 = 3.0, ≥77.5 = 2.5, ≥71.5 = 2.0, ≥65.5 = 1.5, ≥59.5 = 1.0, lower = R. Pass/Repeat for "The Nationalian" subjects.
- Percentages can be changed per section (**Manage → Percentage & grade scale**).
- The equivalence above is the NU default. Each section can have its own table (**Manage → Percentage & grade scale** → Grade point equivalence, up to 7 grades plus R). The lowest row is the passing grade (e.g. start it at 75 for 75%). The exported class record prints the table set in the app. The app's grades and the exported class record's Grade Point Equivalence Table both follow it; **Reset to NU default** brings the default back.

Verified against the Excel file: Midterm/Final % and equivalents match for all 133 students.

## Privacy

- Students only see records of sections that are **published** (toggle on the section page).
- The API always loads records for the logged-in account, so a student cannot see anyone else's records.
- Passwords: bcrypt hash; session: httpOnly cookie (8 hours); login is rate-limited.
- When hosting online: use HTTPS (`NODE_ENV=production` for a secure cookie) and a non-public MongoDB.

## Deploy (GitHub → Render + Vercel)

- **API → Render** (`render.yaml`): Render → New → Blueprint → this repository. Set `MONGODB_URI` (MongoDB Atlas; Render cannot reach a local MongoDB), `BREVO_API_KEY`, `MAIL_FROM_EMAIL` and `APP_URL` (the Vercel address). `JWT_SECRET` is generated. Health check: `/api/health`.
- **Website → Vercel** (`client/`): import the repository with **Root Directory = `client`**. `client/vercel.json` builds with Vite and forwards `/api/*` to `https://nu-moa-class-record-api.onrender.com`, so sign-in cookies stay on the Vercel domain. If the Render service gets a different address, update that URL.
- **Brevo:** Render's outgoing IP addresses change, so in Brevo → Security → Authorised IPs either deactivate blocking for API keys or add Render's outbound IPs (Render → service → Connect → Outbound).
- Create the first admin on the server with `npm run create-admin -- admin "Full Name"` (Render → Shell), or copy the local database to Atlas.

## Attendance

On a section page, open the **Attendance** tab.

- **Counts toward:** Class Participation, Enabling Activities, or Not graded. Each period's attendance becomes one "Attendance" item inside that component: present = 1 point, late = the chosen value (default 0.5), absent = 0; excused sessions are not counted and unmarked sessions count as absent.
- **Add session:** date, Midterms / Finals, optional label; "Mark everyone present" is on by default.
- Click a cell to cycle Present → Late → Absent → Excused → blank. Column buttons mark everyone present or delete a session.
- Attendance appears read-only in the grade grid and in the student's grade breakdown.

## Export grading sheet

The export uses the NU class record (CLREC) format: `server/templates/class-record-template.xlsx` is the blank CLREC workbook, filled the way a faculty would by hand.

- **Cover Page**: faculty, term and A.Y., and the section list (rows 19–28, up to 10 sections).
- **References**: the class list (ID, name, course, section) that the section sheets FILTER from.
- **One sheet per section**, copied from TEMPLATE: section code in U6, item names / max scores in rows 11–12 (CP Midterms J–P, CP Post Q–W, EA Midterms X–AD, EA Post AE–AK, MPT AL, CPT AM), scores and bonus from row 13, the section's percentage allocation in AG4:AJ5, and its own sheet-scoped names (CP_Midterms, EA_Total, …). The workbook's formulas compute the grades; a component with no items counts as 0 (IFERROR) instead of #DIV/0!.
- Attendance (when graded) fills one column of its CP or EA group. A group with more items than columns combines the extra items into its last column, so the grade stays exact.
- The faculty dashboard groups sections by **academic year and term** (newest academic year first). Each group has its own **Export grading sheet** button, so a file only contains that term’s sections; the command writes one file per term (or one, with `--ay` / `--term`).
- **Export grading sheet** downloads it; from the command line (writes into a folder, never overwrites): `npm run export-grades -- <faculty email> "<folder>"` (add `--template <file>` to use another blank CLREC). Set `MONGODB_URI` to the Atlas string to export the online data.
