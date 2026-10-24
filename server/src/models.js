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
      new Schema({ day: String, start: String, end: String, room: String }, { _id: false }),
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
