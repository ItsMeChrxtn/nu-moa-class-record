import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, meetingsOn, to12 } from './api.js';
import { Icon, Modal, titleCase, useUI } from './ui.jsx';

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

export default function Timetable({ sections, blocks, onBlocksChange, termLabel }) {
  const { toast, confirm } = useUI();
  const [editing, setEditing] = useState(null); // { index } or { index: -1 } for a new block
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
  const hours = all.filter((b) => b.kind === 'class').reduce((h, b) => h + (b.end - b.start) / 60, 0);
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
            {sections.length} section{sections.length === 1 ? '' : 's'} · {Math.round(hours * 10) / 10} class hours a week
          </h2>
        </div>
        <button className="btn" onClick={() => setEditing({ index: -1 })}>
          <Icon name="plus" size={16} /> Consultation hours
        </button>
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
                  <button key={i} type="button" className={`tt-block tt-other ${short ? 'short' : ''}`} style={style} onClick={() => setEditing({ index: b.index })} title="Edit this block">
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
          onClose={() => setEditing(null)}
          onSave={async (b) => {
            const next = editing.index >= 0 ? blocks.map((x, i) => (i === editing.index ? b : x)) : [...blocks, b];
            if (await save(next, editing.index >= 0 ? 'Block updated' : 'Added to your schedule')) setEditing(null);
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

function BlockModal({ block, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(block || { label: 'Admin/Consultation Hours', day: 'MON', start: '08:00', end: '10:00' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const bad = !form.start || !form.end || form.end <= form.start;
  return (
    <Modal
      title={block ? 'Edit block' : 'Add consultation hours'}
      subtitle="Consultation hours, meetings, or anything else that fills your week. Only you see these."
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
        <label className="field">
          <span>Label</span>
          <input value={form.label} maxLength={60} onChange={set('label')} />
        </label>
        <div className="row-3">
          <label className="field">
            <span>Day</span>
            <select value={form.day} onChange={set('day')}>
              {WEEK.map(([d, name]) => (
                <option key={d} value={d}>{name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Start</span>
            <input type="time" value={form.start} onChange={set('start')} />
          </label>
          <label className="field">
            <span>End</span>
            <input type="time" value={form.end} onChange={set('end')} />
          </label>
        </div>
        {bad && <div className="alert error"><Icon name="alert" />The end time must be after the start time.</div>}
      </div>
    </Modal>
  );
}
