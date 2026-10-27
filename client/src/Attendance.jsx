import { useMemo, useState } from 'react';
import { api } from './api.js';
import { Avatar, Icon, useUI } from './ui.jsx';

export const MARK_LABEL = { P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' };
const CYCLE = ['P', 'L', 'A', 'E', null]; // click order; null clears the cell
const LATE_OPTIONS = [1, 0.75, 0.5, 0.25, 0];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return { day: d.toLocaleDateString(undefined, { weekday: 'short' }), date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
};

export function AttendanceView({ sectionId, data, setData, query, setQuery }) {
  const { toast, confirm } = useUI();
  const att = data.section.attendance || { component: '', late: 0.5, sessions: [] };
  const sessions = att.sessions;
  const [form, setForm] = useState(() => ({
    date: today(),
    period: sessions.some((s) => s.period === 'POST') ? 'POST' : 'MID',
    label: '',
    markAll: true,
  }));
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const rows = data.rows.filter((r) => `${r.student.name} ${r.student.studentNo}`.toLowerCase().includes(q));

  // Present / late / absent / excused count per session, for the column headers.
  const perSession = useMemo(() => {
    const m = {};
    for (const s of sessions) {
      const c = { P: 0, L: 0, A: 0, E: 0 };
      for (const r of data.rows) {
        const k = r.attendance?.marks?.[s.id];
        if (k) c[k]++;
      }
      m[s.id] = c;
    }
    return m;
  }, [sessions, data.rows]);

  async function run(promise, done) {
    try {
      const d = await promise;
      setData(d);
      if (done) toast(done);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const settings = (body) => run(api(`/faculty/sections/${sectionId}/attendance`, { method: 'PATCH', body }), 'Attendance settings saved');

  async function addSession(e) {
    e.preventDefault();
    if (sessions.some((s) => s.date === form.date && (s.label || '') === form.label.trim())) {
      const ok = await confirm({ title: 'Add another session on this date?', message: 'There is already a session on this date. Add a label (e.g. "Lab") to tell them apart, or continue.', confirmLabel: 'Add anyway' });
      if (!ok) return;
    }
    setBusy(true);
    await run(
      api(`/faculty/sections/${sectionId}/attendance/sessions`, {
        method: 'POST',
        body: { date: form.date, period: form.period, label: form.label.trim(), markAll: form.markAll ? 'P' : undefined },
      }),
      form.markAll ? 'Session added. Everyone is marked present; click a cell to change it.' : 'Session added'
    );
    setForm((f) => ({ ...f, label: '' }));
    setBusy(false);
  }

  async function removeSession(s) {
    const { date } = fmtDate(s.date);
    const ok = await confirm({
      title: `Delete the ${date} session?`,
      message: 'Its attendance marks are removed and grades are recalculated. This cannot be undone.',
      confirmLabel: 'Delete session',
      danger: true,
    });
    if (ok) await run(api(`/faculty/sections/${sectionId}/attendance/sessions/${s.id}`, { method: 'DELETE' }), 'Session deleted');
  }

  const markAll = (s, mark) =>
    run(api(`/faculty/sections/${sectionId}/attendance/marks`, { method: 'PUT', body: { sessionId: s.id, mark } }), `Everyone marked ${MARK_LABEL[mark].toLowerCase()}`);

  async function setMark(row, session, mark) {
    // Optimistic: update the cell now, then the grades from the server.
    const patchRow = (fn) => setData((d) => ({ ...d, rows: d.rows.map((r) => (r.student.id === row.student.id ? fn(r) : r)) }));
    patchRow((r) => {
      const marks = { ...(r.attendance?.marks || {}) };
      if (mark) marks[session.id] = mark;
      else delete marks[session.id];
      return { ...r, attendance: { ...(r.attendance || {}), marks } };
    });
    try {
      const d = await api(`/faculty/sections/${sectionId}/attendance/marks`, {
        method: 'PUT',
        body: { sessionId: session.id, studentId: row.student.id, mark },
      });
      patchRow((r) => ({
        ...r,
        grades: d.grades,
        attendance: d.attendance,
        scores: { ...r.scores, ...Object.fromEntries(Object.entries(d.attendance.items || {}).map(([p, v]) => [`att-${p}`, v.score])) },
      }));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const next = (mark) => CYCLE[(CYCLE.indexOf(mark ?? null) + 1) % CYCLE.length];

  return (
    <div className="card table-card att-card">
      <div className="att-settings">
        <div className="att-setting">
          <span className="field-label">Counts toward</span>
          <div className="segmented att-seg">
            {[
              ['CP', 'Class Participation'],
              ['EA', 'Enabling Activities'],
              ['', 'Not graded'],
            ].map(([k, label]) => (
              <button key={k || 'none'} type="button" className={att.component === k ? 'active' : ''} onClick={() => att.component !== k && settings({ component: k })}>
                {k && <b className={`grp-${k}`}>{k}</b>} {label}
              </button>
            ))}
          </div>
        </div>
        <label className="att-setting att-late">
          <span className="field-label">Late counts as</span>
          <select value={att.late} onChange={(e) => settings({ late: Number(e.target.value) })}>
            {LATE_OPTIONS.map((v) => (
              <option key={v} value={v}>{v === 1 ? '1 point (same as present)' : v === 0 ? '0 points (same as absent)' : `${v} point`}</option>
            ))}
          </select>
        </label>
        <p className="att-explain">
          {att.component
            ? `Each period's attendance is one item inside ${att.component === 'CP' ? 'Class Participation' : 'Enabling Activities'}: present = 1 point, late = ${att.late}, absent = 0. Excused sessions don't count. Unmarked sessions count as absent.`
            : 'Attendance is recorded but does not affect grades. Choose CP or EA to include it.'}
        </p>
      </div>

      <form className="att-add" onSubmit={addSession}>
        <strong className="att-add-title"><Icon name="plus" size={15} /> Add session</strong>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required aria-label="Date" />
        <div className="segmented att-period">
          {[['MID', 'Midterms'], ['POST', 'Finals']].map(([k, label]) => (
            <button key={k} type="button" className={form.period === k ? 'active' : ''} onClick={() => setForm({ ...form, period: k })}>{label}</button>
          ))}
        </div>
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label (optional, e.g. Lab)" maxLength={40} aria-label="Label" />
        <label className="att-markall">
          <input type="checkbox" checked={form.markAll} onChange={(e) => setForm({ ...form, markAll: e.target.checked })} />
          Mark everyone present
        </label>
        <button className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
      </form>

      <div className="table-toolbar">
        <span className="input-icon">
          <Icon name="search" />
          <input placeholder="Search by name or ID number…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </span>
        <div className="toolbar-meta att-legend">
          {Object.entries(MARK_LABEL).map(([k, v]) => (
            <span key={k}><i className={`mark mark-${k}`}>{k}</i> {v}</span>
          ))}
          <span className="hide-sm">Click a cell to change it</span>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="empty-inline">No sessions yet. Add the first class meeting above.</div>
      ) : (
        <div className="table-wrap">
          <table className="record att-table">
            <thead>
              <tr>
                <th className="sticky-col">Student</th>
                {sessions.map((s) => {
                  const { day, date } = fmtDate(s.date);
                  const c = perSession[s.id] || {};
                  return (
                    <th key={s.id} className={`att-col ${s.period === 'POST' ? 'post' : ''}`}>
                      <span className="att-day">{day}</span>
                      <span className="att-date">{date}</span>
                      <span className="att-period-tag">{s.label || (s.period === 'MID' ? 'Mid' : 'Post')}</span>
                      <span className="att-count" title="Present / late / absent">{c.P}·{c.L}·{c.A}</span>
                      <span className="att-tools">
                        <button type="button" title="Mark everyone present" onClick={() => markAll(s, 'P')}><Icon name="check" size={12} /></button>
                        <button type="button" title="Delete session" className="danger" onClick={() => removeSession(s)}><Icon name="x" size={12} /></button>
                      </span>
                    </th>
                  );
                })}
                <th className="att-sum gstart">Midterms</th>
                <th className="att-sum">Post</th>
                <th className="att-sum">Absences</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = r.attendance || {};
                const sum = (p) => (a.items?.[p] ? `${a.items[p].score} / ${a.items[p].max}` : '—');
                return (
                  <tr key={r.student.id}>
                    <td className="sticky-col">
                      <div className="student-cell">
                        <Avatar name={r.student.name} size={28} />
                        <div style={{ minWidth: 0 }}>
                          <div className="sname" title={r.student.name}>{r.student.name}</div>
                          <div className="sno">{r.student.studentNo}</div>
                        </div>
                      </div>
                    </td>
                    {sessions.map((s) => {
                      const mark = a.marks?.[s.id] || null;
                      return (
                        <td key={s.id} className="att-cell">
                          <button
                            type="button"
                            className={`mark mark-${mark || 'none'}`}
                            title={`${MARK_LABEL[mark] || 'Not marked'} · click for ${MARK_LABEL[next(mark)] || 'blank'}`}
                            onClick={() => setMark(r, s, next(mark))}
                          >
                            {mark || '·'}
                          </button>
                        </td>
                      );
                    })}
                    <td className="att-sum gstart num">{sum('MID')}</td>
                    <td className="att-sum num">{sum('POST')}</td>
                    <td className={`att-sum num ${a.counts?.A ? 'has-abs' : ''}`}>{a.counts?.A ?? 0}{a.counts?.L ? <small> +{a.counts.L} late</small> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="no-results">No students match “{query}”.</div>}
        </div>
      )}
    </div>
  );
}
