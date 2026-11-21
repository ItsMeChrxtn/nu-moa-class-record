import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, COMPONENTS, PERIODS, TERM_COMPONENTS, fmt, groupItems, roomLabel, schedule, sortItems, termOf } from '../api.js';
import { AddStudentsModal, ImportResultModal, deleteSection } from '../Roster.jsx';
import { EditSectionModal } from '../SectionForm.jsx';
import { ACCOUNT_LABEL, AccountsView } from '../StudentAccounts.jsx';
import { BarRows, ChartCard, ChartEmpty, Columns, Line } from '../Charts.jsx';
import { AttendanceView } from '../Attendance.jsx';
import { Avatar, DownloadButton, EmptyState, EqBadge, ErrorState, Hero, Icon, Menu, Modal, PageLoader, titleCase, useUI } from '../ui.jsx';

const SCALE = ['4.0', '3.5', '3.0', '2.5', '2.0', '1.5', '1.0', 'R'];
const PASS_SCALE = ['Pass', 'Repeat'];
const isFail = (eq) => eq === 'R' || eq === 'Repeat';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const COMPONENT_NAME = Object.fromEntries(COMPONENTS.map((c) => [c.key, c.name]));
const TERM = {
  MID: { name: 'Midterms', grade: 'midterm', gradeLabel: 'Midterm grade', weeks: 'Weeks 1–7' },
  POST: { name: 'Finals', grade: 'final', gradeLabel: 'Final grade', weeks: 'Weeks 8–13' },
};

const SHOW_LABEL = { scores: 'Scores', attendance: 'Attendance', midterm: 'Midterm grade', final: 'Final grade' };
const SHOW_HINT = {
  scores: 'Every quiz, activity and exam score',
  attendance: 'Present, late and absent marks',
  midterm: 'The computed midterm grade and its certificate',
  final: 'The computed final grade and its certificate',
};

