export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const COMPONENTS = [
  { key: 'CP', name: 'Class Participation' },
  { key: 'EA', name: 'Enabling Activities' },
  { key: 'MPT', name: 'Midterm Performance Task' },
  { key: 'CPT', name: 'Culminating Performance Task' },
];

export const PERIODS = { MID: 'Midterms (Wk 1–7)', POST: 'Finals (Wk 8–13)' };
// Which components belong to each term: MPT is a midterm task, CPT a finals task.
export const TERM_COMPONENTS = { MID: ['CP', 'EA', 'MPT'], POST: ['CP', 'EA', 'CPT'] };
export const termOf = (item) => (item.component === 'MPT' ? 'MID' : item.component === 'CPT' ? 'POST' : item.period === 'POST' ? 'POST' : 'MID');

// Display order: CP mid, CP post, EA mid, EA post, MPT, CPT.
export function sortItems(items) {
  const order = (i) => COMPONENTS.findIndex((c) => c.key === i.component) * 2 + (i.period === 'POST' ? 1 : 0);
  return items.map((it, idx) => ({ it, idx })).sort((a, b) => order(a.it) - order(b.it) || a.idx - b.idx).map((x) => x.it);
}

// Consecutive items with the same component+period, for grouped table headers.
export function groupItems(items) {
  const groups = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    const usesPeriod = it.component === 'CP' || it.component === 'EA';
    const key = usesPeriod ? `${it.component}-${it.period}` : it.component;
    if (last && last.key === key) last.items.push(it);
    else groups.push({ key, component: it.component, period: usesPeriod ? it.period : null, items: [it] });
  }
  return groups;
}

export const fmt = (n) => (n == null ? '—' : Number(n).toFixed(2));

export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// '15:00' -> '3:00 PM'
export function to12(hhmm) {
  if (!/^\d{2}:\d{2}$/.test(hhmm || '')) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// Class hours without AM/PM: 7–11 are mornings, 12 is noon, 1–6 are afternoons.
const guess24 = (h) => (h >= 7 && h <= 11 ? h : h === 12 ? 12 : h + 12);
const pad = (n) => String(n).padStart(2, '0');

// "3:00 - 6:30 PM" / "03:00PM - 06:20PM" / "7:00 - 9:40" -> { start: '15:00', end: '18:30' }
export function parseTimeRange(s) {
  const m = String(s || '').match(/(\d{1,2})(?::(\d{2}))?\s*([AP]\.?M\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([AP]\.?M\.?)?/i);
  if (!m) return null;
  const [, h1, m1 = '00', p1, h2, m2 = '00', p2] = m;
  const to24 = (h, p) => (Number(h) % 12) + (/p/i.test(p) ? 12 : 0);
  const end = p2 ? to24(h2, p2) : guess24(Number(h2));
  let start = p1 ? to24(h1, p1) : p2 ? to24(h1, p2) : guess24(Number(h1));
  // "11:00 - 1:00 PM": the start is in the morning when the end's half-day would put it after the end.
  if (!p1 && start * 60 + Number(m1) > end * 60 + Number(m2) && start >= 12) start -= 12;
  return { start: `${pad(start)}:${m1}`, end: `${pad(end)}:${m2}` };
}

const DAY_GROUPS = { MWF: ['MON', 'WED', 'FRI'], MW: ['MON', 'WED'], TTH: ['TUE', 'THU'], TF: ['TUE', 'FRI'], TH: ['THU'] };
export function normalizeDay(d) {
  const u = String(d || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (DAY_GROUPS[u]) return DAY_GROUPS[u];
  const day = DAYS.find((x) => u.startsWith(x));
  return day ? [day] : [];
}

// One-line day/time/room (from a PDF or an older section) -> schedule rows.
export function rowsFromText({ day, time, room }) {
  const split = (s, sep = '|') => String(s || '').split(sep).map((x) => x.trim()).filter(Boolean);
  const days = split(day).flatMap(normalizeDay);
  const times = split(time).map(parseTimeRange);
  const rooms = String(room || '').split(/\s*[|/]\s*/).filter(Boolean);
  const n = Math.max(days.length, times.length);
  return Array.from({ length: n }, (_, i) => {
    const t = times[i] ?? times[times.length - 1];
    return { day: days[i] ?? days[days.length - 1] ?? '', start: t?.start || '', end: t?.end || '', room: rooms[i] ?? rooms[0] ?? '' };
  });
}

// Rows for display: [{ day: 'WED', time: '7:00 AM – 9:40 AM', room: '1032' }]
export function schedule(section) {
  if (section.schedule?.length)
    return section.schedule.map((r) => ({ day: r.day, time: `${to12(r.start)} – ${to12(r.end)}`, room: r.room || '' }));
  // Older sections: one-line fields, e.g. "WED|FRI" + "3:00 - 7:00 |3:00 - 5:40".
  const split = (s) => String(s || '').split('|').map((x) => x.trim()).filter(Boolean);
  const days = split(section.day);
  const times = split(section.time);
  const n = Math.max(days.length, times.length);
  return Array.from({ length: n }, (_, i) => ({
    day: days[i] ?? days[days.length - 1] ?? '',
    time: times[i] ?? times[times.length - 1] ?? '',
    room: i === 0 ? section.room || '' : '',
  }));
}
