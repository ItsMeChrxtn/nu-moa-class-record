import mongoose from 'mongoose';
import { COMPONENTS, DEFAULT_WEIGHTS } from './grading.js';

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'faculty', 'student'], required: true },
    name: { type: String, required: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student' },
    mustChangePassword: { type: Boolean, default: true },
    disabled: { type: Boolean, default: false }, // set by an admin; blocks sign-in
    lastLoginAt: Date,
    credentialsSentAt: Date, // when the current temporary password was emailed
    // Faculty: weekly blocks besides classes, shown on the weekly schedule.
    // Faculty: time in / time out (HH:MM); admin, consultation and break blocks must fall inside. Default 7:00–16:00.
    workHours: { start: String, end: String },
    // Faculty: details printed on the Faculty Loading Report (entered once, reused every export).
    loadingReport: {
      employeeId: String,
      classification: String,
      department: String,
      checkedBy: String,
      checkedByTitle: String,
      endorsedBy: String,
      endorsedByTitle: String,
      approvedBy: String,
      approvedByTitle: String,
    },
    // kind: 'work' (counted in working hours) or 'break' (not counted).
    scheduleBlocks: [new Schema({ day: String, start: String, end: String, label: String, kind: { type: String, default: 'work' } }, { _id: false })],
  },
  { timestamps: true }
);

// Who did what: destructive faculty actions and every admin change.
const auditSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    actorRole: String,
    action: { type: String, required: true }, // e.g. section.delete
    target: String, // human-readable, e.g. "INF232 · First Term 2026-2027"
    detail: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
auditSchema.index({ createdAt: -1 });

const studentSchema = new Schema(
  {
    studentNo: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true },
    course: String,
    email: { type: String, lowercase: true, trim: true }, // from the class list PDF, when it has one
  },
  { timestamps: true }
);

const itemSchema = new Schema({
  component: { type: String, enum: [...COMPONENTS], required: true },
  period: { type: String, enum: ['MID', 'POST'], default: 'MID' },
  label: { type: String, required: true, trim: true },
  max: { type: Number, required: true, min: 1 },
});

const sectionSchema = new Schema(
  {
    code: { type: String, required: true }, // e.g. INF232
    subjectCode: String,
    subjectTitle: String,
    // Structured schedule; day/time/room below are kept in sync as one-line summaries.
    schedule: [
      // type: LEC | LAB | ''; mode: F2F | ONLINE | BLENDED (both for the faculty loading report)
      new Schema({ day: String, start: String, end: String, room: String, type: String, mode: String }, { _id: false }),
    ],
    day: String,
    time: String,
    room: String,
    units: Number,
    term: String,
    academicYear: String,
    department: String,
    faculty: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    weights: {
      midterm: { CP: Number, EA: Number, MPT: Number },
      final: { CP: Number, EA: Number, MPT: Number, CPT: Number },
    },
    items: [itemSchema],
    // Custom grade point equivalence ({ min: 95.5, eq: '4.0' }, …); empty = NU default.
    gradeScale: [new Schema({ min: Number, eq: String }, { _id: false })],
    // Attendance: each period's sessions count as one item inside CP or EA (or are not graded).
    attendance: {
      component: { type: String, enum: ['CP', 'EA', ''], default: '' },
      late: { type: Number, default: 0.5, min: 0, max: 1 }, // points for "late"; present = 1, absent = 0
      sessions: [
        new Schema({
          date: { type: String, required: true }, // YYYY-MM-DD
          period: { type: String, enum: ['MID', 'POST'], default: 'MID' },
          label: { type: String, trim: true },
        }),
      ],
    },
    published: { type: Boolean, default: false },
  },
  { timestamps: true }
);
sectionSchema.index({ code: 1, term: 1, academicYear: 1 }, { unique: true });
sectionSchema.pre('validate', function () {
  if (!this.weights?.midterm?.CP && this.weights?.midterm?.CP !== 0) this.weights = DEFAULT_WEIGHTS;
});

const enrollmentSchema = new Schema(
  {
    section: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    scores: { type: Map, of: Number, default: {} }, // itemId -> score
    attendance: { type: Map, of: String, default: {} }, // sessionId -> P | L | A | E
    bonus: { type: Number, default: 0 },
  },
  { timestamps: true }
);
enrollmentSchema.index({ section: 1, student: 1 }, { unique: true });

export const User = model('User', userSchema);
export const Student = model('Student', studentSchema);
export const Section = model('Section', sectionSchema);
export const Enrollment = model('Enrollment', enrollmentSchema);
export const AuditLog = model('AuditLog', auditSchema);

// A student's notice that a section's midterm or final grades can now be seen. One per student,
// section and kind, so publishing again (or adding more items) never repeats it.
const notificationSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    section: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
    kind: { type: String, enum: ['midterm', 'final'], required: true },
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
notificationSchema.index({ student: 1, section: 1, kind: 1 }, { unique: true });
notificationSchema.index({ student: 1, createdAt: -1 });
export const Notification = model('Notification', notificationSchema);

// Tell every student in a published section which grades they can now see: the midterm once the
// section has midterm items, the final once it has finals items (MPT counts as midterms, CPT as finals).
export async function notifyGrades(section) {
  if (!section.published) return 0;
  const items = section.items || [];
  const finals = items.some((i) => i.component === 'CPT' || (i.component !== 'MPT' && i.period === 'POST'));
  const midterm = items.some((i) => !(i.component === 'CPT' || (i.component !== 'MPT' && i.period === 'POST')));
  const kinds = [midterm && 'midterm', finals && 'final'].filter(Boolean);
  if (!kinds.length) return 0;
  const enrollments = await Enrollment.find({ section: section._id }, 'student');
  const docs = enrollments.flatMap((e) => kinds.map((kind) => ({ student: e.student, section: section._id, kind })));
  if (!docs.length) return 0;
  try {
    const r = await Notification.insertMany(docs, { ordered: false });
    return r.length;
  } catch (e) {
    // Duplicates (already notified) are expected; anything else is logged.
    if (e.code !== 11000 && !e.writeErrors) console.error('notify failed:', e.message);
    return e.insertedDocs?.length || 0;
  }
}

export function audit(user, action, target, detail) {
  return AuditLog.create({
    actor: user?._id,
    actorName: user?.name,
    actorRole: user?.role,
    action,
    target,
    detail,
  }).catch((e) => console.error('audit log failed:', e.message));
}
