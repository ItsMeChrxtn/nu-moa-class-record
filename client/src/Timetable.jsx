import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile, meetingsOn, to12 } from './api.js';
import { Icon, Modal, TimeInput, titleCase, useUI } from './ui.jsx';

const WEEK = [
  ['MON', 'Monday'],
  ['TUE', 'Tuesday'],
  ['WED', 'Wednesday'],
  ['THU', 'Thursday'],
  ['FRI', 'Friday'],
  ['SAT', 'Saturday'],
];
const SLOT = 30; // minutes per grid row
const ROW = 28; // px per grid row
const PALETTE = 6; // .sc-0 … .sc-5 in styles.css
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const label12 = (m) => to12(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`).replace(':00 ', ' ');

// Each section keeps the same colour everywhere (cards, today's classes, timetable).
export function sectionColors(sections) {
  const ids = [...sections].sort((a, b) => a.code.localeCompare(b.code)).map((s) => s.id);
  return new Map(ids.map((id, i) => [id, i % PALETTE]));
}

// Side-by-side lanes for blocks that overlap on the same day.
function layOut(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const b of cluster) {
      let lane = lanes.findIndex((end) => end <= b.start);
      if (lane < 0) lane = lanes.push(0) - 1;
      lanes[lane] = b.end;
      b.lane = lane;
    }
    for (const b of cluster) out.push({ ...b, lanes: lanes.length });
    cluster = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd && cluster.length) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return out;
}

const WEEK_HOURS = 40; // full-time load per week
const fmtH = (h) => `${Math.round(h * 100) / 100}`;

export const DEFAULT_WORK_HOURS = { start: '07:00', end: '16:00' };

export default function Timetable({ sections, blocks, onBlocksChange, termLabel, onExport, workHours = DEFAULT_WORK_HOURS, onWorkHoursChange }) {
  const [editingHours, setEditingHours] = useState(false);
  const { toast, confirm } = useUI();
  const [editing, setEditing] = useState(null); // { index } or { index: -1, kind } for a new block
  const colors = useMemo(() => sectionColors(sections), [sections]);

  const byDay = useMemo(() => {
    const map = Object.fromEntries(WEEK.map(([d]) => [d, []]));
    for (const s of sections)
      for (const [d] of WEEK)
        for (const m of meetingsOn(s, d))
          if (m.start && m.end) map[d].push({ kind: 'class', s, start: toMin(m.start), end: toMin(m.end), room: m.room, time: m.time });
    blocks.forEach((b, index) => {
      if (map[b.day]) map[b.day].push({ kind: 'block', b, index, start: toMin(b.start), end: toMin(b.end), time: `${to12(b.start)} – ${to12(b.end)}` });
    });
    return Object.fromEntries(Object.entries(map).map(([d, list]) => [d, layOut(list)]));
  }, [sections, blocks]);

  const all = Object.values(byDay).flat();
  // At least 7:00 AM – 6:00 PM, stretched to fit every block, plus an hour on each side of the work
  // hours so the time before time-in and after time-out shows (shaded).
  const first = Math.max(0, Math.min(7 * 60, Math.floor(toMin(workHours.start) / 60) * 60 - 60, ...all.map((b) => Math.floor(b.start / 60) * 60)));
  const last = Math.min(24 * 60, Math.max(18 * 60, Math.ceil(toMin(workHours.end) / 60) * 60 + 60, ...all.map((b) => Math.ceil(b.end / 60) * 60)));
  const rows = (last - first) / SLOT;
  const span = (list) => list.reduce((h, b) => h + (b.end - b.start) / 60, 0);
  // Working hours = classes + admin/consultation blocks; break time is shown but never counted.
  const classHours = span(all.filter((b) => b.kind === 'class'));
  const adminHours = span(all.filter((b) => b.kind === 'block' && b.b.kind !== 'break'));
  const breakHours = span(all.filter((b) => b.kind === 'block' && b.b.kind === 'break'));
  const total = classHours + adminHours;
  const today = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date().getDay()];

  async function save(next, message) {
    try {
      const d = await api('/faculty/schedule-blocks', { method: 'PUT', body: { blocks: next } });
      onBlocksChange(d.blocks);
      toast(message);
      return true;
    } catch (e) {
      toast(e.message, 'error');
      return false;
    }
  }

  return (
    <section className="card timetable-card">
      <div className="timetable-head">
        <div>
          <span className="stat-label">Weekly schedule{termLabel ? ` · ${termLabel}` : ''}</span>
          <h2>
            {sections.length} section{sections.length === 1 ? '' : 's'} · {fmtH(classHours)} class hours a week
          </h2>
        </div>
        <div className="timetable-actions">
          <button className="btn" onClick={() => setEditing({ index: -1, kind: 'work' })}>
            <Icon name="plus" size={16} /> Admin / consultation
          </button>
          <button className="btn" onClick={() => setEditing({ index: -1, kind: 'break' })}>
            <Icon name="plus" size={16} /> Break time
          </button>
          {onExport && (
            <button className="btn primary" onClick={onExport}>
              <Icon name="download" size={16} /> Schedule files
            </button>
          )}
        </div>
      </div>

      <div className={`work-hours ${total > WEEK_HOURS ? 'over' : total >= WEEK_HOURS ? 'full' : ''}`}>
        <div className="work-hours-top">
          <span className="stat-label">Total working hours</span>
          <strong>{fmtH(total)}<small> / {WEEK_HOURS} hrs a week</small></strong>
          <span className="work-hours-note">
            {total < WEEK_HOURS ? `${fmtH(WEEK_HOURS - total)} hrs short of ${WEEK_HOURS}` : total > WEEK_HOURS ? `${fmtH(total - WEEK_HOURS)} hrs over ${WEEK_HOURS}` : `Exactly ${WEEK_HOURS} hrs`}
          </span>
        </div>
        <div className="work-bar" aria-hidden="true">
          <span className="wb-class" style={{ width: `${Math.min(100, (classHours / Math.max(WEEK_HOURS, total)) * 100)}%` }} />
          <span className="wb-work" style={{ width: `${Math.min(100, (adminHours / Math.max(WEEK_HOURS, total)) * 100)}%` }} />
        </div>
        <ul className="work-legend">
          <li className="work-in-out">
            <Icon name="clock" size={14} /> Work hours <strong>{to12(workHours.start)} – {to12(workHours.end)}</strong>
            {onWorkHoursChange && (
              <button type="button" className="link-btn" onClick={() => setEditingHours(true)}>Change</button>
            )}
          </li>
          <li><i className="wb-class" />Classes <strong>{fmtH(classHours)} h</strong></li>
          <li><i className="wb-work" />Admin / consultation <strong>{fmtH(adminHours)} h</strong></li>
          <li><i className="wb-break" />Break time <strong>{fmtH(breakHours)} h</strong> <small>not counted</small></li>
        </ul>
      </div>

      <div className="timetable-scroll">
        <div className="timetable" style={{ '--rows': rows, '--row': `${ROW}px` }}>
          <div className="tt-corner" />
          {WEEK.map(([d, name]) => (
            <div key={d} className={`tt-day-head ${d === today ? 'is-today' : ''}`}>
              <span className="tt-day-long">{name}</span>
              <span className="tt-day-short">{d}</span>
            </div>
          ))}
          <div className="tt-times">
            {Array.from({ length: rows }, (_, i) => (
              <span key={i} className={(first + i * SLOT) % 60 === 0 ? 'hour' : ''}>{label12(first + i * SLOT)}</span>
            ))}
          </div>
          {WEEK.map(([d]) => (
            <div key={d} className={`tt-col ${d === today ? 'is-today' : ''}`}>
              {toMin(workHours.start) > first && <span className="tt-off" style={{ top: 0, height: ((toMin(workHours.start) - first) / SLOT) * ROW }} title="Before your time in" />}
              {toMin(workHours.end) < last && <span className="tt-off" style={{ top: ((toMin(workHours.end) - first) / SLOT) * ROW, bottom: 0 }} title="After your time out" />}
              {byDay[d].map((b, i) => {
                const style = {
                  top: ((b.start - first) / SLOT) * ROW,
                  height: Math.max(((b.end - b.start) / SLOT) * ROW - 3, 22),
                  left: `calc(${(b.lane / b.lanes) * 100}% + 3px)`,
                  width: `calc(${100 / b.lanes}% - 6px)`,
                };
                const short = b.end - b.start <= 60;
                return b.kind === 'class' ? (
                  <Link key={i} to={`/faculty/sections/${b.s.id}`} className={`tt-block sc-${colors.get(b.s.id)} ${short ? 'short' : ''}`} style={style} title={`${b.s.code} · ${b.s.subjectTitle || ''}\n${b.time}${b.room ? ` · Rm ${b.room}` : ''}`}>
                    <strong>{b.s.subjectCode ? `${b.s.subjectCode} · ` : ''}{b.s.code}</strong>
                    {!short && <span className="tt-subject">{titleCase(b.s.subjectTitle || '')}</span>}
                    <span className="tt-time">{b.time}{b.room ? ` · ${b.room}` : ''}</span>
                  </Link>
                ) : (
                  <button key={i} type="button" className={`tt-block ${b.b.kind === 'break' ? 'tt-break' : 'tt-other'} ${short ? 'short' : ''}`} style={style} onClick={() => setEditing({ index: b.index })} title="Edit this block">
                    <strong>{b.b.label}</strong>
                    <span className="tt-time">{b.time}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <BlockModal
          block={editing.index >= 0 ? blocks[editing.index] : null}
          kind={editing.kind}
          workHours={workHours}
          onClose={() => setEditing(null)}
          onSave={async (list) => {
            // Editing replaces this block with the first chosen day; any other days are added as copies.
            const kept = editing.index >= 0 ? blocks.filter((_, i) => i !== editing.index) : blocks;
            const same = (a, b) => a.day === b.day && a.start === b.start && a.end === b.end && (a.kind || 'work') === (b.kind || 'work');
            const added = list.filter((b) => !kept.some((x) => same(x, b))); // skip exact duplicates
            const next = editing.index >= 0 ? [...blocks.slice(0, editing.index), ...added, ...blocks.slice(editing.index + 1)] : [...blocks, ...added];
            const what = list[0].kind === 'break' ? 'Break time' : 'Admin / consultation hours';
            const msg = editing.index >= 0 ? (added.length > 1 ? `Block updated and copied to ${added.length - 1} more day${added.length > 2 ? 's' : ''}` : 'Block updated') : `${what} added${added.length > 1 ? ` on ${added.length} days` : ''}`;
            if (!added.length) {
              toast('Those days already have this exact block.', 'error');
              return;
            }
            if (await save(next, msg)) setEditing(null);
          }}
          onDelete={
            editing.index >= 0
              ? async () => {
                  const ok = await confirm({ title: 'Remove this block?', message: `${blocks[editing.index].label} will be removed from your weekly schedule.`, confirmLabel: 'Remove', danger: true });
                  if (ok && (await save(blocks.filter((_, i) => i !== editing.index), 'Removed from your schedule'))) setEditing(null);
                }
              : null
          }
        />
      )}
      {editingHours && (
        <WorkHoursModal
          workHours={workHours}
          onClose={() => setEditingHours(false)}
          onSave={async (wh) => {
            try {
              const d = await api('/faculty/work-hours', { method: 'PUT', body: wh });
              onWorkHoursChange(d.workHours);
              toast(`Work hours set to ${to12(wh.start)} – ${to12(wh.end)}`);
              setEditingHours(false);
            } catch (e) {
              toast(e.message, 'error');
            }
          }}
        />
      )}
    </section>
  );
}

function WorkHoursModal({ workHours, onSave, onClose }) {
  const [form, setForm] = useState(workHours);
  const [busy, setBusy] = useState(false);
  const bad = !form.start || !form.end || form.end <= form.start;
  return (
    <Modal
      title="Work hours"
      subtitle="Your time in and time out. Admin, consultation and break blocks can only be set inside these hours."
      icon="clock"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={busy || bad}
            onClick={async () => {
              setBusy(true);
              await onSave(form);
              setBusy(false);
            }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="row-2">
          <div className="field">
            <span className="field-label">Time in</span>
            <TimeInput value={form.start} onChange={(v) => setForm({ ...form, start: v })} label="Time in" />
          </div>
          <div className="field">
            <span className="field-label">Time out</span>
            <TimeInput value={form.end} onChange={(v) => setForm({ ...form, end: v })} label="Time out" />
          </div>
        </div>
        {bad && <div className="alert error"><Icon name="alert" />Time out must be after time in.</div>}
      </div>
    </Modal>
  );
}

const DEFAULT_LABEL = { work: 'Admin/Consultation Hours', break: 'Break time' };
const DAY_PRESETS = [
  ['Mon–Fri', ['MON', 'TUE', 'WED', 'THU', 'FRI']],
  ['Mon–Sat', ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']],
  ['MWF', ['MON', 'WED', 'FRI']],
  ['TTh', ['TUE', 'THU']],
  ['Clear', []],
];

// New blocks start inside the work hours: a break at noon, admin hours from time in (two hours).
const clampTime = (t, wh) => (t < wh.start ? wh.start : t > wh.end ? wh.end : t);
const addHours = (t, h) => `${String(Math.min(23, Number(t.slice(0, 2)) + h)).padStart(2, '0')}${t.slice(2)}`;

function BlockModal({ block, kind = 'work', workHours = DEFAULT_WORK_HOURS, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => {
    if (block) return { kind: 'work', ...block };
    const start = clampTime(kind === 'break' ? '12:00' : workHours.start, workHours);
    return { kind, label: DEFAULT_LABEL[kind], day: 'MON', start, end: clampTime(addHours(start, kind === 'break' ? 1 : 2), workHours) };
  });
  // Switching the type also switches a default label, but keeps one the faculty typed.
  const setKind = (k) => setForm({ ...form, kind: k, label: !form.label || Object.values(DEFAULT_LABEL).includes(form.label) ? DEFAULT_LABEL[k] : form.label });
  // One block per chosen day, all with the same time and label.
  const [days, setDays] = useState(() => [block?.day || 'MON']);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const outside = form.start && form.end && (form.start < workHours.start || form.end > workHours.end);
  const bad = !form.start || !form.end || form.end <= form.start || outside;
  const ordered = WEEK.map(([d]) => d).filter((d) => days.includes(d));
  return (
    <Modal
      title={block ? 'Edit time block' : form.kind === 'break' ? 'Add break time' : 'Add admin / consultation hours'}
      subtitle="Admin and consultation hours count toward your working hours; break time is shown but not counted. Only you see these."
      icon="calendar"
      onClose={onClose}
      width={480}
      footer={
        <>
          {onDelete && (
            <button type="button" className="btn danger-ghost" style={{ marginRight: 'auto' }} onClick={onDelete}>
              <Icon name="trash" size={16} /> Remove
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={busy || bad || !ordered.length}
            onClick={async () => {
              setBusy(true);
              const { day, ...rest } = form;
              await onSave(ordered.map((d) => ({ ...rest, day: d })));
              setBusy(false);
            }}
          >
            {busy ? 'Saving…' : ordered.length > 1 ? `Save for ${ordered.length} days` : 'Save'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="field">
          <span className="field-label">Type</span>
          <div className="segmented">
            <button type="button" className={form.kind !== 'break' ? 'active' : ''} onClick={() => setKind('work')}>Working hours</button>
            <button type="button" className={form.kind === 'break' ? 'active' : ''} onClick={() => setKind('break')}>Break time (not counted)</button>
          </div>
        </div>
        <label className="field">
          <span>Label</span>
          <input value={form.label} maxLength={60} onChange={set('label')} />
        </label>
        <div className="field">
          <span className="field-label">
            Days <small className="muted">· same time on every day you pick</small>
          </span>
          <div className="day-chips" role="group" aria-label="Days">
            {WEEK.map(([d, name]) => (
              <button
                key={d}
                type="button"
                className={days.includes(d) ? 'on' : ''}
                aria-pressed={days.includes(d)}
                title={name}
                onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="day-presets">
            {DAY_PRESETS.map(([label, list]) => (
              <button key={label} type="button" className="link-btn" onClick={() => setDays(list)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="row-2">
          <div className="field">
            <span className="field-label">Start</span>
            <TimeInput value={form.start} onChange={(v) => setForm({ ...form, start: v })} label="Start time" min={workHours.start} max={workHours.end} />
          </div>
          <div className="field">
            <span className="field-label">End</span>
            <TimeInput value={form.end} onChange={(v) => setForm({ ...form, end: v })} label="End time" min={workHours.start} max={workHours.end} />
          </div>
        </div>
        {outside ? (
          <div className="alert error"><Icon name="alert" />Outside your work hours ({to12(workHours.start)} – {to12(workHours.end)}). Pick a time inside them.</div>
        ) : (
          bad && <div className="alert error"><Icon name="alert" />The end time must be after the start time.</div>
        )}
        <p className="muted small">Your work hours: {to12(workHours.start)} – {to12(workHours.end)}. Times outside them can&apos;t be picked.</p>
      </div>
    </Modal>
  );
}

const CLASSIFICATIONS = ['Full Time Probationary', 'Full Time Regular', 'Part Time'];
// Every loading report is for this school.
const DEPARTMENT = 'School of Information Technology';
// [field, label, usual position]
const SIGNERS = [
  ['checkedBy', 'Checked by', 'Program Chair'],
  ['endorsedBy', 'Endorsed by', 'Dean'],
  ['approvedBy', 'Approved by', 'Academic Director'],
];
// Positions offered in the dropdown. Positions that belong to a school get the school added
// ("Program Chair, School of Information Technology"), like the printed report.
const SCHOOL_POSITIONS = ['Program Chair', 'Associate Dean', 'Dean'];
const OTHER_POSITIONS = ['Academic Director', 'Department Chair', 'School Director', 'Executive Director', 'Vice President for Academic Affairs', 'Campus Director'];
const positionsFor = (department) => [
  ...SCHOOL_POSITIONS.map((p) => (department?.trim() ? `${p}, ${department.trim()}` : p)),
  ...OTHER_POSITIONS,
];
const OTHER = '__other__';
// The dropdown choice a saved position stands for ("Program Chair" -> "Program Chair, School of …").
const matchPosition = (value, options) => options.find((o) => o === value) || options.find((o) => value && o.split(',')[0] === value);

// A position dropdown with an "Other" choice that opens a text box.
function PositionSelect({ value, onChange, options, usual, label }) {
  const [typing, setTyping] = useState(() => !!value && !matchPosition(value, options));
  // Empty: the usual position for this signatory (as the template prints it).
  const shown = matchPosition(value, options) || options.find((o) => o.startsWith(usual)) || '';
  return (
    <span className="position-select">
      <select
        value={typing ? OTHER : shown}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setTyping(true);
            onChange('');
          } else {
            setTyping(false);
            onChange(e.target.value);
          }
        }}
        aria-label={`${label} position`}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value={OTHER}>Other (type it)…</option>
      </select>
      {typing && <input value={value} maxLength={80} placeholder="Type the position" onChange={(e) => onChange(e.target.value)} aria-label={`${label} position (other)`} autoFocus />}
    </span>
  );
}

// Faculty Loading Report: the details printed on it are saved once, then the Excel file is made.
export function LoadingReportModal({ term, onClose }) {
  const { toast } = useUI();
  const [details, setDetails] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/faculty/loading-report/details')
      .then((d) => setDetails(d.details || {}))
      .catch((e) => setError(e.message));
  }, []);
  const set = (k) => (e) => setDetails({ ...details, [k]: e.target.value });

  // what: 'both' (ZIP), 'loading' (Faculty Loading Report) or 'week' (Work Week Schedule).
  async function download(what) {
    setBusy(what);
    setError('');
    try {
      // A position left on its default is saved as the one the dropdown shows.
      const filled = { ...details, department: DEPARTMENT };
      const options = positionsFor(DEPARTMENT);
      for (const [k, , usual] of SIGNERS) filled[`${k}Title`] = matchPosition(filled[`${k}Title`], options) || filled[`${k}Title`] || options.find((o) => o.startsWith(usual)) || usual;
      setDetails(filled);
      await api('/faculty/loading-report/details', { method: 'PUT', body: { details: filled } });
      const path = { both: 'schedule-files', loading: 'loading-report', week: 'workweek' }[what];
      const name = await downloadFile(`/api/faculty/${path}?${new URLSearchParams({ academicYear: term?.academicYear || '', term: term?.term || '' })}`);
      toast(`Downloaded ${name}`);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <Modal
      title="Schedule files"
      subtitle={`The Faculty Loading Report and the Work Week Schedule${term?.label ? ` for ${term.label}` : ''}, in the school's Excel formats, from your classes and time blocks. These details are saved for next time.`}
      icon="download"
      onClose={onClose}
      width={620}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!!busy || !details} onClick={() => download('both')}>
            {busy === 'both' ? <span className="spinner sm" /> : <Icon name="download" size={16} />} {busy === 'both' ? 'Preparing…' : 'Download both (ZIP)'}
          </button>
        </>
      }
    >
      {!details ? (
        error ? <div className="alert error"><Icon name="alert" />{error}</div> : <div className="page-loader"><span className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="row-3 report-row">
            <label className="field">
              <span>Employee ID</span>
              <input value={details.employeeId || ''} maxLength={80} placeholder="e.g. 00-00000" onChange={set('employeeId')} />
            </label>
            <label className="field">
              <span>Classification</span>
              <select value={CLASSIFICATIONS.find((c) => c.toLowerCase() === (details.classification || '').toLowerCase()) || ''} onChange={set('classification')}>
                <option value="" disabled>Choose…</option>
                {CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <div className="field">
              <span className="field-label">School / department</span>
              <div className="fixed-value">{DEPARTMENT}</div>
            </div>
          </div>
          <div className="field">
            <span className="field-label">Signatories</span>
            <div className="signers">
              {SIGNERS.map(([k, label, usual]) => (
                <div key={k} className="signer">
                  <strong>{label}</strong>
                  <input value={details[k] || ''} maxLength={80} placeholder="Name" onChange={set(k)} aria-label={`${label} name`} />
                  <PositionSelect
                    label={label}
                    usual={usual}
                    options={positionsFor(DEPARTMENT)}
                    value={details[`${k}Title`] || ''}
                    onChange={(v) => setDetails((d) => ({ ...d, [`${k}Title`]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="file-picks">
            <div className="file-pick">
              <span className="file-pick-icon"><Icon name="list" size={18} /></span>
              <span className="file-pick-text">
                <strong>Faculty Loading Report</strong>
                <small>One row per class meeting with LEC/LAB, room, mode, units and hours; admin/consultation hours; signatories.</small>
              </span>
              <button type="button" className="btn" disabled={!!busy} onClick={() => download('loading')}>
                {busy === 'loading' ? <span className="spinner sm" /> : <Icon name="download" size={15} />} Only this
              </button>
            </div>
            <div className="file-pick">
              <span className="file-pick-icon"><Icon name="calendar" size={18} /></span>
              <span className="file-pick-text">
                <strong>Work Week Schedule</strong>
                <small>Monday–Saturday in 20-minute rows: face-to-face (green), remote (blue), admin hours (yellow), breaks and day off.</small>
              </span>
              <button type="button" className="btn" disabled={!!busy} onClick={() => download('week')}>
                {busy === 'week' ? <span className="spinner sm" /> : <Icon name="download" size={15} />} Only this
              </button>
            </div>
          </div>
          <p className="muted small">
            LEC/LAB, room and mode come from each section&apos;s schedule (set them in <strong>Section details</strong>; an ONLINE class is remote in the
            work week). Break time is shown on the work week but never counted.
          </p>
          {error && <div className="alert error"><Icon name="alert" />{error}</div>}
        </div>
      )}
    </Modal>
  );
}
