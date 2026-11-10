// A section meets one or more times a week: [{ day: 'MON', start: '07:00', end: '09:40', room: '1032' }].
export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const MODES = ['F2F', 'ONLINE', 'BLENDED']; // how a class meets, for the faculty loading report
// A room name longer than 4 characters (e.g. "ONLINE", "GMEET", a link) is not a room number: the class is online.
export const isOnlineRoom = (room) => String(room ?? '').trim().length > 4;
export const modeOf = (r) => (isOnlineRoom(r?.room) ? 'ONLINE' : MODES.includes(String(r?.mode || '').toUpperCase()) ? String(r.mode).toUpperCase() : 'F2F');
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function to12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// Validates rows from the client. Returns { rows } or { error }.
export function cleanSchedule(input) {
  if (!Array.isArray(input)) return { rows: [] };
  if (input.length > 10) return { error: 'A section can have at most 10 schedule rows.' };
  const rows = [];
  for (const [i, r] of input.entries()) {
    const day = String(r?.day || '').toUpperCase();
    const start = String(r?.start || '');
    const end = String(r?.end || '');
    const room = String(r?.room ?? '').trim().slice(0, 30);
    const type = ['LEC', 'LAB'].includes(String(r?.type || '').toUpperCase()) ? String(r.type).toUpperCase() : '';
    const mode = modeOf({ room, mode: r?.mode });
    if (!day && !start && !end && !room) continue; // blank row
    const n = `Schedule row ${i + 1}`;
    if (!DAYS.includes(day)) return { error: `${n}: choose a day.` };
    if (!HHMM.test(start) || !HHMM.test(end)) return { error: `${n}: enter a start and an end time.` };
    if (end <= start) return { error: `${n}: the end time must be after the start time.` };
    rows.push({ day, start, end, room, type, mode });
  }
  rows.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start));
  return { rows };
}

// The one-line fields older screens and the Excel import still use ("MON|THU", "7:00 AM - 9:40 AM|…").
export function legacyFields(rows) {
  return {
    day: rows.map((r) => r.day).join('|'),
    time: rows.map((r) => `${to12(r.start)} - ${to12(r.end)}`).join('|'),
    room: [...new Set(rows.map((r) => r.room).filter(Boolean))].join(' / '),
  };
}

// A faculty member's own weekly blocks besides classes (consultation hours, meetings…):
// [{ day: 'TUE', start: '08:00', end: '11:00', label: 'Admin/Consultation Hours', kind: 'work' }].
// kind 'work' counts toward working hours; 'break' (lunch, rest) does not. Returns { rows } or { error }.
export function cleanBlocks(input) {
  if (!Array.isArray(input)) return { error: 'Send a list of blocks.' };
  if (input.length > 40) return { error: 'At most 40 blocks.' };
  const rows = [];
  for (const [i, r] of input.entries()) {
    const day = String(r?.day || '').toUpperCase();
    const start = String(r?.start || '');
    const end = String(r?.end || '');
    const kind = r?.kind === 'break' ? 'break' : 'work';
    const label = String(r?.label ?? '').trim().slice(0, 60) || (kind === 'break' ? 'Break time' : 'Admin/Consultation Hours');
    const n = `Block ${i + 1}`;
    if (!DAYS.includes(day)) return { error: `${n}: choose a day.` };
    if (!HHMM.test(start) || !HHMM.test(end)) return { error: `${n}: enter a start and an end time.` };
    if (end <= start) return { error: `${n}: the end time must be after the start time.` };
    rows.push({ day, start, end, label, kind });
  }
  rows.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start));
  return { rows };
}

// A faculty member's time in / time out. Blocks (admin, consultation, break) must stay inside it.
export const DEFAULT_WORK_HOURS = { start: '07:00', end: '16:00' };
export const HHMM_RE = HHMM;
export const workHoursOf = (user) => ({ ...DEFAULT_WORK_HOURS, ...(user.workHours?.start ? { start: user.workHours.start, end: user.workHours.end } : {}) });

// The first block outside the work hours, as a message; null when all fit.
export function blocksOutside(blocks, hours) {
  const b = blocks.find((x) => x.start < hours.start || x.end > hours.end);
  if (!b) return null;
  return `${b.label || 'A block'} on ${b.day} (${to12(b.start)} – ${to12(b.end)}) is outside your work hours (${to12(hours.start)} – ${to12(hours.end)}).`;
}
