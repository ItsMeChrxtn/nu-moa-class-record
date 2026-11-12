import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChartCard, ChartEmpty, Columns, Donut, Line, RankList } from '../Charts.jsx';
import { api, meetingsOn, roomLabel, schedule, todayCode } from '../api.js';
import { useAuth } from '../auth.jsx';
import { NewSectionModal, deleteSection } from '../Roster.jsx';
import Timetable, { LoadingReportModal, sectionColors } from '../Timetable.jsx';
import { DownloadButton, EmptyState, ErrorState, Icon, PageLoader, Stat, WelcomeBanner, firstName, greeting, titleCase, useUI } from '../ui.jsx';

const TERM_ORDER = ['first', 'second', 'third', 'summer'];
const termRank = (t) => {
  const i = TERM_ORDER.indexOf(String(t || '').trim().toLowerCase().split(/\s+/)[0]);
  return i < 0 ? 99 : i;
};

// Sections grouped by academic year + term: newest academic year first, terms in order within it.
function termGroups(sections) {
  const map = new Map();
  for (const s of sections) {
    const academicYear = (s.academicYear || '').trim();
    const term = (s.term || '').trim();
    const key = `${academicYear}|${term}`;
    if (!map.has(key)) {
      const ay = academicYear.replace(/\s*-\s*/, ' - ');
      const label = [academicYear ? `Academic Year ${ay}` : 'No academic year', term || 'No term'].join(' · ');
      map.set(key, { key, academicYear: s.academicYear || '', term: s.term || '', label, sections: [] });
    }
    map.get(key).sections.push(s);
  }
  return [...map.values()]
    .sort((a, b) => b.academicYear.localeCompare(a.academicYear) || termRank(a.term) - termRank(b.term))
    .map((g) => ({ ...g, sections: g.sections.sort((a, b) => a.code.localeCompare(b.code)) }));
}

