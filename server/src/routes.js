import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { User, Student, Section, Enrollment, Notification, audit, notifyGrades, notifyStudents, showOf } from './models.js';
import { COMPONENTS, DEFAULT_WEIGHTS, MARKS, attendanceItems, cleanScale, computeGrades, scaleOf } from './grading.js';
import { saveCredentials } from './credentials.js';
import { HHMM_RE as HHMM, blocksOutside, cleanBlocks, cleanSchedule, legacyFields, modeOf, workHoursOf } from './schedule.js';
import { mailConfigured, sendPasswordReset, sendStudentCredentials } from './mailer.js';
import { buildClassRecord, facultyTerms, gradingFileName } from './classRecordExport.js';
import { PROFILE_FIELDS, buildLoadingReport, loadingFileName } from './facultyLoading.js';
import { buildWorkWeek, workWeekFileName } from './workWeek.js';
import JSZip from 'jszip';
import admin, { FACULTY_EMAIL } from './admin.js';
import {
  clearSession,
  hashPassword,
  publicUser,
  requireAuth,
  requirePasswordSet,
  requireRole,
  setSession,
  tempPassword,
} from './auth.js';

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Auth ----------

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });

router.post(
  '/auth/login',
  loginLimiter,
  wrap(async (req, res) => {
    const { username, password } = req.body || {};
    // Faculty sign in with their NU email, students with the email on their class list
    // (their student number still works too), the admin with "admin".
    const user = await findLoginUser(username);
    const ok = user && (await bcrypt.compare(String(password || ''), user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });
    if (user.disabled)
      return res.status(403).json({ error: 'This account has been disabled. Please contact the administrator.' });
    user.lastLoginAt = new Date();
    await user.save();
    setSession(res, user);
    res.json({ user: publicUser(user) });
  })
);

router.post('/auth/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.post(
  '/auth/change-password',
  requireAuth,
  wrap(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!(await bcrypt.compare(String(currentPassword || ''), req.user.passwordHash)))
      return res.status(400).json({ error: 'Your current password is incorrect.' });
    if (typeof newPassword !== 'string' || newPassword.length < 8)
      return res.status(400).json({ error: 'The new password must be at least 8 characters.' });
    if (newPassword === currentPassword)
      return res.status(400).json({ error: 'The new password must be different from the current one.' });
    req.user.passwordHash = await hashPassword(newPassword);
    req.user.mustChangePassword = false;
    req.user.resetTokenHash = undefined; // an emailed reset link stops working once the password changes
    req.user.resetTokenExpires = undefined;
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  })
);

// ---------- Forgot password ----------
// The user types their student number or email; a one-hour link goes to the email on file
// (faculty: their sign-in email; students: the email from the class list). The answer is the same
// whether or not the account exists, so the form can't be used to find out who has one.

const forgotLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, message: { error: 'Too many reset requests. Please try again in 15 minutes.' } });
const RESET_MS = 60 * 60 * 1000;
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// The account for a username, a student number, or a student's class-list email.
async function findLoginUser(login) {
  const id = String(login || '').trim().toLowerCase().slice(0, 100);
  if (!id) return null;
  const user = await User.findOne({ username: id });
  if (user || !id.includes('@')) return user;
  const students = await Student.find({ email: id }).select('_id');
  return students.length ? User.findOne({ role: 'student', student: { $in: students.map((s) => s._id) } }) : null;
}

async function accountFor(login) {
  const user = await findLoginUser(login);
  if (!user || user.disabled) return {};
  if (user.role === 'student') {
    const s = await Student.findById(user.student).select('email');
    return { user, email: FACULTY_EMAIL.test(s?.email || '') ? s.email : null };
  }
  return { user, email: FACULTY_EMAIL.test(user.username) ? user.username : null };
}

router.post(
  '/auth/forgot-password',
  forgotLimiter,
  wrap(async (req, res) => {
    const { user, email } = await accountFor(req.body?.username);
    // One email a minute per account at most.
    const recent = user?.resetTokenExpires && user.resetTokenExpires - Date.now() > RESET_MS - 60 * 1000;
    if (user && email && !recent) {
      const token = crypto.randomBytes(32).toString('base64url');
      user.resetTokenHash = hashToken(token);
      user.resetTokenExpires = new Date(Date.now() + RESET_MS);
      await user.save();
      const mail = await sendPasswordReset({ email, name: user.name, token });
      if (!mail.sent) console.error(`Password reset email to ${email} failed: ${mail.error || 'email is not set up'}`);
      audit(user, 'auth.forgot-password', `${user.name} (${user.username})`, mail.sent ? 'reset link emailed' : `email failed: ${mail.error || 'not set up'}`);
    }
    res.json({ ok: true });
  })
);

async function userForToken(token) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const user = await User.findOne({ resetTokenHash: hashToken(token), resetTokenExpires: { $gt: new Date() } });
  return user && !user.disabled ? user : null;
}

router.post(
  '/auth/reset-password/check',
  loginLimiter,
  wrap(async (req, res) => {
    const user = await userForToken(req.body?.token);
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please ask for a new one.' });
    res.json({ name: user.name, username: user.username });
  })
);

router.post(
  '/auth/reset-password',
  loginLimiter,
  wrap(async (req, res) => {
    const { token, newPassword } = req.body || {};
    const user = await userForToken(token);
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please ask for a new one.' });
    if (typeof newPassword !== 'string' || newPassword.length < 8)
      return res.status(400).json({ error: 'The new password must be at least 8 characters.' });
    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    await user.save();
    audit(user, 'auth.reset-password', `${user.name} (${user.username})`, 'new password set from the emailed link');
    res.json({ ok: true, username: user.username });
  })
);

// ---------- Profile picture (any signed-in user) ----------

// A small JPEG/PNG/WebP data URL, resized in the browser (about 256 px).
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
router.put(
  '/me/photo',
  requireAuth,
  wrap(async (req, res) => {
    const photo = String(req.body?.photo || '');
    if (!PHOTO_RE.test(photo)) return res.status(400).json({ error: 'Choose a JPG, PNG or WebP image.' });
    if (photo.length > 90000) return res.status(413).json({ error: 'That picture is too large. Try a smaller one.' });
    req.user.photo = photo;
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  })
);
router.delete(
  '/me/photo',
  requireAuth,
  wrap(async (req, res) => {
    req.user.photo = undefined;
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  })
);

