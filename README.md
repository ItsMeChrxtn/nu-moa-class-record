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

Use the trash icon on a section card (dashboard) or next to **+ Item** on the section page. You must type the section code to confirm. This deletes the section's items, scores and enrollments; student accounts are kept.

## Run

```bash
npm run dev
```

Open http://localhost:5173.

For production: `npm run build`, then `npm start`. The server (port 5000) also serves the React build.

## Grading (same as the Excel file)

- **Midterm %** = CP(Midterms) × 30 + EA(Midterms) × 30 + MPT × 40
- **Final %** = CP(all) × 30 + EA(all) × 30 + MPT × 20 + CPT × 20 + Bonus
- Each component = total score ÷ total max of its items. Missing scores count as 0.
- Equivalence: ≥95.5 = 4.0, ≥89.5 = 3.5, ≥83.5 = 3.0, ≥77.5 = 2.5, ≥71.5 = 2.0, ≥65.5 = 1.5, ≥59.5 = 1.0, lower = R. Pass/Repeat for "The Nationalian" subjects.
- Percentages can be changed per section (**Percentage** button).

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
- **Add session:** date, Midterms / Post Midterms, optional label; "Mark everyone present" is on by default.
- Click a cell to cycle Present → Late → Absent → Excused → blank. Column buttons mark everyone present or delete a session.
- Attendance appears read-only in the grade grid and in the student's grade breakdown.

## Export grading sheet

The export uses the NU class record (CLREC) format: `server/templates/class-record-template.xlsx` is the blank CLREC workbook, filled the way a faculty would by hand.

- **Cover Page**: faculty, term and A.Y., and the section list (rows 19–28, up to 10 sections).
- **References**: the class list (ID, name, course, section) that the section sheets FILTER from.
- **One sheet per section**, copied from TEMPLATE: section code in U6, item names / max scores in rows 11–12 (CP Midterms J–P, CP Post Q–W, EA Midterms X–AD, EA Post AE–AK, MPT AL, CPT AM), scores and bonus from row 13, the section's percentage allocation in AG4:AJ5, and its own sheet-scoped names (CP_Midterms, EA_Total, …). The workbook's formulas compute the grades; a component with no items counts as 0 (IFERROR) instead of #DIV/0!.
- Attendance (when graded) fills one column of its CP or EA group. A group with more items than columns combines the extra items into its last column, so the grade stays exact.
- **Faculty dashboard → Export grading sheet** downloads it; from the command line (writes into a folder, never overwrites): `npm run export-grades -- <faculty email> "<folder>"` (add `--template <file>` to use another blank CLREC). Set `MONGODB_URI` to the Atlas string to export the online data.
