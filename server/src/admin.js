import express from 'express';
import mongoose from 'mongoose';
import { User, Student, Section, Enrollment, AuditLog, audit } from './models.js';
import { hashPassword, requireAuth, requirePasswordSet, requireRole, tempPassword } from './auth.js';
import { saveCredentials } from './credentials.js';
import { mailConfigured, sendFacultyCredentials } from './mailer.js';

// Admin: manages faculty accounts and can see (not edit grades of) every section and student.
const admin = express.Router();
admin.use(requireAuth, requirePasswordSet, requireRole('admin'));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max = 120) => String(v ?? '').trim().slice(0, max);
// Faculty sign in with their email (any provider, e.g. Gmail), which is stored as their username.
export const FACULTY_EMAIL = /^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const EMAIL_ERROR = 'Enter the faculty member’s email address (e.g. juan.delacruz@gmail.com).';
const email = (v) => str(v, 100).toLowerCase();
const sectionLabel = (s) => [s.code, s.term, s.academicYear].filter(Boolean).join(' · ');
const mailNote = (m) => (m.sent ? 'sign-in details emailed' : m.configured ? `email failed: ${m.error}` : undefined);

const userDto = (u) => ({
  id: u._id,
  username: u.username,
  email: FACULTY_EMAIL.test(u.username) ? u.username : null, // older accounts may still have a plain username
  name: u.name,
  disabled: !!u.disabled,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt || null,
  createdAt: u.createdAt,
});

async function findFaculty(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' }), null;
  const user = await User.findOne({ _id: req.params.id, role: 'faculty' });
  if (!user) res.status(404).json({ error: 'Faculty not found' });
  return user;
}

admin.get(
  '/overview',
  wrap(async (req, res) => {
    const [faculty, disabled, sections, published, students, enrollments, accounts, activeAccounts] = await Promise.all([
      User.countDocuments({ role: 'faculty' }),
      User.countDocuments({ role: 'faculty', disabled: true }),
      Section.countDocuments(),
      Section.countDocuments({ published: true }),
      Student.countDocuments(),
      Enrollment.countDocuments(),
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'student', mustChangePassword: false }), // signed in and set their own password
    ]);
    res.json({ faculty, disabled, sections, published, students, enrollments, accounts, activeAccounts, mailConfigured: mailConfigured() });
  })
);

// ---------- Faculty ----------

admin.get(
  '/faculty',
  wrap(async (req, res) => {
    const users = await User.find({ role: 'faculty' }).sort({ name: 1 });
    const sections = await Section.find({}, 'faculty');
    const counts = await Enrollment.aggregate([{ $group: { _id: '$section', n: { $sum: 1 } } }]);
    const bySection = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    const stats = {};
    for (const s of sections) {
      const k = String(s.faculty);
      stats[k] ||= { sections: 0, students: 0 };
      stats[k].sections++;
      stats[k].students += bySection[String(s._id)] || 0;
    }
    res.json({ faculty: users.map((u) => ({ ...userDto(u), ...(stats[String(u._id)] || { sections: 0, students: 0 }) })) });
  })
);

admin.post(
  '/faculty',
  wrap(async (req, res) => {
    const username = email(req.body?.email);
    const name = str(req.body?.name).toUpperCase();
    if (!name) return res.status(400).json({ error: 'Enter the faculty member’s full name.' });
    if (!FACULTY_EMAIL.test(username)) return res.status(400).json({ error: EMAIL_ERROR });
    if (await User.exists({ username })) return res.status(409).json({ error: `${username} already has an account.` });
    const pw = tempPassword();
    const user = await User.create({ username, name, role: 'faculty', passwordHash: await hashPassword(pw) });
    saveCredentials('FACULTY', [{ username, name, tempPassword: pw }]);
    const mail = await sendFacultyCredentials({ email: username, name, tempPassword: pw });
    audit(req.user, 'faculty.create', `${name} (${username})`, mailNote(mail));
    res.status(201).json({ faculty: { ...userDto(user), sections: 0, students: 0 }, tempPassword: pw, mail });
  })
);

admin.patch(
  '/faculty/:id',
  wrap(async (req, res) => {
    const user = await findFaculty(req, res);
    if (!user) return;
    const b = req.body || {};
    const changes = [];
    if (b.name !== undefined) {
      const name = str(b.name).toUpperCase();
      if (!name) return res.status(400).json({ error: 'Name cannot be empty.' });
      if (name !== user.name) changes.push(`name → ${name}`), (user.name = name);
    }
    if (b.email !== undefined) {
      const username = email(b.email);
      if (!FACULTY_EMAIL.test(username)) return res.status(400).json({ error: EMAIL_ERROR });
      if (username !== user.username) {
        if (await User.exists({ username })) return res.status(409).json({ error: `${username} already has an account.` });
        changes.push(`sign-in ${user.username} → ${username}`);
        user.username = username;
      }
    }
    if (typeof b.disabled === 'boolean' && b.disabled !== !!user.disabled) {
      user.disabled = b.disabled;
      audit(req.user, b.disabled ? 'faculty.disable' : 'faculty.enable', `${user.name} (${user.username})`);
    }
    await user.save();
    if (changes.length) audit(req.user, 'faculty.update', `${user.name} (${user.username})`, changes.join('; '));
    res.json({ faculty: userDto(user) });
  })
);