// ---------- Student ----------

router.get(
  '/me/records',
  requireAuth,
  requirePasswordSet,
  requireRole('student'),
  wrap(async (req, res) => {
    const enrollments = await Enrollment.find({ student: req.user.student }).populate({ path: 'section', populate: { path: 'faculty', select: 'name' } });
    const records = enrollments
      .filter((e) => e.section?.published)
      .map((e) => {
        const s = e.section;
        const show = showOf(s);
        // Attendance shows up as one "Attendance" item per period inside CP or EA.
        const att = show.attendance ? attendanceItems(s, e) : [];
        const grades = computeGrades(s, e);
        // Grades the faculty has not released yet never leave the server.
        const hidden = { hidden: true, percent: null, equivalent: null };
        return {
          section: { ...sectionSummary(s), weights: s.weights, faculty: s.faculty?.name || null },
          show,
          items: [...(show.scores ? s.items.map(itemDto) : []), ...att.map(attItemDto)],
          scores: { ...(show.scores ? Object.fromEntries(e.scores) : {}), ...Object.fromEntries(att.map((a) => [a._id, a.score])) },
          attendance: show.attendance ? attendanceSummary(s, e) : null,
          bonus: show.scores ? e.bonus : 0,
          grades: { ...grades, midterm: show.midterm ? grades.midterm : hidden, final: show.final ? grades.final : hidden },
        };
      });
    res.json({ records });
  })
);

// Student notices: "your midterm / final grades for ACT264 are now available".
router.get(
  '/me/notifications',
  requireAuth,
  requirePasswordSet,
  requireRole('student'),
  wrap(async (req, res) => {
    const list = await Notification.find({ student: req.user.student }).sort({ at: -1, createdAt: -1 }).limit(60).populate('section', 'code subjectCode subjectTitle term academicYear published show');
    // A section hidden again, or a part of it hidden again, drops out.
    const visible = (n) => {
      if (!n.section?.published) return false;
      const show = showOf(n.section);
      if (n.kind.startsWith('score:')) return show.scores;
      if (n.kind.startsWith('att:')) return show.attendance;
      return Boolean(show[n.kind]);
    };
    res.json({
      notifications: list
        .filter(visible)
        .slice(0, 40)
        .map((n) => ({
          id: n._id,
          kind: n.kind.startsWith('score:') ? 'score' : n.kind.startsWith('att:') ? 'attendance' : n.kind,
          text: n.text || null,
          at: n.at || n.createdAt,
          read: !!n.readAt,
          section: { id: n.section._id, code: n.section.code, subjectCode: n.section.subjectCode, subjectTitle: n.section.subjectTitle, term: n.section.term, academicYear: n.section.academicYear },
        })),
    });
  })
);
router.post(
  '/me/notifications/read',
  requireAuth,
  requirePasswordSet,
  requireRole('student'),
  wrap(async (req, res) => {
    await Notification.updateMany({ student: req.user.student, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true });
  })
);

// ---------- Faculty ----------

const faculty = express.Router();
faculty.use(requireAuth, requirePasswordSet, requireRole('faculty'));

// Weekly blocks besides classes (consultation hours, meetings…), for the weekly schedule.
faculty.get('/schedule-blocks', wrap(async (req, res) => res.json({ blocks: req.user.scheduleBlocks || [], workHours: workHoursOf(req.user) })));
faculty.put(
  '/schedule-blocks',
  wrap(async (req, res) => {
    const { rows, error } = cleanBlocks(req.body?.blocks);
    if (error) return res.status(400).json({ error });
    const outside = blocksOutside(rows, workHoursOf(req.user));
    if (outside) return res.status(400).json({ error: outside });
    req.user.scheduleBlocks = rows;
    await req.user.save();
    res.json({ blocks: rows });
  })
);
// Time in / time out: admin, consultation and break blocks must fall inside these hours.
faculty.put(
  '/work-hours',
  wrap(async (req, res) => {
    const { start, end } = req.body || {};
    if (!HHMM.test(String(start)) || !HHMM.test(String(end))) return res.status(400).json({ error: 'Choose a time in and a time out.' });
    if (end <= start) return res.status(400).json({ error: 'Time out must be after time in.' });
    const outside = blocksOutside(req.user.scheduleBlocks || [], { start, end });
    if (outside) return res.status(400).json({ error: `${outside} Move or remove it first.` });
    req.user.workHours = { start, end };
    await req.user.save();
    res.json({ workHours: { start, end } });
  })
);

const ownSection = wrap(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const section = await Section.findOne({ _id: req.params.id, faculty: req.user._id });
  if (!section) return res.status(404).json({ error: 'Not found' });
  req.section = section;
  next();
});

faculty.get(
  '/sections',
  wrap(async (req, res) => {
    const sections = await Section.find({ faculty: req.user._id }).sort({ code: 1 });
    const enrollments = await Enrollment.find({ section: { $in: sections.map((s) => s._id) } }, 'section scores attendance bonus');
    const bySection = new Map();
    for (const e of enrollments) {
      const k = String(e.section);
      if (!bySection.has(k)) bySection.set(k, []);
      bySection.get(k).push(e);
    }
    const avg = (list) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100 : null);
    res.json({
      sections: sections.map((s) => {
        const list = bySection.get(String(s._id)) || [];
        const grades = list.map((e) => computeGrades(s, e));
        const finalsItemCount = s.items.filter((i) => i.component === 'CPT' || (i.component !== 'MPT' && i.period === 'POST')).length;
        // The grade that matters now: the final grade once Finals has items, the midterm grade before.
        const now = (g) => (finalsItemCount || s.gradingMode === 'final' ? g.final : g.midterm);
        const gradeDist = {};
        if (s.items.length) for (const g of grades) gradeDist[now(g).equivalent] = (gradeDist[now(g).equivalent] || 0) + 1;
        // Present or late out of every marked, non-excused session.
        const att = { ok: 0, all: 0 };
        for (const e of list) {
          const c = attendanceSummary(s, e).counts || {};
          att.ok += (c.P || 0) + (c.L || 0);
          att.all += (c.P || 0) + (c.L || 0) + (c.A || 0);
        }
        // Present or late per session date, for the dashboard attendance trend.
        const attendanceByDate = (s.attendance?.sessions || []).map((ss) => {
          let ok = 0, all = 0;
          for (const e of list) {
            const m = e.attendance?.get?.(String(ss._id)) ?? e.attendance?.[String(ss._id)];
            if (m === 'P' || m === 'L') ok++;
            if (m === 'P' || m === 'L' || m === 'A') all++;
          }
          return { date: ss.date, ok, all };
        });
        return {
          ...sectionSummary(s),
          published: s.published,
          attendanceByDate,
          studentCount: list.length,
          itemCount: s.items.length,
          // MPT counts as Midterms, CPT as Finals; CP/EA by their period.
          finalsItemCount,
          // Class averages for the dashboard cards (null until the section has students and items).
          midtermAverage: s.items.length && s.gradingMode !== 'final' ? avg(grades.map((g) => g.midterm.percent)) : null,
          finalAverage: s.items.length ? avg(grades.map((g) => g.final.percent)) : null,
          gradeDist, // { "2.5": 4, ... } for the current grade
          attendanceRate: att.all ? Math.round((att.ok / att.all) * 1000) / 10 : null,
          sessionCount: s.attendance?.sessions?.length || 0,
        };
      }),
    });
  })
);