// Classes that meet today, earliest first, with the one in progress or up next marked.
function TodayPanel({ sections, colors, onOpenWeek }) {
  const day = todayCode();
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const classes = sections
    .flatMap((s) => meetingsOn(s, day).map((m) => ({ ...m, s })))
    .sort((a, b) => (a.start || '99').localeCompare(b.start || '99'));
  const nextIdx = classes.findIndex((c) => toMin(c.end) == null || toMin(c.end) > mins);

  return (
    <section className="today card">
      <div className="today-head">
        <div>
          <span className="stat-label">Today · {now.toLocaleDateString(undefined, { weekday: 'long' })}</span>
          <h2>{classes.length ? `${classes.length} class${classes.length === 1 ? '' : 'es'} today` : 'No classes today'}</h2>
        </div>
        <Icon name="calendar" size={20} />
      </div>
      {classes.length === 0 ? (
        <p className="today-empty">No classes today. Your week is below.</p>
      ) : (
        <ol className="tl">
          {classes.map((c, i) => {
            const live = toMin(c.start) != null && toMin(c.start) <= mins && mins < toMin(c.end);
            const done = toMin(c.end) != null && toMin(c.end) <= mins;
            const state = live ? 'now' : done ? 'done' : i === nextIdx ? 'next' : 'later';
            const [from, to] = (c.time || '').split(' - ');
            return (
              <li key={`${c.s.id}-${i}`} className={`tl-item is-${state}`}>
                <span className="tl-time"><b>{from || '—'}</b><small>{to || ''}</small></span>
                <span className="tl-dot" aria-hidden="true" />
                <Link to={`/faculty/sections/${c.s.id}`} className="tl-card">
                  <span className="tl-main">
                    <strong>{c.s.code}</strong>
                    <span>{titleCase(c.s.subjectTitle || c.s.subjectCode || '')}</span>
                  </span>
                  {c.room && <span className="tl-room">{roomLabel(c.room)}</span>}
                  <span className={`tl-tag tag-${state}`}>{{ now: 'In class now', done: 'Done', next: 'Up next', later: 'Later' }[state]}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      <button type="button" className="week-strip" onClick={onOpenWeek} title="Open the weekly schedule">
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => {
          const n = sections.reduce((a, s) => a + meetingsOn(s, d).length, 0);
          return (
            <span key={d} className={`week-day ${d === day ? 'is-today' : ''} ${n ? '' : 'free'}`}>
              <small>{d}</small>
              <strong>{n}</strong>
            </span>
          );
        })}
        <span className="week-go">Week <Icon name="chevronRight" size={14} /></span>
      </button>
    </section>
  );
}

// Equivalents from best to worst (4.0 … 1.0, then R); pass/fail scales after.
const eqRank = (eq) => (eq === 'R' || eq === 'Repeat' ? -1 : Number.isFinite(Number(eq)) ? Number(eq) : -0.5);
const isFail = (eq) => eq === 'R' || eq === 'Repeat' || eq === 'F' || eq === 'Failed';
// The grade that matters now: the final once Finals has items, the midterm before.
const currentAvg = (s) => (s.finalsItemCount || s.gradingMode === 'final' ? s.finalAverage : s.midtermAverage);
const pct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);
// Shades of blue for the grade donut (best = darkest), gold for failing.
const DONUT_BLUES = ['#2f54eb', '#4f7cff', '#6f95ff', '#8fb0ff', '#adc5ff', '#c9d8ff', '#dfe8ff'];

// One term on a section card: class average (bar) and item count.
function TermMeter({ label, items, average, state }) {
  return (
    <div className={`term-step ${state}`} title={`${label}: ${items} item${items === 1 ? '' : 's'}${average != null ? `, class average ${average.toFixed(2)}%` : ''}`}>
      <span className="term-step-top">
        <span>{label}</span>
        <strong>{average != null ? `${average.toFixed(1)}%` : state === 'later' ? 'Not yet' : '—'}</strong>
      </span>
      <span className="term-bar"><span style={{ width: `${Math.min(100, average || 0)}%` }} /></span>
      <span className="term-step-sub">{items} item{items === 1 ? '' : 's'}</span>
    </div>
  );
}

function SectionCard({ s, color, onDelete }) {
  return (
    <Link to={`/faculty/sections/${s.id}`} className={`section-card sc-${color ?? 0}`}>
      <div className="section-card-top">
        <span className="code-badge">{s.code}</span>
        <span className="card-tools">
          <span className={`chip ${s.published ? 'ok' : ''}`}>
            <span className="dot" />
            {s.published ? 'Published' : 'Hidden'}
          </span>
          <button
            className="icon-btn danger card-delete"
            title={`Delete ${s.code}`}
            aria-label={`Delete ${s.code}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
          >
            <Icon name="trash" size={15} />
          </button>
        </span>
      </div>
      <div>
        <h3>{titleCase(s.subjectTitle || 'No subject title')}</h3>
        <div className="section-sub">{s.subjectCode}{s.units ? ` · ${s.units} units` : ''}</div>
      </div>
      <div className="sched">
        {schedule(s).map((x, j) => (
          <div key={j} className="sched-row">
            <Icon name="calendar" size={15} />
            <span className="sched-day">{x.day}</span>
            {x.time && <><Icon name="clock" size={15} /><span>{x.time}</span></>}
            {x.room && <span className="sched-room">{roomLabel(x.room)}</span>}
          </div>
        ))}
      </div>
      {s.gradingMode === 'final' ? (
        <div className="term-progress single">
          <TermMeter label="Final only" items={s.itemCount} average={s.itemCount ? s.finalAverage : null} state="now" />
        </div>
      ) : (
        <div className="term-progress">
          <TermMeter label="Midterms" items={s.itemCount - (s.finalsItemCount || 0)} average={s.midtermAverage} state={s.finalsItemCount ? 'done' : 'now'} />
          <TermMeter label="Finals" items={s.finalsItemCount || 0} average={s.finalsItemCount ? s.finalAverage : null} state={s.finalsItemCount ? 'now' : 'later'} />
        </div>
      )}
      <div className="section-foot">
        <div className="foot-stats">
          <span className="foot-stat"><Icon name="users" size={15} /><strong>{s.studentCount}</strong> students</span>
        </div>
        <span className="card-tools">
          <DownloadButton small className="btn card-export" url={`/api/faculty/export?section=${encodeURIComponent(s.id)}`} title={`Export the ${s.code} grading sheet (Excel)`}>
            Excel
          </DownloadButton>
          <Icon name="chevronRight" className="go" />
        </span>
      </div>
    </Link>
  );
}

// One academic year + term: its export button, its section cards and a New Section card.
function TermCards({ group, colors, onDelete, onNew, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`term-group ${open ? 'open' : 'closed'}`}>
      <div className="section-title-row">
        <button type="button" className="term-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Icon name="chevronDown" size={18} className="term-caret" />
          <h2>{group.label} <span className="count-badge">{group.sections.length}</span></h2>
        </button>
        <DownloadButton
          url={`/api/faculty/export?${new URLSearchParams({ academicYear: group.academicYear, term: group.term })}`}
          title={`Excel grading sheet with the ${group.sections.length} section${group.sections.length === 1 ? '' : 's'} of ${group.label}`}
        >
          Export grading sheet
        </DownloadButton>
      </div>
      {open && (
      <div className="grid">
        {group.sections.map((s) => <SectionCard key={s.id} s={s} color={colors.get(s.id)} onDelete={() => onDelete(s)} />)}
        <button className="section-card add-card" onClick={() => onNew({ academicYear: group.academicYear, term: group.term })}>
          <span className="add-icon"><Icon name="plus" size={20} /></span>
          <strong>New Section</strong>
          <span>{group.term || 'No term'} · A.Y. {group.academicYear.replace(/s*-s*/, ' - ') || '—'}</span>
        </button>
      </div>
      )}
    </section>
  );
}

// Attendance trend, grade donut and sections ranked by average, for the latest term.
function DashCharts({ sections }) {
  // Present-or-late rate per date, across every section that met that day.
  const byDate = new Map();
  for (const s of sections) for (const d of s.attendanceByDate || []) {
    const x = byDate.get(d.date) || { ok: 0, all: 0 };
    x.ok += d.ok;
    x.all += d.all;
    byDate.set(d.date, x);
  }
  const trend = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, x]) => {
      const d = new Date(`${date}T00:00:00`);
      return { label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), title: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), value: x.all ? Math.round((x.ok / x.all) * 100) : null };
    });

  const dist = {};
  for (const s of sections) for (const [eq, n] of Object.entries(s.gradeDist || {})) dist[eq] = (dist[eq] || 0) + n;
  const eqs = Object.keys(dist).sort((a, b) => eqRank(b) - eqRank(a));
  const graded = eqs.reduce((a, k) => a + dist[k], 0);
  let blue = 0;
  const parts = eqs.map((eq) => ({ label: `Grade ${eq}`, value: dist[eq], color: isFail(eq) ? 'var(--c2)' : DONUT_BLUES[Math.min(blue++, DONUT_BLUES.length - 1)] }));

  const ranked = sections
    .filter((s) => currentAvg(s) != null)
    .sort((a, b) => currentAvg(b) - currentAvg(a))
    .slice(0, 5)
    .map((s) => ({ key: s.id, code: s.code.slice(-3), title: s.code, sub: `${titleCase(s.subjectTitle || s.subjectCode || '')} · ${s.studentCount} students`, value: currentAvg(s), label: pct(currentAvg(s)) }));

  return (
    <div className="dash-grid">
      <ChartCard className="dash-wide" title="Attendance trend" sub="Present or late, all sections, by class day">
        {trend.length > 6 ? <Line points={trend} height={210} /> : trend.length ? <Columns data={trend.map((p) => ({ ...p, value: p.value ?? 0 }))} height={190} unit="%" /> : <ChartEmpty icon={<Icon name="calendar" size={22} />} title="No attendance yet" action={<Link className="btn" to="/faculty?view=sections">Open a section</Link>}>Take attendance in a section and the rate per class day shows here.</ChartEmpty>}
      </ChartCard>
      <ChartCard title="Grade distribution" sub={graded ? `${graded} students this term` : 'This term'}>
        {graded ? <Donut parts={parts} center={graded} centerLabel="students" /> : <ChartEmpty icon={<Icon name="award" size={22} />} title="No grades yet">The spread of grades appears once scores are encoded.</ChartEmpty>}
      </ChartCard>
      <ChartCard title="Top sections" sub="By class average">
        {ranked.length ? <RankList items={ranked} /> : <ChartEmpty icon={<Icon name="chart" size={22} />} title="No rankings yet">Sections are ranked by class average once they have scores.</ChartEmpty>}
      </ChartCard>
    </div>
  );
}

// "2 classes today · next: INF241 at 1:00 PM · CL3", or what comes next this week.
function todayLine(sections) {
  const day = todayCode();
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const today = sections.flatMap((s) => meetingsOn(s, day).map((m) => ({ ...m, s }))).sort((a, b) => (a.start || '99').localeCompare(b.start || '99'));
  if (!today.length) return `No classes today · ${sections.length} section${sections.length === 1 ? '' : 's'} this term`;
  const next = today.find((c) => toMin(c.end) == null || toMin(c.end) > mins);
  const count = `${today.length} class${today.length === 1 ? '' : 'es'} today`;
  if (!next) return `${count} · all done for the day`;
  const live = toMin(next.start) != null && toMin(next.start) <= mins;
  return [count, `${live ? 'now' : 'next'}: ${next.s.code}${next.time ? ` at ${next.time.split(' - ')[0]}` : ''}`, next.room && roomLabel(next.room)].filter(Boolean).join('  ·  ');
}

export default function FacultyHome() {
  const { user } = useAuth();
  const { confirm, toast } = useUI();
  const navigate = useNavigate();
  const [sections, setSections] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [workHours, setWorkHours] = useState(undefined);
  const [reporting, setReporting] = useState(false);
  // Dashboard, sections of one academic year (?view=sections&ay=…) or the weekly schedule (?view=schedule).
  const [params, setParams] = useSearchParams();
  const view = ['schedule', 'sections'].includes(params.get('view')) ? params.get('view') : 'dashboard';
  const pick = (v) => setParams(v === 'schedule' ? { view: 'schedule' } : {});

  useEffect(() => {
    api('/faculty/sections')
      .then((d) => setSections(d.sections))
      .catch((e) => setError(e.message));
    api('/faculty/schedule-blocks')
      .then((d) => {
        setBlocks(d.blocks);
        setWorkHours(d.workHours);
      })
      .catch(() => {});
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!sections) return <PageLoader />;

  const groups = termGroups(sections);
  const latest = groups[0];
  const current = latest?.sections || [];
  const students = current.reduce((s, x) => s + x.studentCount, 0);
  const published = current.filter((s) => s.published).length;
  const avgs = current.map(currentAvg).filter((v) => v != null);
  const termAverage = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  const att = current.reduce((a, s) => { for (const d of s.attendanceByDate || []) { a.ok += d.ok; a.all += d.all; } return a; }, { ok: 0, all: 0 });
  const colors = sectionColors(sections);
  // Sections page: the chosen academic year, newest by default.
  const years = [...new Set(groups.map((g) => g.academicYear.trim()))];
  const ay = years.includes(params.get('ay')) ? params.get('ay') : years[0];
  // Latest term first; it starts open, older terms start folded.
  const ayGroups = groups.filter((g) => g.academicYear.trim() === ay).reverse();

  const remove = async (s) => {
    if (await deleteSection(s, { confirm, toast }, { students: s.studentCount, items: s.itemCount })) setSections((list) => list.filter((x) => x.id !== s.id));
  };
  const newButton = (
    <button className="btn primary" onClick={() => setCreating(true)}>
      <Icon name="plus" size={16} /> New Section
    </button>
  );

  return (
    <div className="container dash">
      {view === 'sections' && sections.length > 0 ? (
        <>
          <div className="page-head">
            <div>
              <p className="eyebrow">Sections</p>
              <h1>{ay ? `Academic Year ${ay.replace(/s*-s*/, ' - ')}` : 'No academic year'}</h1>
            </div>
            <div className="page-head-actions">
              <label className="ay-pick">
                <Icon name="calendar" size={15} />
                <select value={ay} onChange={(e) => setParams({ view: 'sections', ay: e.target.value })} aria-label="Academic year">
                  {years.map((y) => <option key={y} value={y}>{y ? `A.Y. ${y.replace(/s*-s*/, ' - ')}` : 'No academic year'}</option>)}
                </select>
              </label>
              {newButton}
            </div>
          </div>
          {ayGroups.map((g, i) => <TermCards key={g.key} group={g} colors={colors} onDelete={remove} onNew={setCreating} defaultOpen={i === 0} />)}
        </>
      ) : view === 'schedule' && sections.length > 0 ? (
        <>
          <div className="page-head">
            <div>
              <p className="eyebrow">{latest?.label}</p>
              <h1>Weekly schedule</h1>
            </div>
          </div>
          <Timetable sections={current} blocks={blocks} onBlocksChange={setBlocks} termLabel={latest?.label} onExport={() => setReporting(true)} workHours={workHours} onWorkHoursChange={setWorkHours} />
        </>
      ) : (
        <>
          <WelcomeBanner
            eyebrow={latest ? latest.label : 'Faculty'}
            title={<>{greeting()}, <span className="accent">{firstName(user.name)}</span></>}
            lead={todayLine(current)}
            actions={newButton}
            facts={sections.length ? [{ label: 'Sections', value: current.length }, { label: 'Students', value: students }, { label: 'Average', value: termAverage == null ? '—' : `${termAverage.toFixed(1)}%` }] : []}
          />

          {sections.length === 0 ? (
            <EmptyState title="No sections yet">
              Create a section and import its class list from a PDF.
              <br />
              <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setCreating(true)}>
                <Icon name="plus" size={16} /> New Section
              </button>
            </EmptyState>
          ) : (
            <>
              <div className="kpi-row">
                <Stat tone="blue" icon="layers" label="Sections" value={current.length} meter={current.length ? (published / current.length) * 100 : 0} sub={published ? `${published} of ${current.length} visible to students` : 'None visible to students yet'} />
                <Stat tone="gold" icon="users" label="Students" value={students} sub={`about ${current.length ? Math.round(students / current.length) : 0} per section`} />
                <Stat tone="blue" icon="chart" label="Class average" value={termAverage == null ? <span className="stat-none">No scores yet</span> : <>{termAverage.toFixed(1)}<small>%</small></>} meter={termAverage ?? undefined} sub={avgs.length ? `${avgs.length} of ${current.length} sections with scores` : 'Add items in a section to start'} />
                <Stat tone="gold" icon="check" label="Attendance" value={att.all ? <>{Math.round((att.ok / att.all) * 1000) / 10}<small>%</small></> : <span className="stat-none">Not taken yet</span>} meter={att.all ? (att.ok / att.all) * 100 : undefined} sub={att.all ? `${att.all - att.ok} absence${att.all - att.ok === 1 ? '' : 's'} recorded` : 'Take attendance in a section'} />
              </div>

              <DashCharts sections={current} />

              <TodayPanel sections={current} colors={colors} onOpenWeek={() => pick('schedule')} />
            </>
          )}
        </>
      )}

      {reporting && <LoadingReportModal term={latest} onClose={() => setReporting(false)} />}
      {creating && (
        <NewSectionModal
          sections={sections}
          preset={typeof creating === 'object' ? creating : undefined}
          onClose={() => setCreating(false)}
          onCreated={(section, result) => navigate(`/faculty/sections/${section.id}`, { state: { result } })}
        />
      )}
    </div>
  );
}
