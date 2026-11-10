import { useState } from 'react';
import { api, DAYS, isOnlineRoom, rowsFromText, to12 } from './api.js';
import { Icon, Modal, TimeInput } from './ui.jsx';

export const MODES = ['F2F', 'ONLINE', 'BLENDED'];
export const blankRow = () => ({ day: '', start: '', end: '', room: '', type: '', mode: 'F2F' });

// Schedule rows: when the section meets. A faculty can add as many as they need.
export function ScheduleEditor({ rows, onChange, highlighted }) {
  const update = (i, k, v) =>
    onChange(
      rows.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, [k]: v };
        // Typing a long room name switches the row to online; going back to a room number undoes it.
        if (k === 'room') {
          if (isOnlineRoom(v)) next.mode = 'ONLINE';
          else if (isOnlineRoom(r.room) && r.mode === 'ONLINE') next.mode = 'F2F';
        }
        return next;
      })
    );
  const remove = (i) => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [blankRow()]);
  const add = () => {
    // A new row starts with the previous row's times and room, which is usually what's needed.
    const last = rows[rows.length - 1] || blankRow();
    onChange([...rows, { day: '', start: last.start, end: last.end, room: last.room, type: '', mode: last.mode || 'F2F' }]);
  };

  return (
    <div className={`sched-editor ${highlighted ? 'autofilled' : ''}`}>
      {rows.map((r, i) => {
        const bad = r.start && r.end && r.end <= r.start;
        return (
          <div key={i} className={`sched-row-edit ${bad ? 'invalid' : ''}`}>
            <div className="sched-line">
              <select value={r.day} onChange={(e) => update(i, 'day', e.target.value)} aria-label={`Day for row ${i + 1}`}>
                <option value="">Day</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <TimeInput value={r.start} onChange={(v) => update(i, 'start', v)} label={`Start time for row ${i + 1}`} />
              <span className="sched-dash">–</span>
              <TimeInput value={r.end} onChange={(v) => update(i, 'end', v)} label={`End time for row ${i + 1}`} />
              <button type="button" className="icon-btn danger" title="Remove this schedule" onClick={() => remove(i)}>
                <Icon name="x" size={15} />
              </button>
            </div>
            <div className="sched-line sched-line-2">
              <input value={r.room} onChange={(e) => update(i, 'room', e.target.value)} placeholder="Room (e.g. 1009 or TBA)" aria-label={`Room for row ${i + 1}`} />
              <select value={r.type || ''} onChange={(e) => update(i, 'type', e.target.value)} aria-label={`Lecture or laboratory for row ${i + 1}`}>
                <option value="">LEC / LAB</option>
                <option value="LEC">LEC</option>
                <option value="LAB">LAB</option>
              </select>
              <select
                value={isOnlineRoom(r.room) ? 'ONLINE' : r.mode || 'F2F'}
                onChange={(e) => update(i, 'mode', e.target.value)}
                disabled={isOnlineRoom(r.room)}
                title={isOnlineRoom(r.room) ? 'Online: the room is longer than 4 characters, so it is not a room number' : undefined}
                aria-label={`Mode for row ${i + 1}`}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            {bad && <span className="sched-error">The end time must be after the start time.</span>}
            {!bad && r.day && r.start && r.end && (
              <span className="sched-preview">
                {r.day} · {to12(r.start)} – {to12(r.end)}{r.room && (isOnlineRoom(r.room) ? ` · ${r.room}` : ` · Room ${r.room}`)}{r.type && ` · ${r.type}`} · {isOnlineRoom(r.room) ? 'ONLINE' : r.mode || 'F2F'}
              </span>
            )}
          </div>
        );
      })}
      <button type="button" className="link-add" onClick={add}>
        <Icon name="plus" size={14} /> Add another schedule
      </button>
    </div>
  );
}

// Rows the server will accept: complete ones only (blank rows are dropped).
export const filledRows = (rows) => rows.filter((r) => r.day || r.start || r.end || r.room);

// Midterm and final grades, or a final grade only (for subjects without a midterm).
export function GradingModeChoice({ value, onChange }) {
  const options = [
    ['both', 'Midterm and final', 'Midterm grade (CP, EA, MPT) and final grade'],
    ['final', 'Final only', 'No midterm: one final grade from CP, EA and CPT'],
  ];
  return (
    <div className="field">
      <span className="field-label">Grading</span>
      <div className="mode-choice" role="radiogroup" aria-label="Grading">
        {options.map(([k, title, sub]) => (
          <label key={k} className={`mode-option ${value === k ? 'active' : ''}`}>
            <input type="radio" name="gradingMode" value={k} checked={value === k} onChange={() => onChange(k)} />
            <strong>{title}</strong>
            <small>{sub}</small>
          </label>
        ))}
      </div>
    </div>
  );
}

// Edit an existing section's details and schedule.
export function EditSectionModal({ section, onClose, onSaved }) {
  const [form, setForm] = useState({
    code: section.code || '',
    subjectCode: section.subjectCode || '',
    subjectTitle: section.subjectTitle || '',
    units: section.units ?? '',
    term: section.term || '',
    academicYear: section.academicYear || '',
    gradingMode: section.gradingMode || 'both',
  });
  const [rows, setRows] = useState(() => {
    if (section.schedule?.length) return section.schedule.map((r) => ({ ...r }));
    const legacy = rowsFromText(section); // older sections only have one-line day/time/room
    return legacy.length ? legacy : [blankRow()];
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api(`/faculty/sections/${section.id}`, { method: 'PATCH', body: { details: { ...form, schedule: filledRows(rows) } } });
      onSaved(d);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Section details"
      subtitle="Change the section code, subject, term or schedule."
      icon="edit"
      onClose={onClose}
      width={640}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" form="edit-section" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </>
      }
    >
      <form id="edit-section" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div className="row-2">
          <label className="field">
            <span>Section code *</span>
            <input value={form.code} onChange={set('code')} required />
          </label>
          <label className="field">
            <span>Subject code</span>
            <input value={form.subjectCode} onChange={set('subjectCode')} />
          </label>
        </div>
        <label className="field">
          <span>Subject title</span>
          <input value={form.subjectTitle} onChange={set('subjectTitle')} />
        </label>
        <div className="row-3">
          <label className="field">
            <span>Term</span>
            <input value={form.term} onChange={set('term')} placeholder="First Term" />
          </label>
          <label className="field">
            <span>Units</span>
            <input type="number" min="0" max="10" value={form.units} onChange={set('units')} />
          </label>
          <label className="field">
            <span>A.Y.</span>
            <input value={form.academicYear} onChange={set('academicYear')} placeholder="2026-2027" />
          </label>
        </div>
        <GradingModeChoice value={form.gradingMode} onChange={(v) => setForm({ ...form, gradingMode: v })} />
        {form.gradingMode === 'final' && section.gradingMode !== 'final' && (
          <div className="alert info"><Icon name="info" />Midterm CP and EA items move to Finals, and the MPT share of the final grade moves to the CPT.</div>
        )}
        <div className="field">
          <span className="field-label">Schedule</span>
          <ScheduleEditor rows={rows} onChange={setRows} />
        </div>
        {error && <div className="alert error"><Icon name="alert" />{error}</div>}
      </form>
    </Modal>
  );
}