faculty.get('/sections/:id', ownSection, wrap(async (req, res) => res.json(await sectionDetail(req.section))));

faculty.patch(
  '/sections/:id',
  ownSection,
  wrap(async (req, res) => {
    const { published, weights, details, gradeScale, show } = req.body || {};
    const before = showOf(req.section);
    // null resets to the NU default; an array sets this section's own scale.
    if (gradeScale !== undefined) {
      if (gradeScale === null) req.section.gradeScale = [];
      else {
        const { rows, error } = cleanScale(gradeScale);
        if (error) return res.status(400).json({ error });
        req.section.gradeScale = rows;
      }
      audit(req.user, 'section.grade-scale', sectionLabel(req.section), gradeScale === null ? 'reset to NU default' : req.section.gradeScale.map((r) => `${r.eq} ≥ ${r.min}`).join(', '));
    }
    if (details) {
      const { data, error } = sectionFields(details, true);
      if (error) return res.status(400).json({ error });
      if (data.code === '') return res.status(400).json({ error: 'Section code is required.' });
      if (data.gradingMode === 'final' && req.section.gradingMode !== 'final') {
        const err = toFinalOnly(req.section);
        if (err) return res.status(400).json({ error: err });
      }
      Object.assign(req.section, data);
      audit(req.user, 'section.update', sectionLabel(req.section), Object.keys(data).filter((k) => !['day', 'time', 'room'].includes(k)).join(', '));
    }
    if (typeof published === 'boolean' && published !== req.section.published) {
      req.section.published = published;
      audit(req.user, published ? 'section.publish' : 'section.unpublish', sectionLabel(req.section));
    }
    if (show && typeof show === 'object') {
      const next = { ...before };
      for (const k of ['scores', 'attendance', 'midterm', 'final']) if (typeof show[k] === 'boolean') next[k] = show[k];
      req.section.show = next;
      const changed = Object.keys(next).filter((k) => next[k] !== before[k]);
      if (changed.length) audit(req.user, 'section.visibility', sectionLabel(req.section), changed.map((k) => `${k} ${next[k] ? 'shown' : 'hidden'}`).join(', '));
    }
    if (weights) {
      const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      req.section.weights = {
        midterm: { CP: num(weights.midterm?.CP), EA: num(weights.midterm?.EA), MPT: num(weights.midterm?.MPT) },
        final: {
          CP: num(weights.final?.CP),
          EA: num(weights.final?.EA),
          MPT: num(weights.final?.MPT),
          CPT: num(weights.final?.CPT),
        },
      };
    }
    try {
      await req.section.save();
    } catch (e) {
      if (e.code === 11000)
        return res.status(409).json({ error: `${req.section.code} already exists for ${req.section.term} ${req.section.academicYear}.` });
      throw e;
    }
    const after = showOf(req.section);
    if (published === true || (after.midterm && !before.midterm) || (after.final && !before.final)) await notifyGrades(req.section);
    res.json(await sectionDetail(req.section));
  })
);

faculty.post(
  '/sections/:id/items',
  ownSection,
  wrap(async (req, res) => {
    const { component, period, label, max } = req.body || {};
    if (!COMPONENTS.includes(component)) return res.status(400).json({ error: 'Invalid component' });
    if (!label || !(Number(max) > 0)) return res.status(400).json({ error: 'A label and a max score are required.' });
    // Midterms: CP, EA, MPT. Finals: CP, EA, CPT. A final-only section has finals items only.
    const finalOnly = req.section.gradingMode === 'final';
    if (finalOnly && component === 'MPT') return res.status(400).json({ error: 'A final-only section has no Midterm Performance Task.' });
    const term = finalOnly || component === 'CPT' ? 'POST' : component === 'MPT' ? 'MID' : period === 'POST' ? 'POST' : 'MID';
    req.section.items.push({ component, period: term, label, max: Number(max) });
    await req.section.save();
    await notifyGrades(req.section); // e.g. the first finals item of a published section
    res.json(await sectionDetail(req.section));
  })
);

faculty.delete(
  '/sections/:id/items/:itemId',
  ownSection,
  wrap(async (req, res) => {
    const item = req.section.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Not found' });
    item.deleteOne();
    await req.section.save();
    audit(req.user, 'item.delete', sectionLabel(req.section), `${item.component} ${item.label} (/${item.max}) and its scores`);
    await Enrollment.updateMany(
      { section: req.section._id },
      { $unset: { [`scores.${req.params.itemId}`]: '' } }
    );
    await Notification.deleteMany({ section: req.section._id, kind: `score:${req.params.itemId}` });
    res.json(await sectionDetail(req.section));
  })
);

