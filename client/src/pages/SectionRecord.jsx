import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, COMPONENTS, PERIODS, fmt, groupItems, schedule, sortItems } from '../api.js';
import { AddStudentsModal, ImportResultModal, deleteSection } from '../Roster.jsx';
import { EditSectionModal } from '../SectionForm.jsx';
import { ACCOUNT_LABEL, StudentAccountsModal } from '../StudentAccounts.jsx';
import { AttendanceView } from '../Attendance.jsx';
import { Avatar, EmptyState, EqBadge, ErrorState, Hero, Icon, Modal, PageLoader, Stat, titleCase, useUI } from '../ui.jsx';

const SCALE = ['4.0', '3.5', '3.0', '2.5', '2.0', '1.5', '1.0', 'R'];
const PASS_SCALE = ['Pass', 'Repeat'];
const isFail = (eq) => eq === 'R' || eq === 'Repeat';
const periodLabel = (p) => (p === 'MID' ? 'Midterms' : 'Post Midterms');

export default function SectionRecord() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, confirm } = useUI();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState(null); // 'item' | 'weights' | 'students'
  const [resetInfo, setResetInfo] = useState(null);
  const [importResult, setImportResult] = useState(location.state?.result || null);
  const [view, setView] = useState('grades'); // 'grades' | 'attendance'

  useEffect(() => {
    api(`/faculty/sections/${id}`).then(setData).catch((e) => setError(e.message));
    // Drop the one-time import result from history so a refresh doesn't show it again.
    if (location.state?.result) navigate(location.pathname, { replace: true, state: null });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => (data ? sortItems(data.items) : []), [data]);
  const groups = useMemo(() => groupItems(items), [items]);
  // First item of each component group gets a vertical rule.
  const groupStarts = useMemo(() => new Set(groups.map((g) => g.items[0].id)), [groups]);
  const closePanel = useCallback(() => setPanel(null), []);

  const summary = useMemo(() => {
    if (!data) return null;
    const rows = data.rows;
    const avg = (k) => (rows.length ? rows.reduce((s, r) => s + (r.grades[k].percent || 0), 0) / rows.length : null);
    const pf = rows.some((r) => PASS_SCALE.includes(r.grades.final.equivalent));
    const dist = (pf ? PASS_SCALE : SCALE).map((eq) => ({ eq, n: rows.filter((r) => r.grades.final.equivalent === eq).length }));
    const passing = rows.filter((r) => !isFail(r.grades.final.equivalent)).length;
    return { mid: avg('midterm'), fin: avg('final'), dist, passing };
  }, [data]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <PageLoader />;

  const { section } = data;
  const q = query.trim().toLowerCase();
  const rows = data.rows.filter((r) => `${r.student.name} ${r.student.studentNo}`.toLowerCase().includes(q));

  async function patchSection(body) {
    try {
      setData(await api(`/faculty/sections/${id}`, { method: 'PATCH', body }));
      if ('published' in body) toast(body.published ? 'Grades are now visible to students' : 'Grades are hidden from students');
      else toast('Grade percentages saved');
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    }
  }

  async function saveScore(studentId, itemId, score) {
    const d = await api(`/faculty/sections/${id}/scores`, { method: 'PUT', body: { studentId, itemId, score } });
    setData((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => {
        if (r.student.id !== studentId) return r;
        const next = { ...r, grades: d.grades };
        if (itemId === 'bonus') next.bonus = score ?? 0;
        else {
          next.scores = { ...r.scores };
          if (score === null) delete next.scores[itemId];
          else next.scores[itemId] = score;
        }
        return next;
      }),
    }));
  }

  async function removeItem(item) {
    const ok = await confirm({
      title: `Delete "${item.label}"?`,
      message: `This deletes the ${item.component} item and all of its scores. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      setData(await api(`/faculty/sections/${id}/items/${item.id}`, { method: 'DELETE' }));
      toast(`Deleted ${item.label}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function resetPassword(student) {
    const ok = await confirm({
      title: 'Reset password?',
      message: `A new temporary password will be created for ${titleCase(student.name)}. Their current password will stop working.`,
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    try {
      const d = await api(`/faculty/sections/${id}/students/${student.id}/reset-password`, { method: 'POST' });
      setResetInfo({ ...d, name: student.name });
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function removeStudent(student) {
    const ok = await confirm({
      title: `Remove from ${section.code}?`,
      message: `${titleCase(student.name)} and their scores in this section will be removed. Their account and other sections are not affected.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      setData(await api(`/faculty/sections/${id}/students/${student.id}`, { method: 'DELETE' }));
      toast(`Removed ${titleCase(student.name)}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const maxDist = Math.max(1, ...summary.dist.map((d) => d.n));

  return (
    <>
      <Hero
        back={<Link to="/faculty" className="back"><Icon name="arrowLeft" size={15} /> Sections</Link>}
        eyebrow={[section.subjectCode, section.term, section.academicYear && `A.Y. ${section.academicYear}`].filter(Boolean).join(' · ')}
        title={<>{section.code}{section.subjectTitle && <span className="thin">{titleCase(section.subjectTitle)}</span>}</>}
        actions={
          <>
            <label className="switch">
              <input type="checkbox" checked={section.published} onChange={(e) => patchSection({ published: e.target.checked }).catch(() => {})} />
              <span className="switch-track" />
              <span>{section.published ? 'Visible to students' : 'Hidden from students'}</span>
            </label>
            <button className="btn" onClick={() => setPanel('details')}>
              <Icon name="edit" size={16} /> Details
            </button>
            <a className="btn" href={`/api/faculty/export?section=${encodeURIComponent(id)}`} download title="This section's grading sheet in the class record format">
              <Icon name="download" size={16} /> Export
            </a>
            <button className="btn" onClick={() => setPanel('students')}>
              <Icon name="userPlus" size={16} /> Students
            </button>
            <button className="btn" onClick={() => setPanel('accounts')}>
              <Icon name="mail" size={16} /> Student accounts
            </button>
            <button className="btn" onClick={() => setPanel('weights')}>
              <Icon name="sliders" size={16} /> Percentage
            </button>
            <button className="btn primary" onClick={() => setPanel('item')}>
              <Icon name="plus" size={16} /> Item
            </button>
            <button
              className="btn icon-only danger-ghost"
              title={`Delete ${section.code}`}
              aria-label={`Delete ${section.code}`}
              onClick={async () => {
                if (await deleteSection(section, { confirm, toast }, { students: data.rows.length, items: data.items.length })) navigate('/faculty', { replace: true });
              }}
            >
              <Icon name="trash" size={16} />
            </button>
          </>
        }
      >
        <div className="meta-pills">
          {schedule(section).map((x, i) => (
            <span key={i} className="meta-pill">
              <Icon name="calendar" size={14} />
              {x.day}{x.time && ` · ${x.time}`}{x.room && ` · Room ${x.room}`}
            </span>
          ))}
          {section.units != null && <span className="meta-pill"><Icon name="book" size={14} />{section.units} units</span>}
          {schedule(section).length === 0 && (
            <button className="meta-pill link-pill" onClick={() => setPanel('details')}><Icon name="plus" size={14} />Add schedule</button>
          )}
        </div>
      </Hero>

      <div className="container lift">
        <div className="stats record-stats">
          <Stat icon="users" label="Students" value={data.rows.length} />
          <Stat icon="chart" label="Class average · Midterm" value={<>{fmt(summary.mid)}<small>%</small></>} />
          <Stat icon="award" label="Class average · Final" value={<>{fmt(summary.fin)}<small>%</small></>} />
          <Stat
            icon="check"
            label="Passing · Final"
            value={<>{summary.passing}<small> / {data.rows.length}</small></>}
            sub={data.rows.length ? `${Math.round((summary.passing / data.rows.length) * 100)}% of the class` : null}
          />
          <div className="stat dist">
            <div className="dist-head">
              <span className="stat-label">Distribution · Final grade</span>
            </div>
            <div className="hist">
              {summary.dist.map((d) => (
                <div key={d.eq} className={`hist-col ${isFail(d.eq) ? 'fail' : ''} ${d.n ? '' : 'zero'}`} title={`${d.eq}: ${d.n} students`}>
                  <span className="hist-n">{d.n || ''}</span>
                  <span className="hist-track"><span className="hist-bar" style={{ height: `${(d.n / maxDist) * 100}%` }} /></span>
                  <span className="hist-label">{d.eq}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {data.rows.length === 0 ? (
          <div style={{ marginTop: 18 }}>
            <EmptyState icon="users" title="No students in this section yet">
              Import the class list from a PDF to start encoding scores.
              <br />
              <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setPanel('students')}>
                <Icon name="upload" size={16} /> Import class list
              </button>
            </EmptyState>
          </div>
        ) : (
          <>
          <div className="view-tabs" role="tablist">
            <button role="tab" aria-selected={view === 'grades'} onClick={() => setView('grades')}>
              <Icon name="list" size={15} /> Grades
            </button>
            <button role="tab" aria-selected={view === 'attendance'} onClick={() => setView('attendance')}>
              <Icon name="calendar" size={15} /> Attendance
              {section.attendance?.sessions?.length > 0 && <span className="count-badge">{section.attendance.sessions.length}</span>}
            </button>
          </div>
          {view === 'attendance' ? (
            <AttendanceView sectionId={id} data={data} setData={setData} query={query} setQuery={setQuery} />
          ) : (
          <div className="card table-card">
            <div className="table-toolbar">
              <span className="input-icon">
                <Icon name="search" />
                <input placeholder="Search by name or ID number…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </span>
              <div className="toolbar-meta">
                <span>{rows.length} students</span>
                <span className="hide-sm"><kbd>Enter</kbd> / <kbd>↑</kbd><kbd>↓</kbd> to move</span>
              </div>
            </div>

            <div className="table-wrap">
              <table className="record">
                <thead>
                  <tr>
                    <th rowSpan={3} className="sticky-col">Student</th>
                    {groups.map((g) => (
                      <th key={g.key} colSpan={g.items.length} className={`grp grp-${g.component}`}>
                        {g.component}
                        {g.period && <small> · {periodLabel(g.period)}</small>}
                      </th>
                    ))}
                    <th rowSpan={3} className="grp grp-BONUS">Bonus</th>
                    <th rowSpan={3} className="grp grp-GRADE">Midterm</th>
                    <th rowSpan={3} className="grp-GRADE">Final</th>
                    <th rowSpan={3} className="gstart"></th>
                  </tr>
                  <tr>
                    {items.map((it) => (
                      <th key={it.id} className={`item-head ${groupStarts.has(it.id) ? 'gstart' : ''} ${it.virtual ? 'virtual' : ''}`}>
                        {it.virtual ? (
                          <button className="att-head" title="From the Attendance tab" onClick={() => setView('attendance')}>
                            <Icon name="calendar" size={12} /> Attend.
                          </button>
                        ) : (
                          <>
                            <span>{it.label}</span>
                            <button className="x" title={`Delete ${it.label}`} onClick={() => removeItem(it)}>
                              <Icon name="x" size={12} strokeWidth={2.5} />
                            </button>
                          </>
                        )}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {items.map((it) => (
                      <th key={it.id} className={`max ${groupStarts.has(it.id) ? 'gstart' : ''}`}>/{it.max}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={r.student.id}>
                      <td className="sticky-col">
                        <div className="student-cell">
                          <span className="row-index">{ri + 1}</span>
                          <Avatar name={r.student.name} size={30} />
                          <div style={{ minWidth: 0 }}>
                            <div className="sname" title={[r.student.name, r.student.email].filter(Boolean).join('\n')}>{r.student.name}</div>
                            <div className="sno">
                              {r.student.studentNo}
                              <i className={`acct-dot acct-${r.student.account}`} title={`Account: ${ACCOUNT_LABEL[r.student.account] || r.student.account}`} />
                            </div>
                          </div>
                        </div>
                      </td>
                      {items.map((it, ci) => (
                        <td key={it.id} className={groupStarts.has(it.id) ? 'gstart' : undefined}>
                          {it.virtual ? (
                            // Computed from attendance; a student's own max is lower when excused.
                            <span className="cell ro" title={`Attendance: ${r.scores[it.id] ?? 0} / ${r.attendance?.items?.[it.period]?.max ?? it.max}`}>
                              {r.scores[it.id] ?? 0}
                            </span>
                          ) : (
                            <ScoreCell row={ri} col={ci} value={r.scores[it.id]} max={it.max} onSave={(v) => saveScore(r.student.id, it.id, v)} />
                          )}
                        </td>
                      ))}
                      <td className="gstart">
                        <ScoreCell row={ri} col={items.length} bonus value={r.bonus || undefined} onSave={(v) => saveScore(r.student.id, 'bonus', v)} />
                      </td>
                      <td className="gstart grade-col">
                        <span className="grade-cell"><span className="num">{fmt(r.grades.midterm.percent)}</span><EqBadge eq={r.grades.midterm.equivalent} /></span>
                      </td>
                      <td className="grade-col">
                        <span className="grade-cell"><span className="num">{fmt(r.grades.final.percent)}</span><EqBadge eq={r.grades.final.equivalent} /></span>
                      </td>
                      <td className="gstart">
                        <button className="icon-btn" title="Reset password" onClick={() => resetPassword(r.student)}>
                          <Icon name="key" size={16} />
                        </button>
                        <button className="icon-btn danger" title="Remove from section" onClick={() => removeStudent(r.student)}>
                          <Icon name="userMinus" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <div className="no-results">No students match “{query}”.</div>}
            </div>
          </div>
          )}
          </>
        )}
      </div>

      {panel === 'item' && (
        <AddItem
          onClose={closePanel}
          onAdd={async (body) => {
            setData(await api(`/faculty/sections/${id}/items`, { method: 'POST', body }));
            setPanel(null);
            toast(`Added ${body.label}`);
          }}
        />
      )}
      {panel === 'weights' && (
        <Weights weights={section.weights} onClose={closePanel} onSave={(weights) => patchSection({ weights }).then(closePanel)} />
      )}
      {panel === 'details' && (
        <EditSectionModal
          section={section}
          onClose={closePanel}
          onSaved={(d) => {
            setData(d);
            setPanel(null);
            toast('Section details saved');
          }}
        />
      )}
      {panel === 'students' && (
        <AddStudentsModal
          section={section}
          onClose={closePanel}
          onDone={({ result, ...detail }) => {
            setData(detail);
            setPanel(null);
            setImportResult(result);
          }}
        />
      )}
      {importResult && (
        <ImportResultModal
          sectionCode={section.code}
          result={importResult}
          onClose={() => setImportResult(null)}
          onSendAccounts={() => {
            setImportResult(null);
            setPanel('accounts');
          }}
        />
      )}
      {panel === 'accounts' && (
        <StudentAccountsModal
          section={section}
          onClose={closePanel}
          onDone={() => api(`/faculty/sections/${id}`).then(setData).catch(() => {})}
        />
      )}

      {resetInfo && (
        <Modal title="New temporary password" subtitle="This is shown only once." icon="key" onClose={() => setResetInfo(null)} width={440}
          footer={<button className="btn primary" onClick={() => setResetInfo(null)}>Done</button>}
        >
          {resetInfo.mail?.sent ? (
            <div className="alert ok"><Icon name="check" />Emailed to <strong>{resetInfo.email}</strong>.</div>
          ) : resetInfo.mail?.configured && resetInfo.email ? (
            <div className="alert error"><Icon name="alert" />The email could not be sent ({resetInfo.mail.error}). Give the student this password.</div>
          ) : (
            <div className="alert info"><Icon name="info" />{resetInfo.email ? 'Email is not set up, so' : 'This student has no email on file, so'} give them this password yourself.</div>
          )}
          <div className="cred-who">
            <Avatar name={resetInfo.name} size={42} />
            <div><strong>{resetInfo.name}</strong><span className="muted small">The student will change it at their next login.</span></div>
          </div>
          <div className="cred-box">
            <div className="cred-row"><span>Username</span><code>{resetInfo.username}</code></div>
            <div className="cred-row">
              <span>Password</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <code className="big">{resetInfo.tempPassword}</code>
                <button className="icon-btn" title="Copy" onClick={() => navigator.clipboard.writeText(resetInfo.tempPassword).then(() => toast('Password copied'))}>
                  <Icon name="copy" size={16} />
                </button>
              </span>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function focusCell(row, col) {
  const el = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
  if (el) {
    el.focus();
    el.select();
  }
}

function ScoreCell({ value, max, onSave, row, col, bonus }) {
  const [text, setText] = useState(value ?? '');
  const [state, setState] = useState(''); // '' | 'saving' | 'saved' | 'error'
  useEffect(() => setText(value ?? ''), [value]);
  useEffect(() => {
    if (state !== 'saved') return;
    const t = setTimeout(() => setState(''), 900);
    return () => clearTimeout(t);
  }, [state]);

  async function commit() {
    const trimmed = String(text).trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if ((value ?? null) === next) return;
    if (next !== null && (!Number.isFinite(next) || next < 0 || (max && next > max))) {
      setState('error');
      return;
    }
    setState('saving');
    try {
      await onSave(next);
      setState('saved');
    } catch {
      setState('error');
    }
  }

  return (
    <input
      className={`cell ${state} ${bonus ? 'bonus' : ''}`}
      data-row={row}
      data-col={col}
      inputMode="decimal"
      value={text}
      placeholder="·"
      title={state === 'error' ? `Must be between 0 and ${max ?? '∞'}` : undefined}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setText(e.target.value);
        setState('');
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault();
          focusCell(row + (e.shiftKey ? -1 : 1), col);
          if (e.key === 'Enter' && !document.querySelector(`.cell[data-row="${row + 1}"][data-col="${col}"]`)) e.currentTarget.blur();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          focusCell(row - 1, col);
        } else if (e.key === 'Escape') {
          setText(value ?? '');
          setState('');
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function AddItem({ onAdd, onClose }) {
  const [form, setForm] = useState({ component: 'CP', period: 'MID', label: '', max: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const usesPeriod = form.component === 'CP' || form.component === 'EA';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onAdd({ ...form, period: usesPeriod ? form.period : form.component === 'CPT' ? 'POST' : 'MID', max: Number(form.max) });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New item"
      subtitle="A quiz, activity, or performance task with a max score."
      icon="plus"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" form="add-item" disabled={busy}>{busy ? 'Adding…' : 'Add item'}</button>
        </>
      }
    >
      <form id="add-item" onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
        <div className="field">
          <span className="field-label">Component</span>
          <div className="choice-grid">
            {COMPONENTS.map((c) => (
              <label key={c.key} className={`choice grp-${c.key} ${form.component === c.key ? 'active' : ''}`}>
                <input type="radio" name="component" value={c.key} checked={form.component === c.key} onChange={set('component')} />
                <span className="choice-key">{c.key}</span>
                <span className="choice-name">{c.name}</span>
              </label>
            ))}
          </div>
        </div>
        {usesPeriod && (
          <div className="field">
            <span className="field-label">Period</span>
            <div className="segmented">
              {Object.entries(PERIODS).map(([k, v]) => (
                <button type="button" key={k} className={form.period === k ? 'active' : ''} onClick={() => setForm({ ...form, period: k })}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="row-2">
          <label className="field">
            <span>Label</span>
            <input value={form.label} onChange={set('label')} placeholder="e.g. Q5 or Act 9" required autoFocus />
          </label>
          <label className="field">
            <span>Max score</span>
            <input type="number" min="1" value={form.max} onChange={set('max')} placeholder="20" required />
          </label>
        </div>
        {error && <div className="alert error"><Icon name="alert" />{error}</div>}
      </form>
    </Modal>
  );
}

function Weights({ weights, onSave, onClose }) {
  const [w, setW] = useState(structuredClone(weights));
  const [busy, setBusy] = useState(false);
  const set = (period, k) => (e) => setW({ ...w, [period]: { ...w[period], [k]: e.target.value } });
  const total = (p) => Object.values(w[p]).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <Modal
      title="Percentage allocation"
      subtitle="Each grade must add up to 100%."
      icon="sliders"
      onClose={onClose}
      width={580}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onSave(w).catch(() => setBusy(false));
            }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="weights-grid">
        {['midterm', 'final'].map((p) => {
          const t = total(p);
          return (
            <div key={p} className="weight-block">
              <div className="weight-block-head">
                <strong>{p === 'midterm' ? 'Midterm Grade' : 'Final Grade'}</strong>
                <span className={`weight-total ${t === 100 ? 'ok' : 'bad'}`}>{t}%</span>
              </div>
              <div className="weight-inputs">
                {['CP', 'EA', 'MPT', 'CPT'].map((k) => (
                  <label key={k} className={`weight-input grp-${k}`}>
                    <span>{k}</span>
                    {p === 'midterm' && k === 'CPT' ? (
                      <div className="na">—</div>
                    ) : (
                      <div className="pct">
                        <input type="number" min="0" max="100" value={w[p][k] ?? 0} onChange={set(p, k)} />
                      </div>
                    )}
                  </label>
                ))}
              </div>
              <div className={`weight-meter ${t > 100 ? 'over' : ''}`}>
                <span style={{ width: `${Math.min(100, t)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
