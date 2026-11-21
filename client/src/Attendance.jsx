import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { Avatar, Icon, Modal, useUI } from './ui.jsx';

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
  const [checkin, setCheckin] = useState(null); // session whose check-in code is on screen

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
                <button className={`btn ${current.checkinOpen ? 'ci-on' : ''}`} onClick={() => setCheckin(current)} title="Students mark themselves with a code on the screen">
                  <Icon name="clock" size={15} /> {current.checkinOpen ? 'Check-in running' : 'Check-in code'}
                </button>
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
      {checkin && (
        <CheckinModal
          sectionId={sectionId}
          session={checkin}
          counts={counts[checkin.id]}
          onClose={() => {
            setCheckin(null);
            api(`/faculty/sections/${sectionId}`).then(setData).catch(() => {}); // pick up who checked in
          }}
          onChanged={(d) => (d ? setData(d) : api(`/faculty/sections/${sectionId}`).then(setData).catch(() => {}))}
        />
      )}
    </div>
  );
}

// Self check-in for one session: a 6-digit code that changes every 30 seconds, shown big for the class.
// Students type it under "Check in" on their page; present until the late time, late after.
export function CheckinModal({ sectionId, session, counts, onClose, onChanged }) {
  const { toast, confirm } = useUI();
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState({ minutes: 30, lateAfter: 15, clear: counts && counts.P > 0 && counts.L + counts.A + counts.E === 0 });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const base = `/faculty/sections/${sectionId}/attendance/sessions/${session.id}/checkin`;

  // Poll while open: the code, and who has checked in.
  useEffect(() => {
    let alive = true;
    let timer;
    const load = () =>
      api(base)
        .then((d) => alive && setStatus({ ...d, fetchedAt: Date.now() }))
        .catch(() => {})
        .finally(() => { if (alive) timer = setTimeout(load, 3000); });
    load();
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [base]);

  async function start() {
    setBusy(true);
    try {
      // Everyone starts as present when a session is added; clear that so only students who check in count.
      if (setup.clear) await api(`/faculty/sections/${sectionId}/attendance/marks`, { method: 'PUT', body: { sessionId: session.id, mark: null }, label: 'Clearing marks…' });
      const d = await api(base, { method: 'POST', body: { minutes: setup.minutes, lateAfter: setup.lateAfter }, label: 'Opening check-in…' });
      setStatus({ ...d, fetchedAt: Date.now() });
      onChanged?.();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    const rest = status?.counts?.none || 0;
    let markRest = false;
    if (rest > 0)
      markRest = await confirm({
        title: 'Close check-in',
        message: `${rest} student${rest === 1 ? ' has' : 's have'} not checked in. Mark ${rest === 1 ? 'them' : 'them all'} absent? Choose Cancel to leave ${rest === 1 ? 'that student' : 'them'} unmarked.`,
        confirmLabel: 'Mark absent',
      });
    setBusy(true);
    try {
      const d = await api(`${base}${markRest ? '?rest=A' : ''}`, { method: 'DELETE', label: 'Closing check-in…' });
      onChanged?.(d);
      toast(markRest ? `Check-in closed; ${rest} marked absent` : 'Check-in closed');
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const open = status?.open;
  const c = status?.counts || { P: 0, L: 0, A: 0, E: 0, none: 0 };
  const left = open ? Math.max(0, status.nextChange - (now - status.fetchedAt)) : 0;
  const mins = (d) => Math.max(0, Math.ceil((new Date(d) - now) / 60000));
  const late = open && new Date(status.lateAt) <= now;

  return (
    <Modal
      title="Check-in code"
      subtitle={`${longDate(session.date)}${session.label ? ` · ${session.label}` : ''}`}
      icon="clock"
      width={520}
      onClose={onClose}
      footer={
        open ? (
          <>
            <button className="btn" onClick={onClose}>Hide (keeps running)</button>
            <button className="btn primary" disabled={busy} onClick={stop}>Close check-in</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={busy || !status} onClick={start}><Icon name="clock" size={16} /> Start check-in</button>
          </>
        )
      }
    >
      {!status ? null : open ? (
        <div className="ci-live">
          <p className="ci-how">Students open the Class Record, tap <b>Check in</b> and type this code:</p>
          <div className="ci-code" aria-live="polite">{status.code.slice(0, 3)} {status.code.slice(3)}</div>
          <div className="ci-timer"><span style={{ width: `${(left / 30000) * 100}%` }} /></div>
          <p className="ci-sub">New code in {Math.ceil(left / 1000)}s · {late ? 'now marking Late' : `Present for ${mins(status.lateAt)} more min, then Late`} · closes in {mins(status.until)} min</p>
          <div className="att-tally ci-tally">
            <span className="t-p"><b>{c.P}</b> Present</span>
            <span className="t-l"><b>{c.L}</b> Late</span>
            <span className="t-n"><b>{c.none + c.A}</b> Not yet</span>
          </div>
        </div>
      ) : (
        <div className="ci-setup">
          <p className="muted small">Show a code on the screen; students type it on their phone to mark themselves. The code changes every 30 seconds, so it can&apos;t be passed to someone who isn&apos;t in class.</p>
          <label className="field">
            <span>Keep open for</span>
            <select value={setup.minutes} onChange={(e) => setSetup({ ...setup, minutes: Number(e.target.value), lateAfter: Math.min(setup.lateAfter, Number(e.target.value)) })}>
              {[10, 15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </label>
          <label className="field">
            <span>Mark as Late after</span>
            <select value={setup.lateAfter} onChange={(e) => setSetup({ ...setup, lateAfter: Number(e.target.value) })}>
              {[0, 5, 10, 15, 20, 30, 45, 60, 90].filter((m) => m <= setup.minutes).map((m) => <option key={m} value={m}>{m === 0 ? 'Right away (everyone Late)' : `${m} minutes`}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={setup.clear} onChange={(e) => setSetup({ ...setup, clear: e.target.checked })} />
            <span>
              <strong>Start with nobody marked</strong>
              <small>Clears this session&apos;s marks first, so only students who check in are present. Leave it off to keep marks you already made.</small>
            </span>
          </label>
        </div>
      )}
    </Modal>
  );
}