// Set one score cell (or bonus). Body: { studentId, itemId | 'bonus', score | null }
faculty.put(
  '/sections/:id/scores',
  ownSection,
  wrap(async (req, res) => {
    const { studentId, itemId, score } = req.body || {};
    const enrollment = await Enrollment.findOne({ section: req.section._id, student: studentId });
    if (!enrollment) return res.status(404).json({ error: 'Student not in section' });

    const value = score === null || score === '' ? null : Number(score);
    if (value !== null && !Number.isFinite(value)) return res.status(400).json({ error: 'Invalid score' });

    if (itemId === 'bonus') {
      enrollment.bonus = value ?? 0;
    } else {
      const item = req.section.items.id(itemId);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      if (value !== null && (value < 0 || value > item.max))
        return res.status(400).json({ error: `Score must be between 0 and ${item.max}` });
      if (value === null) enrollment.scores.delete(String(itemId));
      else enrollment.scores.set(String(itemId), value);
    }
    await enrollment.save();
    if (showOf(req.section).scores) {
      const kind = `score:${itemId}`;
      if (value === null || (itemId === 'bonus' && !value)) await Notification.deleteOne({ student: studentId, section: req.section._id, kind });
      else {
        const item = itemId === 'bonus' ? null : req.section.items.id(itemId);
        await notifyStudents(req.section, [{ student: enrollment.student, kind, text: item ? `${item.label} · ${value} / ${item.max}` : `Bonus · +${value}` }]);
      }
    }
    res.json({ grades: computeGrades(req.section, enrollment) });
  })
);

faculty.post(
  '/sections/:id/students/:studentId/reset-password',
  ownSection,
  wrap(async (req, res) => {
    const enrolled = await Enrollment.exists({ section: req.section._id, student: req.params.studentId });
    if (!enrolled) return res.status(404).json({ error: 'Student not in section' });
    const user = await User.findOne({ student: req.params.studentId, role: 'student' });
    if (!user) return res.status(404).json({ error: 'This student has no account yet. Use “Student accounts” to create it.' });
    const pw = tempPassword();
    user.passwordHash = await hashPassword(pw);
    user.mustChangePassword = true;
    user.credentialsSentAt = undefined;
    user.accountBy = req.user._id;
    await user.save();
    // Email it when we can; the password is shown on screen either way.
    const student = await Student.findById(req.params.studentId);
    const mail = EMAIL.test(student?.email || '')
      ? await sendStudentCredentials({ email: student.email, name: user.name, studentNo: user.username, tempPassword: pw, section: req.section, faculty: req.user.name })
      : { sent: false, configured: mailConfigured(), error: 'This student has no email on file.' };
    if (mail.sent) {
      user.credentialsSentAt = new Date();
      await user.save();
    }
    audit(req.user, 'student.reset-password', `${user.name} (${user.username})`, `${sectionLabel(req.section)}${mail.sent ? ' · emailed' : ''}`);
    res.json({ username: user.username, tempPassword: pw, mail, email: student?.email || null });
  })
);

const str = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const STUDENT_NO = /^\d{4}-\d{4,7}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Section details from a form. partial: only the fields present are returned (for edits).
// Turning a section into "final only": its CP/EA midterm items become finals items, and the MPT share
// of the final grade moves to the CPT so the percentages still add up to 100. Refused while it has an
// MPT item (a midterm task), so no scores are silently dropped. Returns an error message or null.
function toFinalOnly(section) {
  if (section.items.some((i) => i.component === 'MPT'))
    return 'This section has a Midterm Performance Task. Delete it first, then switch to final only.';
  for (const i of section.items) if (i.component === 'CP' || i.component === 'EA') i.period = 'POST';
  const f = section.weights?.final || DEFAULT_WEIGHTS.final;
  section.set('weights.final.CPT', (Number(f.CPT) || 0) + (Number(f.MPT) || 0));
  section.set('weights.final.MPT', 0);
  return null;
}

function sectionFields(b, partial) {
  const data = {};
  const has = (k) => !partial || b[k] !== undefined;
  if (has('code')) data.code = str(b.code, 20).toUpperCase().replace(/\s+/g, '');
  if (has('subjectCode')) data.subjectCode = str(b.subjectCode, 30).toUpperCase();
  if (has('subjectTitle')) data.subjectTitle = str(b.subjectTitle).toUpperCase();
  if (has('units')) data.units = Number(b.units) || undefined;
  if (has('term')) data.term = str(b.term, 30);
  if (has('academicYear')) data.academicYear = str(b.academicYear, 20);
  if (b.gradingMode !== undefined) {
    if (!['both', 'final'].includes(b.gradingMode)) return { error: 'Choose "Midterm and final" or "Final only".' };
    data.gradingMode = b.gradingMode;
  }
  if (b.schedule !== undefined) {
    const { rows, error } = cleanSchedule(b.schedule);
    if (error) return { error };
    data.schedule = rows;
    Object.assign(data, legacyFields(rows));
  } else if (!partial) {
    // Older clients send one-line day/time/room.
    Object.assign(data, { day: str(b.day, 40).toUpperCase(), time: str(b.time, 60), room: str(b.room, 30) });
  }
  return { data };
}

faculty.post(
  '/sections',
  wrap(async (req, res) => {
    const b = req.body || {};
    const { data, error } = sectionFields(b, false);
    if (error) return res.status(400).json({ error });
    data.faculty = req.user._id;
    // A final-only subject starts with CP 30 / EA 30 / CPT 40 for its final grade.
    if (data.gradingMode === 'final') data.weights = { midterm: DEFAULT_WEIGHTS.midterm, final: { CP: 30, EA: 30, MPT: 0, CPT: 40 } };
    if (!data.code) return res.status(400).json({ error: 'Section code is required.' });
    if (b.copyFrom && mongoose.isValidObjectId(b.copyFrom)) {
      const src = await Section.findOne({ _id: b.copyFrom, faculty: req.user._id });
      if (src) {
        const o = src.toObject();
        data.weights = o.weights;
        data.gradeScale = o.gradeScale || [];
        data.items = o.items.map(({ component, period, label, max }) => ({ component, period, label, max }));
        if (b.gradingMode === undefined) data.gradingMode = o.gradingMode || 'both';
      }
    }
    // Copied from a midterm-and-final section into a final-only one: keep finals-type items only.
    if (data.gradingMode === 'final' && data.items) {
      data.items = data.items.filter((i) => i.component !== 'MPT').map((i) => ({ ...i, period: 'POST' }));
      const f = data.weights?.final || DEFAULT_WEIGHTS.final;
      data.weights = { midterm: data.weights?.midterm || DEFAULT_WEIGHTS.midterm, final: { CP: f.CP || 0, EA: f.EA || 0, MPT: 0, CPT: (f.CPT || 0) + (f.MPT || 0) } };
    }
    try {
      const section = await Section.create(data);
      audit(req.user, 'section.create', sectionLabel(section));
      res.status(201).json(await sectionDetail(section));
    } catch (e) {
      if (e.code === 11000)
        return res.status(409).json({ error: `${data.code} already exists for ${data.term} ${data.academicYear}.` });
      throw e;
    }
  })
);

