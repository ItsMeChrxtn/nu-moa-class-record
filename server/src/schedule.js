// A section meets one or more times a week: [{ day: 'MON', start: '07:00', end: '09:40', room: '1032' }].
export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
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
    if (!day && !start && !end && !room) continue; // blank row
    const n = `Schedule row ${i + 1}`;
    if (!DAYS.includes(day)) return { error: `${n}: choose a day.` };
    if (!HHMM.test(start) || !HHMM.test(end)) return { error: `${n}: enter a start and an end time.` };
    if (end <= start) return { error: `${n}: the end time must be after the start time.` };
    rows.push({ day, start, end, room });
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
// [{ day: 'TUE', start: '08:00', end: '11:00', label: 'Admin/Consultation Hours' }]. Returns { rows } or { error }.
export function cleanBlocks(input) {
  if (!Array.isArray(input)) return { error: 'Send a list of blocks.' };
  if (input.length > 40) return { error: 'At most 40 blocks.' };
  const rows = [];
  for (const [i, r] of input.entries()) {
    const day = String(r?.day || '').toUpperCase();
    const start = String(r?.start || '');
    const end = String(r?.end || '');
    const label = String(r?.label ?? '').trim().slice(0, 60) || 'Admin/Consultation Hours';
    const n = `Block ${i + 1}`;
    if (!DAYS.includes(day)) return { error: `${n}: choose a day.` };
    if (!HHMM.test(start) || !HHMM.test(end)) return { error: `${n}: enter a start and an end time.` };
    if (end <= start) return { error: `${n}: the end time must be after the start time.` };
    rows.push({ day, start, end, label });
  }
  rows.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start));
  return { rows };
}
