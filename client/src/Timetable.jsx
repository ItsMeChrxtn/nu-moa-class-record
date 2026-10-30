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

export default function Timetable({ sections, blocks, onBlocksChange, termLabel, onExport }) {
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
  // 7:00 AM – 6:00 PM, stretched to fit the earliest and latest class.
  const first = Math.min(7 * 60, ...all.map((b) => Math.floor(b.start / 60) * 60));
  const last = Math.max(18 * 60, ...all.map((b) => Math.ceil(b.end / 60) * 60));
  const rows = (last - first) / SLOT;
  const span = (list) => list.reduce((h, b) => h + (b.end - b.start) / 60, 0);
  // Working hours = classes + admin/consultation blocks; break time is shown but never counted.
  const classHours = span(all.filter((b) => b.kind === 'class'));
  const workHours = span(all.filter((b) => b.kind === 'block' && b.b.kind !== 'break'));
  const breakHours = span(all.filter((b) => b.kind === 'block' && b.b.kind === 'break'));
  const total = classHours + workHours;
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
              <Icon name="download" size={16} /> Loading report
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
          <span className="wb-work" style={{ width: `${Math.min(100, (workHours / Math.max(WEEK_HOURS, total)) * 100)}%` }} />
        </div>
        <ul className="work-legend">
          <li><i className="wb-class" />Classes <strong>{fmtH(classHours)} h</strong></li>
          <li><i className="wb-work" />Admin / consultation <strong>{fmtH(workHours)} h</strong></li>
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
          onClose={() => setEditing(null)}
          onSave={async (b) => {
            const next = editing.index >= 0 ? blocks.map((x, i) => (i === editing.index ? b : x)) : [...blocks, b];
            if (await save(next, editing.index >= 0 ? 'Block updated' : b.kind === 'break' ? 'Break time added' : 'Added to your schedule')) setEditing(null);
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
    </section>
  );
}

const DEFAULT_LABEL = { work: 'Admin/Consultation Hours', break: 'Break time' };

function BlockModal({ block, kind = 'work', onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() =>
    block
      ? { kind: 'work', ...block }
      : { kind, label: DEFAULT_LABEL[kind], day: 'MON', start: kind === 'break' ? '12:00' : '08:00', end: kind === 'break' ? '13:00' : '10:00' }
  );
  // Switching the type also switches a default label, but keeps one the faculty typed.
  const setKind = (k) => setForm({ ...form, kind: k, label: !form.label || Object.values(DEFAULT_LABEL).includes(form.label) ? DEFAULT_LABEL[k] : form.label });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const bad = !form.start || !form.end || form.end <= form.start;
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
        <label className="field">
          <span>Day</span>
          <select value={form.day} onChange={set('day')}>
            {WEEK.map(([d, name]) => (
              <option key={d} value={d}>{name}</option>
            ))}
          </select>
        </label>
        <div className="row-2">
          <div className="field">
            <span className="field-label">Start</span>
            <TimeInput value={form.start} onChange={(v) => setForm({ ...form, start: v })} label="Start time" />
          </div>
          <div className="field">
            <span className="field-label">End</span>
            <TimeInput value={form.end} onChange={(v) => setForm({ ...form, end: v })} label="End time" />
          </div>
        </div>
        {bad && <div className="alert error"><Icon name="alert" />The end time must be after the start time.</div>}
      </div>
    </Modal>
  );
}

const REPORT_FIELDS = [
  ['employeeId', 'Employee ID', 'e.g. 00-00000'],
  ['classification', 'Classification', 'e.g. Full Time Probationary'],
  ['department', 'School / department', 'e.g. School of Information Technology'],
];
const SIGNERS = [
  ['checkedBy', 'Checked by', 'Program Chair, School of Information Technology'],
  ['endorsedBy', 'Endorsed by', 'Dean, School of Information Technology'],
  ['approvedBy', 'Approved by', 'Academic Director'],
];

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

  async function download() {
    setBusy(true);
    setError('');
    try {
      await api('/faculty/loading-report/details', { method: 'PUT', body: { details } });
      const name = await downloadFile(`/api/faculty/loading-report?${new URLSearchParams({ academicYear: term?.academicYear || '', term: term?.term || '' })}`);
      toast(`Downloaded ${name}`);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Faculty loading report"
      subtitle={`Your classes${term?.label ? ` for ${term.label}` : ''}, admin/consultation hours and totals, in the school's loading report format (Excel). These details are saved for next time.`}
      icon="download"
      onClose={onClose}
      width={620}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !details} onClick={download}>
            {busy ? <span className="spinner sm" /> : <Icon name="download" size={16} />} {busy ? 'Preparing…' : 'Download Excel'}
          </button>
        </>
      }
    >
      {!details ? (
        error ? <div className="alert error"><Icon name="alert" />{error}</div> : <div className="page-loader"><span className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="row-3 report-row">
            {REPORT_FIELDS.map(([k, label, ph]) => (
              <label key={k} className="field">
                <span>{label}</span>
                <input value={details[k] || ''} maxLength={80} placeholder={ph} onChange={set(k)} />
              </label>
            ))}
          </div>
          <div className="field">
            <span className="field-label">Signatories</span>
            <div className="signers">
              {SIGNERS.map(([k, label, titlePh]) => (
                <div key={k} className="signer">
                  <strong>{label}</strong>
                  <input value={details[k] || ''} maxLength={80} placeholder="Name" onChange={set(k)} aria-label={`${label} name`} />
                  <input value={details[`${k}Title`] || ''} maxLength={80} placeholder={titlePh} onChange={set(`${k}Title`)} aria-label={`${label} position`} />
                </div>
              ))}
            </div>
          </div>
          <p className="muted small">
            Each class meeting becomes one row: subject, section, day, time, LEC/LAB, room and mode come from the section&apos;s schedule (set LEC/LAB and
            mode in <strong>Section details</strong>). Admin/consultation blocks fill in the consultation and administration hours; break time is left out.
          </p>
          {error && <div className="alert error"><Icon name="alert" />{error}</div>}
        </div>
      )}
    </Modal>
  );
}