// Enroll a class list. Creates student accounts (temp password) for new student numbers.
faculty.post(
  '/sections/:id/students',
  ownSection,
  wrap(async (req, res) => {
    const list = Array.isArray(req.body?.students) ? req.body.students : [];
    if (!list.length) return res.status(400).json({ error: 'No students to enroll.' });
    if (list.length > 500) return res.status(400).json({ error: 'Too many students (max 500).' });

    const result = { added: 0, already: 0, skipped: [], credentials: [] };
    for (const s of list) {
      const studentNo = str(s.studentNo, 20);
      const name = str(s.name).toUpperCase();
      const course = str(s.course, 40).toUpperCase();
      const email = str(s.email, 100).toLowerCase();
      if (!STUDENT_NO.test(studentNo) || !name) {
        result.skipped.push(studentNo || name || '(blank)');
        continue;
      }
      // Existing students keep their stored name/course; an email from the latest list is saved.
      const student = await Student.findOneAndUpdate(
        { studentNo },
        { $setOnInsert: { name, course }, ...(EMAIL.test(email) && { $set: { email } }) },
        { upsert: true, new: true }
      );
      if (EMAIL.test(email)) result.emails = (result.emails || 0) + 1;
      // A student imported earlier without a course gets it from this list (an existing course is kept).
      if (course && !student.course) await Student.updateOne({ _id: student._id }, { $set: { course } });
      // Accounts are created (and emailed) from the section's "Student accounts" button.
      const r = await Enrollment.updateOne(
        { section: req.section._id, student: student._id },
        { $setOnInsert: { bonus: 0 } },
        { upsert: true }
      );
      if (r.upsertedCount) result.added++;
      else result.already++;
    }
    if (result.added) audit(req.user, 'section.enroll', sectionLabel(req.section), `${result.added} students enrolled`);
    res.json({ ...(await sectionDetail(req.section)), result });
  })
);

// ---------- Student accounts ----------

// Account state of one student: none, sent (temp password emailed), temp (temp password, not emailed), active.
function accountStatus(user) {
  if (!user) return 'none';
  if (!user.mustChangePassword) return 'active';
  return user.credentialsSentAt ? 'sent' : 'temp';
}

// A student has one account for all their classes. A temporary password nobody has used yet may
// already be in the student's hands, so only whoever issued it can replace it in bulk. Returns the
// ids of students whose temporary password came from someone else. Accounts from before this was
// recorded count as someone else's when another faculty also teaches the student.
async function sharedAccounts(users, me) {
  const pending = users.filter((u) => u.mustChangePassword);
  const shared = new Set(pending.filter((u) => u.accountBy && String(u.accountBy) !== String(me._id)).map((u) => String(u.student)));
  const unknown = pending.filter((u) => !u.accountBy).map((u) => u.student);
  if (unknown.length) {
    const enrollments = await Enrollment.find({ student: { $in: unknown } }).populate('section', 'faculty');
    for (const e of enrollments) if (e.section && String(e.section.faculty) !== String(me._id)) shared.add(String(e.student));
  }
  return shared;
}