// What students can see of this class: the class itself, then each part on its own.
function StudentView({ section, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const show = section.show || { scores: true, attendance: true, midterm: false, final: false };
  const shown = Object.keys(SHOW_LABEL).filter((k) => show[k]);
  const summary = !section.published ? 'Hidden from students' : shown.length === 4 ? 'Students see everything' : shown.length ? `Students see ${shown.length} of 4` : 'Students see nothing yet';
  return (
    <div className="sv" ref={ref}>
      <button type="button" className={`btn sv-btn ${section.published ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon name={section.published ? 'eye' : 'eyeOff'} size={16} /> {summary} <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="sv-pop" role="dialog" aria-label="What students can see">
          <label className="sv-row sv-main">
            <span><strong>Class visible to students</strong><small>Turn off to hide this whole class</small></span>
            <input type="checkbox" checked={section.published} onChange={(e) => onChange({ published: e.target.checked })} />
            <span className="switch-track" />
          </label>
          <div className={`sv-parts ${section.published ? '' : 'off'}`}>
            <span className="sv-label">What they can see</span>
            {Object.keys(SHOW_LABEL).map((k) => (
              <label key={k} className="sv-row">
                <span><strong>{SHOW_LABEL[k]}</strong><small>{SHOW_HINT[k]}</small></span>
                <input type="checkbox" checked={!!show[k]} disabled={!section.published} onChange={(e) => onChange({ show: { [k]: e.target.checked } })} />
                <span className="switch-track" />
              </label>
            ))}
          </div>
          <p className="sv-note">Students get a notification when a grade is released, and for new scores and attendance.</p>
        </div>
      )}
    </div>
  );
}

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
  const [view, setView] = useState(location.state?.view || null); // 'MID' | 'POST' | 'attendance' | 'accounts'; null = pick from the data
  const [undo, setUndo] = useState(null); // what Undo would revert: { label, count, at }
  const [history, setHistory] = useState(null); // { student, changes } for the score history popup
  const undoRef = useRef(null);

  useEffect(() => {
    api(`/faculty/sections/${id}/scores/undo`).then((d) => setUndo(d.undo)).catch(() => {});
    api(`/faculty/sections/${id}`).then(setData).catch((e) => setError(e.message));
    // Drop the one-time import result from history so a refresh doesn't show it again.
    if (location.state?.result) navigate(location.pathname, { replace: true, state: null });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+Z (outside a score being typed) undoes the last saved score change.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const el = document.activeElement;
      // In a cell with unsaved typing, let the browser undo the typing instead.
      if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !(el.classList.contains('cell') && el.dataset.saved === el.value)))) return;
      e.preventDefault();
      undoRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Opened from the faculty bell: go to that tab (also when already on this section).
  useEffect(() => {
    if (location.state?.view) {
      setView(location.state.view);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const allItems = useMemo(() => (data ? sortItems(data.items) : []), [data]);
  // Finals opens once the midterms are graded (the Midterm Performance Task has scores),
  // or when finals items already exist.
  // A final-only subject has no midterm: everything is in Finals, which is always open.
  const finalOnly = data?.section.gradingMode === 'final';
  const finalsOpen = useMemo(() => {
    if (!data) return false;
    if (data.section.gradingMode === 'final') return true;
    const mptScored = data.items.some((it) => it.component === 'MPT' && data.rows.some((r) => r.scores[it.id] != null));
    return mptScored || data.items.some((it) => !it.virtual && termOf(it) === 'POST');
  }, [data]);
  // With no choice made yet, open the latest term that is open.
  const tab = view === 'attendance' || view === 'accounts' ? view : finalOnly || (finalsOpen && view !== 'MID') ? 'POST' : 'MID';
  const term = tab === 'MID' || tab === 'POST' ? tab : finalOnly || finalsOpen ? 'POST' : 'MID';
  const items = useMemo(() => (finalOnly ? allItems : allItems.filter((it) => termOf(it) === term)), [allItems, term, finalOnly]);
  const groups = useMemo(() => groupItems(items), [items]);
  // First item of each component group gets a vertical rule.
  const groupStarts = useMemo(() => new Set(groups.map((g) => g.items[0].id)), [groups]);
  const closePanel = useCallback(() => setPanel(null), []);

  // Stats for the term on screen: the midterm grade on Midterms, the final grade on Finals.
  const summary = useMemo(() => {
    if (!data) return null;
    const rows = data.rows;
    const k = TERM[term].grade;
    const avg = rows.length ? rows.reduce((s, r) => s + (r.grades[k].percent || 0), 0) / rows.length : null;
    const pf = rows.some((r) => PASS_SCALE.includes(r.grades[k].equivalent));
    // The section's own equivalence table decides the bars (e.g. 4.0 … 1.0, R).
    const scale = data.section.gradeScale?.length ? [...data.section.gradeScale.map((s) => s.eq), 'R'] : SCALE;
    const dist = (pf ? PASS_SCALE : scale).map((eq) => ({ eq, n: rows.filter((r) => r.grades[k].equivalent === eq).length }));
    const passing = rows.filter((r) => !isFail(r.grades[k].equivalent)).length;
    return { avg, dist, passing };
  }, [data, term]);

  // Charts: class average per component for this term, and attendance per session over time.
  const insights = useMemo(() => {
    if (!data || !data.rows.length) return null;
    const PERIOD = { MID: 'Mid', POST: 'Finals' };
    const comps = groups.map((g) => {
      let got = 0, max = 0;
      for (const r of data.rows) for (const it of g.items) { got += Number(r.scores[it.id] || 0); max += it.max || 0; }
      const name = COMPONENT_NAME[g.component] || g.component;
      return { label: g.period && !finalOnly ? `${g.component} · ${PERIOD[g.period]}` : g.component, sub: `${name} · ${plural(g.items.length, 'item')}`, values: [max ? Math.round((got / max) * 1000) / 10 : null] };
    });
    const sessions = [...(data.section.attendance?.sessions || [])].sort((a, b) => a.date.localeCompare(b.date));
    const trend = sessions.map((ss) => {
      let ok = 0, all = 0;
      for (const r of data.rows) {
        const m = r.attendance?.marks?.[ss.id];
        if (m === 'P' || m === 'L') ok++;
        if (m === 'P' || m === 'L' || m === 'A') all++;
      }
      const d = new Date(`${ss.date}T00:00:00`);
      return { label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), title: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + (ss.label ? ` · ${ss.label}` : ''), value: all ? Math.round((ok / all) * 100) : null };
    });
    return { comps, trend };
  }, [data, groups, finalOnly]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <PageLoader />;

  const { section } = data;
  const q = query.trim().toLowerCase();
  const rows = data.rows.filter((r) => `${r.student.name} ${r.student.studentNo}`.toLowerCase().includes(q));
  const notSignedIn = data.rows.filter((r) => r.student.account && r.student.account !== 'active').length;

  async function patchSection(body) {
    try {
      setData(await api(`/faculty/sections/${id}`, { method: 'PATCH', body }));
      if ('published' in body) toast(body.published ? 'Students can now see this class' : 'This class is hidden from students');
      else if ('show' in body) {
        const [k, v] = Object.entries(body.show)[0];
        toast(`${SHOW_LABEL[k]} ${v ? 'shown to' : 'hidden from'} students`);
      }
      else toast('gradeScale' in body ? 'Percentages and grade scale saved' : 'Grade percentages saved');
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    }
  }

  async function saveScore(studentId, itemId, score) {
    const d = await api(`/faculty/sections/${id}/scores`, { method: 'PUT', body: { studentId, itemId, score } });
    setUndo(d.undo);
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

  async function undoLast() {
    if (!undo) return toast('Nothing to undo', 'info');
    try {
      const d = await api(`/faculty/sections/${id}/scores/undo`, { method: 'POST', label: 'Undoing…' });
      setData(d.detail);
      setUndo(d.undo);
      toast(
        d.skipped ? `${d.undone} reverted; ${d.skipped} left as is because they were changed again since.` : `Reverted: ${undo.label}`,
        d.skipped ? 'info' : 'success',
        'Undone'
      );
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  undoRef.current = undoLast;

  // Paste from Excel into the grade sheet: rows go down the student list, columns go right across the
  // items (attendance columns are skipped), starting at the cell pasted into. Returns false for a
  // single value, which the cell handles itself.
  async function pasteAt(ri, ci, text) {
    const lines = text.replace(/\r/g, '').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const grid = lines.map((l) => l.split('\t'));
    if (grid.length === 1 && grid[0].length === 1) return false;
    const editable = [
      ...items.map((it, i) => ({ col: i, itemId: it.virtual ? null : it.id, label: it.label })).filter((c) => c.itemId),
      ...(term === 'POST' ? [{ col: items.length, itemId: 'bonus', label: 'Bonus' }] : []),
    ];
    const start = editable.findIndex((c) => c.col === ci);
    const changes = [];
    let cut = 0;
    for (let r = 0; r < grid.length; r++) {
      const row = rows[ri + r];
      if (!row) { cut++; continue; }
      for (let c = 0; c < grid[r].length; c++) {
        const col = editable[start + c];
        if (!col) { cut++; continue; }
        const raw = grid[r][c].trim().replace(',', '.');
        const score = raw === '' || raw === '-' ? null : Number(raw);
        if (score !== null && !Number.isFinite(score)) {
          toast(`"${grid[r][c].trim()}" for ${titleCase(row.student.name)} (${col.label}) is not a number. Nothing was pasted.`, 'error', 'Paste stopped');
          return true;
        }
        changes.push({ studentId: row.student.id, itemId: col.itemId, score });
      }
    }
    if (!changes.length) return true;
    try {
      const d = await api(`/faculty/sections/${id}/scores/bulk`, { method: 'PUT', body: { changes }, label: `Pasting ${changes.length} scores…` });
      setData(d.detail);
      setUndo(d.undo);
      toast(
        `${d.changed} score${d.changed === 1 ? '' : 's'} changed${cut ? `; ${cut} cell${cut === 1 ? '' : 's'} past the last student or item were left out` : ''}. Press Ctrl+Z or Undo to revert.`,
        'success',
        'Pasted'
      );
    } catch (e) {
      toast(e.message, 'error', 'Paste stopped');
    }
    return true;
  }

  async function openHistory(student) {
    try {
      const d = await api(`/faculty/sections/${id}/students/${student.id}/history`);
      setHistory({ student, changes: d.changes });
    } catch (e) {
      toast(e.message, 'error');
    }
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

  async function resetPassword(student, ask = {}) {
    const ok = await confirm({
      title: 'Reset password?',
      message: `A new temporary password will be created for ${titleCase(student.name)}. This is their one account for all their classes, so their current password stops working everywhere.`,
      confirmLabel: 'Reset',
      ...ask,
    });
    if (!ok) return;
    try {
      const d = await api(`/faculty/sections/${id}/students/${student.id}/reset-password`, { method: 'POST' });
      setResetInfo({ ...d, name: student.name });
      api(`/faculty/sections/${id}`).then(setData).catch(() => {});
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // For when the email never arrived: show the current temporary password so it can be sent another way.
  async function viewTempPassword(student) {
    try {
      const d = await api(`/faculty/sections/${id}/students/${student.id}/temp-password`);
      setResetInfo({ ...d, name: student.name, viewed: true });
    } catch (e) {
      // Made before passwords were kept: it cannot be shown, so offer a new one.
      if (e.status === 410)
        return resetPassword(student, {
          title: 'Make a new temporary password?',
          message: `${titleCase(student.name)}'s temporary password was made before passwords could be viewed again, so it cannot be shown. Make a new one? It is emailed when possible, and you can copy it here.`,
          confirmLabel: 'Make new password',
        });
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
        compact
        back={<Link to="/faculty" className="back"><Icon name="arrowLeft" size={15} /> Sections</Link>}
        eyebrow={[section.subjectCode, section.term, section.academicYear && `A.Y. ${section.academicYear}`].filter(Boolean).join(' · ')}
        title={<>{section.code}{section.subjectTitle && <span className="thin">{titleCase(section.subjectTitle)}</span>}</>}
        actions={
          <>
            <StudentView section={section} onChange={(body) => patchSection(body).catch(() => {})} />
            <DownloadButton url={`/api/faculty/export?section=${encodeURIComponent(id)}`} title="This section's grading sheet in the class record format">
              Export
            </DownloadButton>
            <Menu
              label="Manage"
              icon="settings"
              items={[
                { label: 'Section details', hint: 'Code, subject, schedule, term', icon: 'edit', onClick: () => setPanel('details') },
                { label: 'Students', hint: 'Import or add to the class list', icon: 'userPlus', onClick: () => setPanel('students') },
                { label: 'Student accounts', hint: 'Send sign-in details', icon: 'mail', onClick: () => setView('accounts') },
                { label: 'Percentage & grade scale', hint: 'Weights and equivalence table', icon: 'sliders', onClick: () => setPanel('weights') },
                'divider',
                {
                  label: 'Delete section',
                  icon: 'trash',
                  danger: true,
                  onClick: async () => {
                    if (await deleteSection(section, { confirm, toast }, { students: data.rows.length, items: data.items.length })) navigate('/faculty', { replace: true });
                  },
                },
              ]}
            />
          </>
        }
      >
        <div className="meta-pills">
          {schedule(section).map((x, i) => (
            <span key={i} className="sched-chip">
              <b>{x.day}</b>
              <span className="sched-chip-time">{x.time || 'Time not set'}</span>
              {x.room && <em>{roomLabel(x.room, 'Room')}</em>}
            </span>
          ))}
          {section.units != null && <span className="sched-chip units"><b>{section.units}</b><span className="sched-chip-time">units</span></span>}
          {schedule(section).length === 0 && (
            <button className="meta-pill link-pill" onClick={() => setPanel('details')}><Icon name="plus" size={14} />Add schedule</button>
          )}
        </div>
      </Hero>

      <div className="container wide">
        <div className="kpis">
          <div className="kpi">
            <span className="kpi-label"><Icon name="users" size={14} /> Students</span>
            <b className="kpi-value">{data.rows.length}</b>
          </div>
          <div className="kpi">
            <span className="kpi-label"><Icon name={term === 'MID' ? 'chart' : 'award'} size={14} /> Class average · {TERM[term].name}</span>
            {items.length ? <b className="kpi-value">{fmt(summary.avg)}<small>%</small></b> : <b className="kpi-value kpi-none">No scores yet</b>}
          </div>
          <div className="kpi">
            <span className="kpi-label"><Icon name="check" size={14} /> Passing · {TERM[term].name}</span>
            {items.length ? (
              <>
                <b className="kpi-value">{summary.passing}<small> / {data.rows.length}</small></b>
                {data.rows.length > 0 && <span className="kpi-sub">{Math.round((summary.passing / data.rows.length) * 100)}%</span>}
              </>
            ) : <b className="kpi-value kpi-none">—</b>}
          </div>
          <div className="kpi kpi-dist">
            <span className="kpi-label">Distribution · {TERM[term].gradeLabel}</span>
            {!items.length ? <span className="kpi-empty">Grades show here once you add items and encode scores.</span> : <div className="hist">
              {summary.dist.map((d) => (
                <div key={d.eq} className={`hist-col ${isFail(d.eq) ? 'fail' : ''} ${d.n ? '' : 'zero'}`} title={`${d.eq}: ${d.n} students`}>
                  <span className="hist-n">{d.n || ''}</span>
                  <span className="hist-track"><span className="hist-bar" style={{ height: `${(d.n / maxDist) * 100}%` }} /></span>
                  <span className="hist-label">{d.eq}</span>
                </div>
              ))}
            </div>}
          </div>
        </div>

        {insights && (tab === 'MID' || tab === 'POST') && (
          <div className="dash-charts two rec-charts">
            <ChartCard title={`Average by component · ${TERM[term].name}`} sub="Class average, percent of the total score">
              {insights.comps.some((c) => c.values[0] != null) ? (
                <BarRows rows={insights.comps} series={['Class average']} threshold={60} thresholdLabel="60%" />
              ) : (
                <ChartEmpty icon={<Icon name="chart" size={22} />} title="No items yet">Add a {TERM[term].name.toLowerCase()} item and the average per component shows here.</ChartEmpty>
              )}
            </ChartCard>
            <ChartCard title="Attendance per session" sub="Present or late, percent of the class">
              {insights.trend.length > 6 ? <Line points={insights.trend} height={160} /> : insights.trend.length ? <Columns data={insights.trend.map((p) => ({ ...p, value: p.value ?? 0 }))} height={160} unit="%" /> : <ChartEmpty icon={<Icon name="calendar" size={22} />} title="No attendance yet" action={<button className="btn" onClick={() => setView('attendance')}>Take attendance</button>}>Open the Attendance tab to start the first session.</ChartEmpty>}
            </ChartCard>
          </div>
        )}

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
            {!finalOnly && (
              <button role="tab" aria-selected={tab === 'MID'} onClick={() => setView('MID')}>
                <Icon name="chart" size={15} /> Midterms
              </button>
            )}
            {finalsOpen ? (
              <button role="tab" aria-selected={tab === 'POST'} onClick={() => setView('POST')}>
                <Icon name="award" size={15} /> {finalOnly ? 'Final grade' : 'Finals'}
              </button>
            ) : (
              <span className="tab-hint">
                <Icon name="lock" size={14} /> Finals opens once the Midterm Performance Task has scores
              </span>
            )}
            <button role="tab" className="tab-end" aria-selected={tab === 'attendance'} onClick={() => setView('attendance')}>
              <Icon name="calendar" size={15} /> Attendance
              {section.attendance?.sessions?.length > 0 && <span className="count-badge">{section.attendance.sessions.length}</span>}
            </button>
            <button role="tab" aria-selected={tab === 'accounts'} onClick={() => setView('accounts')}>
              <Icon name="key" size={15} /> Accounts
              {notSignedIn > 0 && <span className="count-badge" title="Not signed in yet">{notSignedIn}</span>}
            </button>
          </div>
          {tab === 'attendance' ? (
            <AttendanceView sectionId={id} data={data} setData={setData} query={query} setQuery={setQuery} />
          ) : tab === 'accounts' ? (
            <AccountsView section={section} query={query} setQuery={setQuery} onChanged={() => api(`/faculty/sections/${id}`).then(setData).catch(() => {})} />
          ) : (
          <div className="card table-card">
            <div className="table-toolbar">
              <div className="toolbar-title">
                <strong>{finalOnly ? 'Final grade' : TERM[term].name}</strong>
                <span>{finalOnly ? 'Final only · no midterm' : TERM[term].weeks} · {TERM_COMPONENTS[term].join(' · ')}</span>
              </div>
              <div className="toolbar-right">
                <span className="input-icon">
                  <Icon name="search" />
                  <input placeholder="Search by name or ID number…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </span>
                <button className="btn" disabled={!undo} onClick={undoLast} title={undo ? `Undo: ${undo.label} (Ctrl+Z)` : 'Nothing to undo'}>
                  <Icon name="undo" size={16} /> Undo
                </button>
                <button className="btn primary" onClick={() => setPanel('item')}>
                  <Icon name="plus" size={16} /> {term === 'MID' ? 'Midterm' : 'Finals'} item
                </button>
              </div>
            </div>
            <div className="toolbar-meta table-meta">
              <span>{rows.length} students · {plural(items.filter((it) => !it.virtual).length, 'item')}</span>
              {term === 'POST' && <span>{finalOnly ? 'Final grade = CP + EA + CPT + bonus' : 'Final grade = CP & EA of both terms + MPT + CPT + bonus'}</span>}
              <span className="hide-sm"><kbd>Enter</kbd> / <kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes a column or block from Excel · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes</span>
              {undo && <span className="undo-hint" title={`Saved ${new Date(undo.at).toLocaleString()}`}>Last change: {undo.label}</span>}
            </div>

            {items.length === 0 ? (
              <EmptyState icon="list" title={`No ${term === 'MID' ? 'midterm' : 'finals'} items yet`}>
                Add a {TERM_COMPONENTS[term].map((c) => COMPONENT_NAME[c]).join(', ').replace(/, ([^,]*)$/, ' or $1')} item to start encoding scores.
                <br />
                <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setPanel('item')}>
                  <Icon name="plus" size={16} /> {term === 'MID' ? 'Midterm' : 'Finals'} item
                </button>
              </EmptyState>
            ) : (
            <div className="table-wrap">
              <table className="record">
                <thead>
                  <tr>
                    <th rowSpan={3} className="sticky-col">Student</th>
                    {groups.map((g) => (
                      <th key={g.key} colSpan={g.items.length} className={`grp grp-${g.component}`}>
                        {g.component}
                        <small> · {COMPONENT_NAME[g.component]}</small>
                      </th>
                    ))}
                    {term === 'POST' && <th rowSpan={3} className="grp grp-BONUS">Bonus</th>}
                    {term === 'POST' && !finalOnly && <th rowSpan={3} className="grp grp-REF">Midterm</th>}
                    <th rowSpan={3} className="grp grp-GRADE">{TERM[term].gradeLabel}</th>
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
                            <ScoreCell row={ri} col={ci} value={r.scores[it.id]} max={it.max} onSave={(v) => saveScore(r.student.id, it.id, v)} onPaste={(t) => pasteAt(ri, ci, t)} />
                          )}
                        </td>
                      ))}
                      {term === 'POST' && (
                        <td className="gstart">
                          <ScoreCell row={ri} col={items.length} bonus value={r.bonus || undefined} onSave={(v) => saveScore(r.student.id, 'bonus', v)} onPaste={(t) => pasteAt(ri, items.length, t)} />
                        </td>
                      )}
                      {term === 'POST' && !finalOnly && (
                        <td className="gstart ref-col">
                          <span className="grade-cell"><span className="num">{fmt(r.grades.midterm.percent)}</span><EqBadge eq={r.grades.midterm.equivalent} /></span>
                        </td>
                      )}
                      <td className="gstart grade-col">
                        <span className="grade-cell"><span className="num">{fmt(r.grades[TERM[term].grade].percent)}</span><EqBadge eq={r.grades[TERM[term].grade].equivalent} /></span>
                      </td>
                      <td className="gstart">
                        <button className="icon-btn" title="Score history" onClick={() => openHistory(r.student)}>
                          <Icon name="history" size={16} />
                        </button>
                        {(r.student.account === 'temp' || r.student.account === 'sent') && (
                          <button className="icon-btn" title="View temporary password" onClick={() => viewTempPassword(r.student)}>
                            <Icon name="eye" size={16} />
                          </button>
                        )}
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
            )}
          </div>
          )}
          </>
        )}
      </div>

      {panel === 'item' && (
        <AddItem
          term={term}
          onClose={closePanel}
          onAdd={async (body) => {
            setData(await api(`/faculty/sections/${id}/items`, { method: 'POST', body }));
            setPanel(null);
            toast(`Added ${body.label}`);
          }}
        />
      )}
      {panel === 'weights' && (
        <Weights weights={section.weights} scale={section.gradeScale} finalOnly={finalOnly} onClose={closePanel} onSave={(body) => patchSection(body).then(closePanel)} />
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
          enrolledNos={data.rows.map((r) => r.student.studentNo)}
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
            setView('accounts');
          }}
        />
      )}

      {history && (
        <Modal
          title="Score history"
          subtitle={`${titleCase(history.student.name)} · ${history.student.studentNo}`}
          icon="history"
          width={560}
          onClose={() => setHistory(null)}
          footer={<button className="btn primary" onClick={() => setHistory(null)}>Done</button>}
        >
          {history.changes.length === 0 ? (
            <p className="muted small">No score changes recorded yet. Changes are recorded from this update on.</p>
          ) : (
            <div className="hist-list">
              {history.changes.map((c) => (
                <div key={c.id} className={`hist-row ${c.undone ? 'undone' : ''}`}>
                  <div className="hist-what">
                    <strong>{c.label}</strong>
                    <span className="hist-vals">
                      <code>{c.from ?? 'blank'}</code> → <code>{c.to ?? 'blank'}</code>
                      {c.max ? <small> / {c.max}</small> : null}
                    </span>
                  </div>
                  <div className="hist-meta">
                    {c.source === 'paste' && <span className="hist-tag">Pasted</span>}
                    {c.source === 'undo' && <span className="hist-tag">Undo</span>}
                    {c.undone && <span className="hist-tag muted">Undone</span>}
                    <span>{c.by || '—'} · {new Date(c.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {resetInfo && (
        <Modal
          title={resetInfo.viewed ? 'Temporary password' : 'New temporary password'}
          subtitle={resetInfo.viewed ? 'Still valid until the student signs in and changes it.' : 'You can view it again from the grade sheet until the student signs in.'}
          icon="key" onClose={() => setResetInfo(null)} width={440}
          footer={
            <>
              <button className="btn" onClick={() => navigator.clipboard.writeText(`Student number: ${resetInfo.username}\nTemporary password: ${resetInfo.tempPassword}`).then(() => toast('Sign-in details copied'))}>
                <Icon name="copy" size={16} /> Copy sign-in details
              </button>
              <button className="btn primary" onClick={() => setResetInfo(null)}>Done</button>
            </>
          }
        >
          {resetInfo.viewed ? (
            <div className="alert info"><Icon name="info" />If the student did not get the email, copy this and send it to them another way (chat, text, or in person).</div>
          ) : resetInfo.mail?.sent ? (
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

function ScoreCell({ value, max, onSave, onPaste, row, col, bonus }) {
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
      data-saved={value ?? ''}
      inputMode="decimal"
      value={text}
      onPaste={(e) => {
        // Several cells (from Excel or Sheets): the grade sheet fills them all at once.
        const t = e.clipboardData?.getData('text/plain') || '';
        if (!/[\t\n]/.test(t.trim())) return;
        e.preventDefault();
        setText(value ?? '');
        onPaste?.(t);
      }}
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

// A new item for one term: Midterms take CP, EA or MPT; Finals take CP, EA or CPT.
function AddItem({ term, onAdd, onClose }) {
  const [form, setForm] = useState({ component: 'CP', label: '', max: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const choices = COMPONENTS.filter((c) => TERM_COMPONENTS[term].includes(c.key));
  const example = { CP: 'Quiz 1', EA: 'Activity 1', MPT: 'Midterm Exam', CPT: 'Final Project' }[form.component];

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onAdd({ ...form, period: term, max: Number(form.max) });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={term === 'MID' ? 'New midterm item' : 'New finals item'}
      subtitle={`${PERIODS[term]} · a quiz, activity, or performance task with a max score.`}
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
          <div className="choice-list">
            {choices.map((c) => (
              <label key={c.key} className={`choice grp-${c.key} ${form.component === c.key ? 'active' : ''}`}>
                <input type="radio" name="component" value={c.key} checked={form.component === c.key} onChange={set('component')} />
                <span className="choice-key">{c.key}</span>
                <span className="choice-name">{c.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="row-2">
          <label className="field">
            <span>Label</span>
            <input value={form.label} onChange={set('label')} placeholder={`e.g. ${example}`} required autoFocus />
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

// NU default grade point equivalence, shown as printed ranges ("96 - 100 → 4.0").
const DEFAULT_SCALE_ROWS = [
  { from: 96, eq: '4.0' },
  { from: 90, eq: '3.5' },
  { from: 84, eq: '3.0' },
  { from: 78, eq: '2.5' },
  { from: 72, eq: '2.0' },
  { from: 66, eq: '1.5' },
  { from: 60, eq: '1.0' },
];
const MAX_SCALE_ROWS = 7; // the class record's equivalence table has 7 rows plus R
const sameScale = (a, b) => a.length === b.length && a.every((r, i) => Number(r.from) === b[i].from && r.eq.trim() === b[i].eq);

function Weights({ weights, scale, finalOnly, onSave, onClose }) {
  // A final-only section has no midterm grade and no MPT.
  const [w, setW] = useState(() => {
    const c = structuredClone(weights);
    if (finalOnly) c.final.MPT = 0;
    return c;
  });
  // Stored thresholds are half a point below the printed start (95.5 -> "96").
  const [rows, setRows] = useState(() => (scale?.length ? scale : []).map((r) => ({ from: Math.ceil(r.min), eq: r.eq })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (period, k) => (e) => setW({ ...w, [period]: { ...w[period], [k]: e.target.value } });
  const total = (p) => Object.values(w[p]).reduce((s, v) => s + (Number(v) || 0), 0);
  const setRow = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  // Ranges must go down: each row starts below the one above it.
  const scaleError = (() => {
    if (!rows.length) return 'Add at least one grade.';
    for (const [i, r] of rows.entries()) {
      const f = Number(r.from);
      if (!(f >= 1 && f <= 100) || !Number.isInteger(f)) return `Row ${i + 1}: the range must start at a whole number from 1 to 100.`;
      if (!r.eq.trim()) return `Row ${i + 1}: enter the equivalent (e.g. 4.0).`;
      if (r.eq.trim().toUpperCase() === 'R') return '"R" is used for grades below the lowest range.';
      if (i && f >= Number(rows[i - 1].from)) return `Row ${i + 1} must start below row ${i}.`;
    }
    return '';
  })();

  async function save() {
    if (scaleError) return setError(scaleError);
    setBusy(true);
    setError('');
    const gradeScale = sameScale(rows, DEFAULT_SCALE_ROWS) ? null : rows.map((r) => ({ min: Number(r.from) - 0.5, eq: r.eq.trim() }));
    try {
      await onSave({ weights: w, gradeScale });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Percentage & grade scale"
      subtitle="Each grade must add up to 100%. The equivalence table turns percentages into grade points for this section."
      icon="sliders"
      onClose={onClose}
      width={620}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="weights-grid">
        {(finalOnly ? ['final'] : ['midterm', 'final']).map((p) => {
          const t = total(p);
          return (
            <div key={p} className="weight-block">
              <div className="weight-block-head">
                <strong>{p === 'midterm' ? 'Midterm Grade' : finalOnly ? 'Final Grade (final only)' : 'Final Grade'}</strong>
                <span className={`weight-total ${t === 100 ? 'ok' : 'bad'}`}>{t}%</span>
              </div>
              <div className="weight-inputs">
                {['CP', 'EA', 'MPT', 'CPT'].map((k) => (
                  <label key={k} className={`weight-input grp-${k}`}>
                    <span>{k}</span>
                    {(p === 'midterm' && k === 'CPT') || (finalOnly && k === 'MPT') ? (
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

        <div className="weight-block scale-block">
          <div className="weight-block-head">
            <strong>Grade Point Equivalence</strong>
            <button
              type="button"
              className="link-btn reset-link"
              onClick={() => setRows(DEFAULT_SCALE_ROWS.map((r) => ({ ...r })))}
              disabled={sameScale(rows, DEFAULT_SCALE_ROWS)}
            >
              Reset to NU default
            </button>
          </div>

          <div className="scale-head" aria-hidden="true">
            <span>Range (%)</span>
            <span>Equivalent</span>
            <span />
          </div>
          {rows.map((r, i) => {
            const to = i === 0 ? 100 : Number(rows[i - 1].from) - 1;
            return (
              <div key={i} className="scale-row">
                <span className="scale-range">
                  <input type="number" min="1" max="100" value={r.from} onChange={(e) => setRow(i, 'from', e.target.value)} aria-label={`Row ${i + 1} starts at`} />
                  <span className="scale-to">– {Number.isFinite(to) ? to : '?'}</span>
                </span>
                <input className="scale-eq" value={r.eq} maxLength={6} onChange={(e) => setRow(i, 'eq', e.target.value)} aria-label={`Row ${i + 1} equivalent`} />
                <button type="button" className="icon-btn danger" title="Remove this grade" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            );
          })}
          <div className="scale-row scale-fail">
            <span className="scale-range"><span className="scale-to">{Number(rows.at(-1)?.from) - 1 || 0} and below</span></span>
            <span className="scale-eq-fixed">R</span>
            <span />
          </div>
          {rows.length < MAX_SCALE_ROWS && (
            <button
              type="button"
              className="link-add"
              onClick={() => {
                const last = Number(rows.at(-1)?.from) || 66;
                setRows([...rows, { from: Math.max(1, last - 6), eq: '' }]);
              }}
            >
              <Icon name="plus" size={14} /> Add a grade
            </button>
          )}
          <p className="scale-note">Type where each grade starts; the lowest row is your passing grade (e.g. 75 for 75%). A percentage is rounded first: 95.5 counts as 96. Up to {MAX_SCALE_ROWS} grades, which is what the class record table holds.</p>
        </div>
        {(error || scaleError) && <div className="alert error"><Icon name="alert" />{error || scaleError}</div>}
      </div>
    </Modal>
  );
}
