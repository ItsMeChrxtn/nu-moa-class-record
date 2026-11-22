# Tutorial videos

Narrated how-to videos of every part of the Class Record, made automatically and for free:

| File | Length | Covers |
|---|---|---|
| `output/faculty-1-getting-started.mp4` | ~2 min | sign-in, dashboard (tiles, Today, week strip, section cards), Export grading sheet for a term, My profile, Forgot password |
| `output/faculty-2-weekly-schedule.mp4` | ~2 min | timetable, work hours, consultation and break blocks on several days, editing blocks, Schedule files (loading report + work week) |
| `output/faculty-3-sections-and-students.mp4` | ~3 min | New Section from a master list PDF (Registered students skipped), schedule rows, grading mode, copying items, sending student accounts, students with an account from another class, account status, Section details, adding / removing students, resetting a student password, deleting a section |
| `output/faculty-4-grades.mp4` | ~2.5 min | items, encoding scores, deleting an item, Finals items and CPT, bonus, attendance, percentages and grade scale, publishing, Excel export |
| `output/student-guide.mp4` | ~2.5 min | first sign-in, new password, grade notice, one account for all classes, class picker, scores, how the grade adds up, certificate PDF, attendance, notifications, Forgot password |
| `output/admin-guide.mp4` | ~2.5 min | faculty accounts (add, reset, disable / re-enable, delete), moving a section to another faculty, student password reset, activity log |

Each video comes with an `.srt` caption file; the captions are also burned into the video.

## How they are made

- **Screen:** Playwright drives the real app in Chromium, and Chrome's screencast records it. A visible cursor shows every click.
- **Voice:** [edge-tts](https://github.com/rany2/edge-tts) (free Microsoft neural voices, no account needed).
- **Video:** `ffmpeg-static` merges the screen, the voice and the captions into an MP4.
- **Downloaded files:** after each download the video opens the file and zooms into it: Excel files (grading sheet, Faculty Loading Report, Work Week Schedule) are printed to PDF by Microsoft Excel itself (`xlsx-to-pdf.ps1`, so the formulas are calculated and the school's layout is kept), and PDFs (grade certificate) are drawn with pdf.js. The recording pauses while a file is being prepared, so the video never shows the wait.
- **Data:** a separate `class-record-demo` database with made-up students (`server/scripts/seed-demo.js`). The real database is never touched. Account emails go to a local stand-in for Brevo, so nothing is sent.

## Make them again (e.g. after the app changes)

Needs MongoDB running locally, Microsoft Excel (for the file previews), Python with `edge-tts` (`py -m pip install --user edge-tts`), and an internet connection for the voice.

```bash
cd tutorials
npm install
npm run build              # all six videos
npm run build -- student admin   # only some: faculty-1 … faculty-4, student, admin
```

Another voice: set `VOICE` first, e.g. `VOICE=en-PH-RosaNeural npm run build` (list them with `py -m edge_tts --list-voices`).

The narration and the clicks are in `faculty.js` (four parts), `student.js` and `admin.js`: one step per spoken line. If a step fails, a screenshot of that moment is saved in `.cache/`.