faculty.get(
  '/sections/:id/accounts',
  ownSection,
  wrap(async (req, res) => {
    const enrollments = await Enrollment.find({ section: req.section._id }).populate('student');
    const ids = enrollments.map((e) => e.student?._id).filter(Boolean);
    const users = await User.find({ student: { $in: ids }, role: 'student' });
    const byStudent = Object.fromEntries(users.map((u) => [String(u.student), u]));
    const shared = await sharedAccounts(users, req.user);
    const students = enrollments
      .filter((e) => e.student)
      .map((e) => {
        const u = byStudent[String(e.student._id)];
        return {
          shared: shared.has(String(e.student._id)),
          id: e.student._id,
          studentNo: e.student.studentNo,
          name: e.student.name,
          email: e.student.email || null,
          status: accountStatus(u),
          sentAt: u?.credentialsSentAt || null,
          lastLoginAt: u?.lastLoginAt || null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ students, mailConfigured: mailConfigured() });
  })
);

// Create accounts and email temporary passwords. Never touches a student who already set their own
// password, or a temporary password another faculty issued (see sharedAccounts).
// Body: { resend: bool (also students already emailed), includeNoEmail: bool (create, show passwords here) }
faculty.post(
  '/sections/:id/accounts/send',
  ownSection,
  wrap(async (req, res) => {
    const { resend = false, includeNoEmail = false } = req.body || {};
    const enrollments = await Enrollment.find({ section: req.section._id }).populate('student');
    const result = { sent: 0, failed: [], shown: [], skippedActive: 0, skippedShared: 0, skippedSent: 0, skippedNoEmail: 0 };
    const hasMail = mailConfigured();
    const queue = [];
    const shared = await sharedAccounts(await User.find({ student: { $in: enrollments.map((e) => e.student?._id).filter(Boolean) }, role: 'student' }), req.user);

    for (const e of enrollments) {
      const s = e.student;
      if (!s) continue;
      let user = await User.findOne({ student: s._id, role: 'student' });
      const status = accountStatus(user);
      if (status === 'active') { result.skippedActive++; continue; }
      if (shared.has(String(s._id))) { result.skippedShared++; continue; }
      if (status === 'sent' && !resend) { result.skippedSent++; continue; }
      const canEmail = hasMail && EMAIL.test(s.email || '');
      if (!canEmail && !includeNoEmail) { result.skippedNoEmail++; continue; }
      if (!user && (await User.exists({ username: s.studentNo }))) {
        result.failed.push({ studentNo: s.studentNo, name: s.name, error: 'Username already used by another account' });
        continue;
      }
      // New temporary password (old temporary ones were never used, since the student has not signed in).
      const pw = tempPassword();
      if (!user) user = new User({ username: s.studentNo, role: 'student', name: s.name, student: s._id });
      user.passwordHash = await hashPassword(pw);
      user.mustChangePassword = true;
      user.credentialsSentAt = undefined;
      user.accountBy = req.user._id;
      try {
        await user.save();
      } catch (err) {
        // Another faculty created this account at the same moment: theirs stands.
        if (err.code !== 11000) throw err;
        result.skippedShared++;
        continue;
      }
      queue.push({ user, student: s, pw, canEmail });
    }

    // Send a few at a time so a whole class goes out quickly without hammering Brevo.
    const faculty = req.user.name;
    for (let i = 0; i < queue.length; i += 5) {
      await Promise.all(
        queue.slice(i, i + 5).map(async ({ user, student, pw, canEmail }) => {
          const row = { studentNo: student.studentNo, name: student.name, email: student.email || null, tempPassword: pw };
          if (!canEmail) return result.shown.push(row);
          const mail = await sendStudentCredentials({ email: student.email, name: student.name, studentNo: student.studentNo, tempPassword: pw, section: req.section, faculty });
          if (mail.sent) {
            user.credentialsSentAt = new Date();
            await user.save();
            result.sent++;
          } else {
            // Keep the password visible so the faculty can still hand it out.
            result.failed.push({ ...row, error: mail.error || 'Email could not be sent' });
          }
        })
      );
    }

    const notEmailed = [...result.shown, ...result.failed.filter((f) => f.tempPassword)];
    if (notEmailed.length) saveCredentials(req.section.code, notEmailed);
    if (queue.length)
      audit(req.user, 'section.accounts', sectionLabel(req.section), `${result.sent} emailed, ${result.shown.length} shown on screen, ${result.failed.length} failed`);
    res.json({ result, mailConfigured: hasMail });
  })
);

// Delete a whole section: its items, scores and enrollments. Student accounts are kept
// (they may be enrolled in other sections).
faculty.delete(
  '/sections/:id',
  ownSection,
  wrap(async (req, res) => {
    const { deletedCount } = await Enrollment.deleteMany({ section: req.section._id });
    await req.section.deleteOne();
    audit(req.user, 'section.delete', sectionLabel(req.section), `${deletedCount} enrollments and ${req.section.items.length} items removed`);
    res.json({ ok: true, removedEnrollments: deletedCount });
  })
);

// Remove a student from this section only (account and other sections are kept).
faculty.delete(
  '/sections/:id/students/:studentId',
  ownSection,
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.studentId)) return res.status(404).json({ error: 'Not found' });
    const enrollment = await Enrollment.findOneAndDelete({ section: req.section._id, student: req.params.studentId }).populate('student');
    if (enrollment)
      audit(req.user, 'student.remove', `${enrollment.student?.name} (${enrollment.student?.studentNo})`, sectionLabel(req.section));
    res.json(await sectionDetail(req.section));
  })
);

// Details for the Faculty Loading Report (employee ID, classification, signatories).
faculty.get('/loading-report/details', wrap(async (req, res) => res.json({ details: req.user.loadingReport || {} })));
faculty.put(
  '/loading-report/details',
  wrap(async (req, res) => {
    const body = req.body?.details || {};
    const details = {};
    for (const k of PROFILE_FIELDS) details[k] = str(body[k], 80);
    req.user.loadingReport = details;
    await req.user.save();
    res.json({ details });
  })
);

// The faculty member's own details. The employee ID is the same one printed on the schedule files.
// Changing the email changes the sign-in, so it needs the current password.
const PHONE_RE = /^[0-9+()\-\s]{7,20}$/;
const profileOf = (u) => ({
  name: u.name,
  email: FACULTY_EMAIL.test(u.username) ? u.username : '',
  username: u.username,
  employeeId: u.loadingReport?.employeeId || '',
  phone: u.phone || '',
});
faculty.get('/profile', wrap(async (req, res) => res.json({ profile: profileOf(req.user) })));
faculty.put(
  '/profile',
  wrap(async (req, res) => {
    const b = req.body || {};
    const u = req.user;
    const changes = [];
    if (b.name !== undefined) {
      const name = str(b.name, 100).replace(/\s+/g, ' ');
      if (!name) return res.status(400).json({ error: 'Enter your full name.' });
      if (name !== u.name) changes.push('name');
      u.name = name;
    }
    if (b.email !== undefined) {
      const email = str(b.email, 100).toLowerCase();
      if (!FACULTY_EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address, e.g. juan.delacruz@gmail.com.' });
      if (email !== u.username) {
        if (!(await bcrypt.compare(String(b.currentPassword || ''), u.passwordHash)))
          return res.status(400).json({ error: 'Enter your current password to change your email.' });
        if (await User.exists({ username: email })) return res.status(409).json({ error: `${email} already has an account.` });
        changes.push(`sign-in ${u.username} → ${email}`);
        u.username = email;
      }
    }
    if (b.employeeId !== undefined) {
      const id = str(b.employeeId, 40);
      if (id !== (u.loadingReport?.employeeId || '')) changes.push('employee ID');
      u.set('loadingReport.employeeId', id);
    }
    if (b.phone !== undefined) {
      const phone = str(b.phone, 20);
      if (phone && !PHONE_RE.test(phone)) return res.status(400).json({ error: 'Enter a valid contact number, e.g. 0917 123 4567.' });
      if (phone !== (u.phone || '')) changes.push('contact number');
      u.phone = phone;
    }
    await u.save();
    if (changes.length) audit(u, 'faculty.profile', `${u.name} (${u.username})`, changes.join('; '));
    res.json({ profile: profileOf(u), user: publicUser(u) });
  })
);

// One term's sections (?academicYear=&term=; default: the latest term) for the schedule files.
async function termSections(req) {
  const t = req.query.academicYear !== undefined || req.query.term !== undefined ? { academicYear: req.query.academicYear, term: req.query.term } : (await facultyTerms(req.user))[0] || {};
  const filter = { academicYear: String(t.academicYear ?? ''), term: String(t.term ?? '') };
  const sections = await Section.find({ faculty: req.user._id, academicYear: filter.academicYear || { $in: ['', null] }, term: filter.term || { $in: ['', null] } });
  return { filter, sections };
}
function sendFile(res, name, type, buffer) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.send(buffer);
}
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const scheduleArgs = (req, sections, filter) => [req.user, sections, req.user.scheduleBlocks || [], req.user.loadingReport || {}, filter];

