import { useMemo, useState } from 'react';
import { api } from './api.js';
import { Avatar, Icon, useUI } from './ui.jsx';

export const MARK_LABEL = { P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' };
const LATE_OPTIONS = [1, 0.75, 0.5, 0.25, 0];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (iso, opts = { month: 'short', day: 'numeric' }) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opts);
const dayName = (iso) => fmtDate(iso, { weekday: 'short' });
const longDate = (iso) => fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric' });
const lateText = (v) => (v === 1 ? '1 pt (= present)' : v === 0 ? '0 pts (= absent)' : `${v} pt`);

export function AttendanceView({ sectionId, data, setData, query, setQuery }) {
  const { toast, confirm } = useUI();
  const att = data.section.attendance || { component: '', late: 0.5, sessions: [] };
  const sessions = att.sessions;
  const todayIso = today();
  const defaultPeriod = sessions.some((s) => s.period === 'POST') ? 'POST' : 'MID';
  const [form, setForm] = useState(() => ({ date: todayIso, period: defaultPeriod, label: '', markAll: true }));
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(null); // chosen session id; otherwise today's or the latest
  const [view, setView] = useState('roll'); // 'roll' | 'all'
  const [editing, setEditing] = useState(null); // { id, date, period, label } while fixing a session

  const latest = sessions.find((s) => s.date === todayIso) || [...sessions].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const current = sessions.find((s) => s.id === pick) || latest;
  const hasToday = sessions.some((s) => s.date === todayIso);

  const q = query.trim().toLowerCase();
  const rows = data.rows.filter((r) => `${r.student.name} ${r.student.studentNo}`.toLowerCase().includes(q));

  const counts = useMemo(() => {
    const m = {};
    for (const s of sessions) {
      const c = { P: 0, L: 0, A: 0, E: 0, none: 0 };
      for (const r of data.rows) c[r.attendance?.marks?.[s.id] || 'none']++;
      m[s.id] = c;
    }
    return m;
  }, [sessions, data.rows]);

  async function run(promise, done) {
    try {
      const d = await promise;
      setData(d);
      if (done) toast(done);
      return d;
    } catch (e) {
      toast(e.message, 'error');
      return null;
    }
  }

  const settings = (body) => run(api(`/faculty/sections/${sectionId}/attendance`, { method: 'PATCH', body }), 'Attendance settings saved');

  async function createSession({ date, period, label, markAll }) {
    if (sessions.some((s) => s.date === date && (s.label || '') === label)) {
      const ok = await confirm({ title: 'Add another session on this date?', message: 'There is already a session on this date. Add a label (e.g. "Lab") to tell them apart, or continue.', confirmLabel: 'Add anyway' });
      if (!ok) return false;
    }
    setBusy(true);
    const before = new Set(sessions.map((s) => s.id));
    const d = await run(
      api(`/faculty/sections/${sectionId}/attendance/sessions`, { method: 'POST', body: { date, period, label, markAll: markAll ? 'P' : undefined } }),
      markAll ? 'Session added: everyone is present. Tap Late or Absent for the ones who are not.' : 'Session added'
    );
    setBusy(false);
    const added = d?.section?.attendance?.sessions?.find((s) => !before.has(s.id));
    if (added) {
      setPick(added.id);
      setView('roll');
    }
    return !!d;
  }

  async function addSession(e) {
    e.preventDefault();
    if (await createSession({ ...form, label: form.label.trim() })) {
      setForm((f) => ({ ...f, label: '' }));
      setShowForm(false);
    }
  }

  async function removeSession(s) {
    const ok = await confirm({
      title: `Delete the ${fmtDate(s.date)} session?`,
      message: 'Its attendance marks are removed and grades are recalculated. This cannot be undone.',
      confirmLabel: 'Delete session',
      danger: true,
    });
    if (ok) {
      if (pick === s.id) setPick(null);
      await run(api(`/faculty/sections/${sectionId}/attendance/sessions/${s.id}`, { method: 'DELETE' }), 'Session deleted');
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    const { id, date, period, label } = editing;
    const ok = await run(api(`/faculty/sections/${sectionId}/attendance/sessions/${id}`, { method: 'PATCH', body: { date, period, label: label.trim() } }), 'Session updated');
    if (ok) setEditing(null);
  }

  const markEveryone = (s, mark) =>
    run(api(`/faculty/sections/${sectionId}/attendance/marks`, { method: 'PUT', body: { sessionId: s.id, mark } }), `Everyone marked ${MARK_LABEL[mark].toLowerCase()}`);

  // Shows the mark right away, then takes the recalculated grades from the server.
  async function setMark(row, session, mark) {
    const patch = (fn) => setData((d) => ({ ...d, rows: d.rows.map((r) => (r.student.id === row.student.id ? fn(r) : r)) }));
    patch((r) => {
      const marks = { ...(r.attendance?.marks || {}) };
      if (mark) marks[session.id] = mark;
      else delete marks[session.id];
      return { ...r, attendance: { ...(r.attendance || {}), marks } };
    });
    try {
      const d = await api(`/faculty/sections/${sectionId}/attendance/marks`, { method: 'PUT', body: { sessionId: session.id, studentId: row.student.id, mark } });
      patch((r) => ({
        ...r,
        grades: d.grades,
        attendance: d.attendance,
        scores: { ...r.scores, ...Object.fromEntries(Object.entries(d.attendance.items || {}).map(([p, v]) => [`att-${p}`, v.score])) },
      }));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const compName = att.component === 'CP' ? 'Class Participation' : att.component === 'EA' ? 'Enabling Activities' : '';
  const c = current ? counts[current.id] : null;
  const ordered = [...sessions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="att">
      {/* ── Left: sessions and settings ── */}
      <aside className="att-side card">
        {hasToday ? (
          <button className="att-today-ready" onClick={() => { setPick(sessions.find((s) => s.date === todayIso).id); setView('roll'); }}>
            <Icon name="check" size={16} /> Today's attendance is open
          </button>
        ) : (
          <button className="btn primary block" onClick={() => createSession({ date: todayIso, period: defaultPeriod, label: '', markAll: true })} disabled={busy}>
            <Icon name="plus" size={16} /> {busy ? 'Adding…' : "Take today's attendance"}
          </button>
        )}

        <div className="att-side-head">
          <span className="field-label">Sessions · {sessions.length}</span>
          <button type="button" className="link-add" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : '+ Other date'}</button>
        </div>

        {showForm && (
          <form className="att-form" onSubmit={addSession}>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required aria-label="Date" />
            <div className="segmented">
              {[['MID', 'Midterms'], ['POST', 'Finals']].map(([k, label]) => (
                <button key={k} type="button" className={form.period === k ? 'active' : ''} onClick={() => setForm({ ...form, period: k })}>{label}</button>
              ))}
            </div>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label (optional, e.g. Lab)" maxLength={40} aria-label="Label" />
            <label className="att-markall">
              <input type="checkbox" checked={form.markAll} onChange={(e) => setForm({ ...form, markAll: e.target.checked })} />
              Start with everyone present
            </label>
            <button className="btn primary block" disabled={busy}>{busy ? 'Adding…' : 'Add session'}</button>
          </form>
        )}

        <ul className="att-sessions">
          {ordered.length === 0 && <li className="att-none">No sessions yet.</li>}
          {ordered.map((s) => {
            const k = counts[s.id];
            const total = data.rows.length || 1;
            const on = view === 'roll' && current?.id === s.id;
            return (
              <li key={s.id}>
                <button type="button" className={`att-sess ${on ? 'on' : ''}`} onClick={() => { setPick(s.id); setView('roll'); }}>
                  <span className="att-sess-date">
                    <b>{s.date === todayIso ? 'Today' : dayName(s.date)}</b> {fmtDate(s.date)}
                    <em className={s.period === 'POST' ? 'post' : ''}>{s.label || (s.period === 'MID' ? 'Mid' : 'Finals')}</em>
                  </span>
                  <span className="att-sess-bar" title={`${k.P} present · ${k.L} late · ${k.A} absent`}>
                    <i className="p" style={{ width: `${(k.P / total) * 100}%` }} />
                    <i className="l" style={{ width: `${(k.L / total) * 100}%` }} />
                    <i className="a" style={{ width: `${(k.A / total) * 100}%` }} />
                  </span>
                  <span className="att-sess-n">{k.A ? <span className="abs">{k.A} absent</span> : 'all in'}</span>
                </button>
                <button type="button" className="att-sess-del" title={`Delete the ${fmtDate(s.date)} session`} aria-label={`Delete the ${fmtDate(s.date)} session`} onClick={() => removeSession(s)}>
                  <Icon name="trash" size={14} />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="att-set">
          <span className="field-label">Counts toward</span>
          <div className="segmented">
            {[['CP', 'CP'], ['EA', 'EA'], ['', 'None']].map(([k, label]) => (
              <button key={k || 'none'} type="button" className={att.component === k ? 'active' : ''} title={k === 'CP' ? 'Class Participation' : k === 'EA' ? 'Enabling Activities' : 'Recorded only'} onClick={() => att.component !== k && settings({ component: k })}>
                {label}
              </button>
            ))}
          </div>
          <label className="att-set-row">
            <span className="field-label">Late counts as</span>
            <select value={att.late} onChange={(e) => settings({ late: Number(e.target.value) })}>
              {LATE_OPTIONS.map((v) => <option key={v} value={v}>{lateText(v)}</option>)}
            </select>
          </label>
          <p className="att-note">
            {compName
              ? `Each term's attendance is one item in ${compName}: present 1, late ${att.late}, absent 0. Excused doesn't count.`
              : 'Recorded only; it does not affect grades.'}
          </p>
        </div>
      </aside>

      {/* ── Right: roll call for one session, or every date ── */}
      <section className="att-main card">
        <div className="att-main-head">
          <div className="att-tabs" role="tablist">
            <button role="tab" aria-selected={view === 'roll'} onClick={() => setView('roll')} disabled={!current}>Roll call</button>
            <button role="tab" aria-selected={view === 'all'} onClick={() => setView('all')} disabled={!sessions.length}>All dates</button>
          </div>
          <span className="input-icon att-search">
            <Icon name="search" />
            <input placeholder="Search student…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </span>
        </div>

        {!current ? (
          <div className="att-empty">
            <span className="empty-icon"><Icon name="calendar" size={26} /></span>
            <h3>No attendance yet</h3>
            <p>Click <b>Take today's attendance</b>. Everyone starts as present, so you only tap the students who are late or absent.</p>
          </div>
        ) : view === 'roll' ? (
          <>
            <div className="att-day-head">
              <div>
                <h3>{longDate(current.date)}</h3>
                <span className="att-day-sub">{current.period === 'MID' ? 'Midterms' : 'Finals'}{current.label ? ` · ${current.label}` : ''}</span>
              </div>
              <div className="att-tally">
                <span className="t-p"><b>{c.P}</b> Present</span>
                <span className="t-l"><b>{c.L}</b> Late</span>
                <span className="t-a"><b>{c.A}</b> Absent</span>
                {c.E > 0 && <span className="t-e"><b>{c.E}</b> Excused</span>}
                {c.none > 0 && <span className="t-n"><b>{c.none}</b> Unmarked</span>}
              </div>
              <div className="att-day-actions">
                <button className="btn" onClick={() => markEveryone(current, 'P')}><Icon name="check" size={15} /> All present</button>
                <button className="btn" onClick={() => setEditing({ id: current.id, date: current.date, period: current.period, label: current.label || '' })}><Icon name="edit" size={15} /> Edit</button>
                <button className="btn att-del" onClick={() => removeSession(current)}><Icon name="trash" size={15} /> Delete session</button>
              </div>
            </div>
            {editing?.id === current.id && (
              <form className="att-edit" onSubmit={saveEdit}>
                <strong>Fix this session</strong>
                <input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} required aria-label="Date" />
                <div className="segmented">
                  {[['MID', 'Midterms'], ['POST', 'Finals']].map(([k, label]) => (
                    <button key={k} type="button" className={editing.period === k ? 'active' : ''} onClick={() => setEditing({ ...editing, period: k })}>{label}</button>
                  ))}
                </div>
                <input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="Label (optional)" maxLength={40} aria-label="Label" />
                <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn primary">Save</button>
              </form>
            )}

            <div className="roll">
              {rows.map((r) => {
                const mark = r.attendance?.marks?.[current.id] || null;
                return (
                  <div key={r.student.id} className={`roll-card is-${mark || 'none'}`}>
                    <div className="roll-who">
                      <Avatar name={r.student.name} size={32} />
                      <span className="roll-name">
                        <span className="sname" title={r.student.name}>{r.student.name}</span>
                        <span className="sno">{r.student.studentNo}</span>
                      </span>
                    </div>
                    <div className="roll-btns" role="radiogroup" aria-label={`${r.student.name} attendance`}>
                      {['P', 'L', 'A'].map((k) => (
                        <button key={k} type="button" role="radio" aria-checked={mark === k} className={`rb rb-${k} ${mark === k ? 'on' : ''}`} onClick={() => setMark(r, current, k)}>
                          {MARK_LABEL[k]}
                        </button>
                      ))}
                    </div>
                    <span className="roll-extra">
                      <button type="button" className={`roll-exc ${mark === 'E' ? 'on' : ''}`} onClick={() => setMark(r, current, mark === 'E' ? 'P' : 'E')}>
                        {mark === 'E' ? 'Excused ✓' : 'Excused'}
                      </button>
                      {mark && (
                        <button type="button" className="roll-exc roll-clear" title="Remove this mark" onClick={() => setMark(r, current, null)}>
                          Clear
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
              {rows.length === 0 && <div className="no-results">No students match “{query}”.</div>}
            </div>
          </>
        ) : (
          <div className="table-wrap">
            <table className="record att-table">
              <thead>
                <tr>
                  <th className="sticky-col">Student</th>
                  {[...sessions].sort((a, b) => a.date.localeCompare(b.date)).map((s) => (
                    <th key={s.id} className={`att-col ${s.date === todayIso ? 'is-today' : ''}`}>
                      <button type="button" className="att-col-btn" onClick={() => { setPick(s.id); setView('roll'); }} title="Open this session">
                        <span className="att-day">{s.date === todayIso ? 'Today' : dayName(s.date)}</span>
                        <span className="att-date">{fmtDate(s.date)}</span>
                      </button>
                    </th>
                  ))}
                  <th className="att-sum gstart">Midterms</th>
                  <th className="att-sum">Finals</th>
                  <th className="att-sum">Absent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const a = r.attendance || {};
                  const sum = (p) => (a.items?.[p] ? `${a.items[p].score}/${a.items[p].max}` : '—');
                  return (
                    <tr key={r.student.id}>
                      <td className="sticky-col">
                        <div className="student-cell">
                          <Avatar name={r.student.name} size={26} />
                          <span className="att-name">
                            <span className="sname" title={r.student.name}>{r.student.name}</span>
                            <span className="sno">{r.student.studentNo}</span>
                          </span>
                        </div>
                      </td>
                      {[...sessions].sort((x, y) => x.date.localeCompare(y.date)).map((s) => {
                        const m = a.marks?.[s.id] || null;
                        return <td key={s.id} className="att-cell"><i className={`mark mark-${m || 'none'}`} title={MARK_LABEL[m] || 'Not marked'}>{m || '·'}</i></td>;
                      })}
                      <td className="att-sum gstart num">{sum('MID')}</td>
                      <td className="att-sum num">{sum('POST')}</td>
                      <td className={`att-sum num ${a.counts?.A ? 'has-abs' : ''}`}>{a.counts?.A ?? 0}{a.counts?.L ? <small> +{a.counts.L}L</small> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