admin.post(
  '/faculty/:id/reset-password',
  wrap(async (req, res) => {
    const user = await findFaculty(req, res);
    if (!user) return;
    const pw = tempPassword();
    user.passwordHash = await hashPassword(pw);
    user.mustChangePassword = true;
    await user.save();
    saveCredentials('FACULTY', [{ username: user.username, name: user.name, tempPassword: pw }]);
    // Older accounts without an email can't be emailed; the admin shares the password instead.
    const mail = FACULTY_EMAIL.test(user.username)
      ? await sendFacultyCredentials({ email: user.username, name: user.name, tempPassword: pw, reset: true })
      : { sent: false, configured: mailConfigured(), error: 'This account has no email yet.' };
    audit(req.user, 'faculty.reset-password', `${user.name} (${user.username})`, mailNote(mail));
    res.json({ username: user.username, tempPassword: pw, mail });
  })
);

// Only faculty without sections can be deleted; otherwise move their sections or disable the account.
admin.delete(
  '/faculty/:id',
  wrap(async (req, res) => {
    const user = await findFaculty(req, res);
    if (!user) return;
    const n = await Section.countDocuments({ faculty: user._id });
    if (n) return res.status(409).json({ error: `${user.name} still owns ${n} section${n === 1 ? '' : 's'}. Move them to another faculty first, or disable the account instead.` });
    await user.deleteOne();
    audit(req.user, 'faculty.delete', `${user.name} (${user.username})`);
    res.json({ ok: true });
  })
);

// ---------- Sections ----------

admin.get(
  '/sections',
  wrap(async (req, res) => {
    const sections = await Section.find().populate('faculty', 'name username').sort({ academicYear: -1, term: 1, code: 1 });
    const counts = await Enrollment.aggregate([{ $group: { _id: '$section', n: { $sum: 1 } } }]);
    const bySection = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    res.json({
      sections: sections.map((s) => ({
        id: s._id,
        code: s.code,
        subjectCode: s.subjectCode,
        subjectTitle: s.subjectTitle,
        term: s.term,
        academicYear: s.academicYear,
        published: s.published,
        itemCount: s.items.length,
        studentCount: bySection[String(s._id)] || 0,
        faculty: s.faculty ? { id: s.faculty._id, name: s.faculty.name, username: s.faculty.username } : null,
      })),
    });
  })
);

// Move a section (with its students and scores) to another faculty member.
admin.patch(
  '/sections/:id',
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.body?.faculty))
      return res.status(400).json({ error: 'Choose a faculty member.' });
    const section = await Section.findById(req.params.id).populate('faculty', 'name username');
    const to = await User.findOne({ _id: req.body.faculty, role: 'faculty' });
    if (!section || !to) return res.status(404).json({ error: 'Not found' });
    const from = section.faculty;
    section.faculty = to._id;
    await section.save();
    audit(req.user, 'section.reassign', sectionLabel(section), `${from?.name || 'unknown'} → ${to.name}`);
    res.json({ ok: true, faculty: { id: to._id, name: to.name, username: to.username } });
  })
);

// ---------- Students ----------

admin.get(
  '/students',
  wrap(async (req, res) => {
    const q = str(req.query.q, 60);
    const re = q && new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const filter = re ? { $or: [{ name: re }, { studentNo: re }, { email: re }] } : {};
    const students = await Student.find(filter).sort({ name: 1 }).limit(50);
    const ids = students.map((s) => s._id);
    const [users, enrollments] = await Promise.all([
      User.find({ student: { $in: ids } }),
      Enrollment.find({ student: { $in: ids } }).populate('section', 'code'),
    ]);
    const userBy = Object.fromEntries(users.map((u) => [String(u.student), u]));
    const sectionsBy = {};
    for (const e of enrollments) (sectionsBy[String(e.student)] ||= []).push(e.section?.code);
    res.json({
      total: await Student.countDocuments(filter),
      students: students.map((s) => {
        const u = userBy[String(s._id)];
        return {
          id: s._id,
          studentNo: s.studentNo,
          name: s.name,
          course: s.course,
          email: s.email || null,
          sections: (sectionsBy[String(s._id)] || []).filter(Boolean).sort(),
          account: u ? { mustChangePassword: u.mustChangePassword, lastLoginAt: u.lastLoginAt || null, disabled: !!u.disabled } : null,
        };
      }),
    });
  })
);

admin.post(
  '/students/:id/reset-password',
  wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const user = await User.findOne({ student: req.params.id, role: 'student' });
    if (!user) return res.status(404).json({ error: 'This student has no account.' });
    const pw = tempPassword();
    user.passwordHash = await hashPassword(pw);
    user.mustChangePassword = true;
    user.accountBy = req.user._id;
    await user.save();
    audit(req.user, 'student.reset-password', `${user.name} (${user.username})`);
    res.json({ username: user.username, tempPassword: pw });
  })
);

// ---------- Activity ----------

admin.get(
  '/activity',
  wrap(async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 200);
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(limit);
    res.json({
      activity: logs.map((l) => ({
        id: l._id,
        at: l.createdAt,
        actor: l.actorName,
        role: l.actorRole,
        action: l.action,
        target: l.target,
        detail: l.detail,
      })),
    });
  })
);

export default admin;