// Faculty Loading Report for one term, from the school's template.
faculty.get(
  '/loading-report',
  wrap(async (req, res) => {
    const { filter, sections } = await termSections(req);
    if (!sections.length) return res.status(404).json({ error: 'No sections for that term.' });
    const { buffer } = await buildLoadingReport(...scheduleArgs(req, sections, filter));
    sendFile(res, loadingFileName(req.user, filter.term, filter.academicYear), XLSX, buffer);
  })
);

// Work Week Schedule for one term, from the school's template.
faculty.get(
  '/workweek',
  wrap(async (req, res) => {
    const { filter, sections } = await termSections(req);
    if (!sections.length) return res.status(404).json({ error: 'No sections for that term.' });
    const { buffer } = await buildWorkWeek(...scheduleArgs(req, sections, filter));
    sendFile(res, workWeekFileName(req.user, filter.term, filter.academicYear), XLSX, buffer);
  })
);

// Both schedule files in one download (ZIP): the Faculty Loading Report and the Work Week Schedule.
faculty.get(
  '/schedule-files',
  wrap(async (req, res) => {
    const { filter, sections } = await termSections(req);
    if (!sections.length) return res.status(404).json({ error: 'No sections for that term.' });
    const [loading, week] = await Promise.all([buildLoadingReport(...scheduleArgs(req, sections, filter)), buildWorkWeek(...scheduleArgs(req, sections, filter))]);
    const loadingName = loadingFileName(req.user, filter.term, filter.academicYear);
    const zip = new JSZip();
    zip.file(loadingName, loading.buffer);
    zip.file(workWeekFileName(req.user, filter.term, filter.academicYear), week.buffer);
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    sendFile(res, loadingName.replace(/_STUDENT-CLASS-SCHEDULES\.xlsx$/, '_SCHEDULES.zip'), 'application/zip', buffer);
  })
);

// Grading sheet in the NU class record format: one sheet per section, filled into the CLREC template.
faculty.get(
  '/export',
  wrap(async (req, res) => {
    // ?section=<id> exports one section; ?academicYear=…&term=… one term; neither: the latest term.
    let filter;
    if (req.query.section) {
      if (!mongoose.isValidObjectId(req.query.section)) return res.status(404).json({ error: 'Section not found.' });
      filter = { sectionId: req.query.section };
    } else {
      const t = req.query.academicYear !== undefined || req.query.term !== undefined ? { academicYear: req.query.academicYear, term: req.query.term } : (await facultyTerms(req.user))[0] || {};
      filter = { academicYear: String(t.academicYear ?? ''), term: String(t.term ?? '') };
    }
    const { buffer, sections } = await buildClassRecord(req.user, undefined, filter);
    if (!sections.length) return res.status(404).json({ error: filter.sectionId ? 'Section not found.' : 'No sections for that term.' });
    const name = gradingFileName(req.user, sections);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(buffer);
  })
);

// ---------- Attendance ----------

const DATE = /^\d{4}-\d{2}-\d{2}$/;

faculty.patch(
  '/sections/:id/attendance',
  ownSection,
  wrap(async (req, res) => {
    const { component, late } = req.body || {};
    const att = req.section.attendance || (req.section.attendance = { sessions: [] });
    if (component !== undefined) {
      if (!['CP', 'EA', ''].includes(component)) return res.status(400).json({ error: 'Choose CP, EA or Not graded.' });
      if (component !== att.component) audit(req.user, 'attendance.settings', sectionLabel(req.section), `counts toward ${component || 'nothing (not graded)'}`);
      att.component = component;
    }
    if (late !== undefined) {
      const n = Number(late);
      if (!(n >= 0 && n <= 1)) return res.status(400).json({ error: 'Late must be between 0 and 1 point.' });
      att.late = n;
    }
    await req.section.save();
    res.json(await sectionDetail(req.section));
  })
);

faculty.post(
  '/sections/:id/attendance/sessions',
  ownSection,
  wrap(async (req, res) => {
    const { date, period, label, markAll } = req.body || {};
    if (!DATE.test(String(date || ''))) return res.status(400).json({ error: 'Choose the date of the class.' });
    const att = req.section.attendance || (req.section.attendance = { sessions: [] });
    if (att.sessions.length >= 200) return res.status(400).json({ error: 'A section can have at most 200 sessions.' });
    att.sessions.push({ date, period: period === 'POST' ? 'POST' : 'MID', label: str(label, 40) });
    att.sessions.sort((a, b) => a.date.localeCompare(b.date));
    await req.section.save();
    const session = att.sessions.find((s) => s.date === date && s.label === str(label, 40) && s.period === (period === 'POST' ? 'POST' : 'MID'));
    if (MARKS.includes(markAll)) {
      await Enrollment.updateMany({ section: req.section._id }, { $set: { [`attendance.${session._id}`]: markAll } });
      const list = await Enrollment.find({ section: req.section._id }, 'student');
      await notifyAttendance(req.section, session, list.map((e) => ({ student: e.student, mark: markAll })));
    }
    res.json(await sectionDetail(req.section));
  })
);

faculty.patch(
  '/sections/:id/attendance/sessions/:sid',
  ownSection,
  wrap(async (req, res) => {
    const s = req.section.attendance?.sessions.id(req.params.sid);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const { date, period, label } = req.body || {};
    if (date !== undefined) {
      if (!DATE.test(String(date))) return res.status(400).json({ error: 'Invalid date' });
      s.date = date;
    }
    if (period !== undefined) s.period = period === 'POST' ? 'POST' : 'MID';
    if (label !== undefined) s.label = str(label, 40);
    req.section.attendance.sessions.sort((a, b) => a.date.localeCompare(b.date));
    await req.section.save();
    res.json(await sectionDetail(req.section));
  })
);

faculty.delete(
  '/sections/:id/attendance/sessions/:sid',
  ownSection,
  wrap(async (req, res) => {
    const s = req.section.attendance?.sessions.id(req.params.sid);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    s.deleteOne();
    await req.section.save();
    await Enrollment.updateMany({ section: req.section._id }, { $unset: { [`attendance.${req.params.sid}`]: '' } });
    await Notification.deleteMany({ section: req.section._id, kind: `att:${req.params.sid}` });
    audit(req.user, 'attendance.delete', sectionLabel(req.section), `session ${s.date}${s.label ? ` (${s.label})` : ''} and its marks`);
    res.json(await sectionDetail(req.section));
  })
);

// Mark one student (studentId) or the whole session (no studentId). mark: P | L | A | E | null (clear).
faculty.put(
  '/sections/:id/attendance/marks',
  ownSection,
  wrap(async (req, res) => {
    const { sessionId, studentId, mark } = req.body || {};
    const session = req.section.attendance?.sessions.id(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (mark !== null && !MARKS.includes(mark)) return res.status(400).json({ error: 'Invalid mark' });
    const key = `attendance.${sessionId}`;
    const update = mark === null ? { $unset: { [key]: '' } } : { $set: { [key]: mark } };
    if (!studentId) {
      await Enrollment.updateMany({ section: req.section._id }, update);
      const list = await Enrollment.find({ section: req.section._id }, 'student');
      await notifyAttendance(req.section, session, list.map((e) => ({ student: e.student, mark })));
      return res.json(await sectionDetail(req.section));
    }
    const enrollment = await Enrollment.findOneAndUpdate({ section: req.section._id, student: studentId }, update, { new: true });
    if (!enrollment) return res.status(404).json({ error: 'Student not in section' });
    if (mark === null) await Notification.deleteOne({ student: enrollment.student, section: req.section._id, kind: `att:${sessionId}` });
    else await notifyAttendance(req.section, session, [{ student: enrollment.student, mark }]);
    res.json({ grades: computeGrades(req.section, enrollment), attendance: attendanceSummary(req.section, enrollment) });
  })
);

router.use('/faculty', faculty);
router.use('/admin', admin);

// ---------- helpers ----------

const MARK_WORD = { P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' };
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
// Attendance notices for one session: [{ student, mark }]
const notifyAttendance = (section, session, marks) =>
  showOf(section).attendance
    ? notifyStudents(section, marks.filter((m) => m.mark).map(({ student, mark }) => ({ student, kind: `att:${session._id}`, text: `${shortDate(session.date)}${session.label ? ` (${session.label})` : ''} · ${MARK_WORD[mark]}` })))
    : null;

const sectionLabel = (s) => [s.code, s.term, s.academicYear].filter(Boolean).join(' · ');

function sectionSummary(s) {
  return {
    id: s._id,
    code: s.code,
    subjectCode: s.subjectCode,
    subjectTitle: s.subjectTitle,
    schedule: s.schedule?.length ? s.schedule.map(({ day, start, end, room, type, mode }) => ({ day, start, end, room, type: type || '', mode: modeOf({ room, mode }) })) : [],
    day: s.day,
    time: s.time,
    room: s.room,
    units: s.units,
    term: s.term,
    academicYear: s.academicYear,
    gradingMode: s.gradingMode || 'both',
  };
}

function itemDto(i) {
  return { id: i._id, component: i.component, period: i.period, label: i.label, max: i.max };
}

// Attendance items are computed, not stored; "virtual" tells the client they can't be edited or deleted.
function attItemDto(a) {
  return { id: a._id, component: a.component, period: a.period, label: a.label, max: a.max, virtual: 'attendance', sessions: a.sessions };
}

function attendanceDto(section) {
  const att = section.attendance || {};
  return {
    component: att.component || '',
    late: att.late ?? 0.5,
    sessions: (att.sessions || []).map((s) => ({ id: s._id, date: s.date, period: s.period, label: s.label || '' })),
  };
}

// A student's marks plus present/late/absent/excused counts per period.
function attendanceSummary(section, enrollment) {
  const raw = enrollment.attendance;
  const marks = raw instanceof Map ? Object.fromEntries(raw) : { ...(raw || {}) };
  const counts = { P: 0, L: 0, A: 0, E: 0, none: 0 };
  for (const s of section.attendance?.sessions || []) counts[marks[String(s._id)] || 'none']++;
  const items = Object.fromEntries(attendanceItems(section, enrollment).map((a) => [a.period, { score: a.score, max: a.max }]));
  return { marks, counts, items };
}

async function sectionDetail(section) {
  const enrollments = await Enrollment.find({ section: section._id }).populate('student');
  const users = await User.find({ student: { $in: enrollments.map((e) => e.student?._id) }, role: 'student' }, 'student mustChangePassword credentialsSentAt');
  const userBy = Object.fromEntries(users.map((u) => [String(u.student), u]));
  const rows = enrollments
    .filter((e) => e.student)
    .map((e) => ({
      student: {
        id: e.student._id,
        studentNo: e.student.studentNo,
        name: e.student.name,
        course: e.student.course,
        email: e.student.email,
        account: accountStatus(userBy[String(e.student._id)]),
      },
      scores: { ...Object.fromEntries(e.scores), ...Object.fromEntries(attendanceItems(section, e).map((a) => [a._id, a.score])) },
      attendance: attendanceSummary(section, e),
      bonus: e.bonus,
      grades: computeGrades(section, e),
    }))
    .sort((a, b) => a.student.name.localeCompare(b.student.name));
  // Column headers for attendance: the number of sessions in each period (a student's own max can be lower if excused).
  const att = section.attendance;
  const attColumns = att?.component
    ? ['MID', 'POST']
        .map((period) => ({ period, n: (att.sessions || []).filter((s) => s.period === period).length }))
        .filter((c) => c.n)
        .map(({ period, n }) => attItemDto({ _id: `att-${period}`, component: att.component, period, label: 'Attendance', max: n, sessions: n }))
    : [];
  return {
    section: {
      ...sectionSummary(section),
      published: section.published,
      show: showOf(section),
      weights: section.weights,
      attendance: attendanceDto(section),
      gradeScale: scaleOf(section),
      gradeScaleCustom: Boolean(section.gradeScale?.length),
    },
    items: [...section.items.map(itemDto), ...attColumns],
    rows,
  };
}

export default router;
