import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChartCard, ChartEmpty, Columns, Donut, Line, RankList } from '../Charts.jsx';
import { api, meetingsOn, roomLabel, schedule, todayCode } from '../api.js';
import { useAuth } from '../auth.jsx';
import { NewSectionModal, deleteSection } from '../Roster.jsx';
import Timetable, { LoadingReportModal, sectionColors } from '../Timetable.jsx';
import { DownloadButton, EmptyState, ErrorState, Icon, PageLoader, firstName, greeting, titleCase, useUI } from '../ui.jsx';
import { Bento, HeroTile, MiniStat, NextClass, Tile, WeekTile } from '../Bento.jsx';

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
// Students who may need help this term: failing the current grade, 3+ absences, or 2+ missing scores.
const RISK_TEXT = { failing: 'Failing', absences: 'Absences', missing: 'Missing work' };
function AtRiskPanel({ sections, colors }) {
  const [filter, setFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const all = sections.flatMap((s) => (s.atRisk || []).map((r) => ({ ...r, section: s })));
  const count = (k) => all.filter((r) => r.reasons.includes(k)).length;
  const list = (filter === 'all' ? all : all.filter((r) => r.reasons.includes(filter))).sort(
    (a, b) => b.reasons.length - a.reasons.length || (a.percent ?? 0) - (b.percent ?? 0)
  );
  const shown = showAll ? list : list.slice(0, 8);

  return (
    <section className="card risk">
      <header className="risk-head">
        <div>
          <span className="t2-kicker">Needs attention</span>
          <h2>{all.length ? `${all.length} student${all.length === 1 ? '' : 's'} at risk` : 'No students at risk'}</h2>
          <span className="t2-sub">Failing the current grade, {3}+ absences, or {2}+ missing scores this term</span>
        </div>
        {all.length > 0 && (
          <div className="seg" role="tablist">
            {['all', 'failing', 'absences', 'missing'].map((k) => (
              <button key={k} role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setShowAll(false); }}>
                {k === 'all' ? 'All' : RISK_TEXT[k]} <b>{k === 'all' ? all.length : count(k)}</b>
              </button>
            ))}
          </div>
        )}
      </header>
      {all.length === 0 ? (
        <p className="risk-empty"><Icon name="check" size={16} /> Everyone is passing, with fewer than 3 absences and no missing work.</p>
      ) : (
        <>
          <ul className="risk-list">
            {shown.map((r) => (
              <li key={`${r.section.id}-${r.student.id}`}>
                <Link to={`/faculty/sections/${r.section.id}`} className="risk-row">
                  <span className={`risk-sec sc-${colors.get(r.section.id) ?? 0}`}>{r.section.code}</span>
                  <span className="risk-who">
                    <strong>{titleCase(r.student.name)}</strong>
                    <small>{r.student.studentNo}</small>
                  </span>
                  <span className="risk-tags">
                    {r.reasons.includes('failing') && (
                      <span className="risk-tag fail">{r.term === 'final' ? 'Final' : 'Midterm'} {r.percent != null ? `${r.percent.toFixed(1)}%` : ''} · {r.equivalent}</span>
                    )}
                    {r.reasons.includes('absences') && <span className="risk-tag abs">{r.absences} absences</span>}
                    {r.reasons.includes('missing') && (
                      <span className="risk-tag miss" title={r.missing.join(', ')}>{r.missing.length} missing: {r.missing.slice(0, 3).join(', ')}{r.missing.length > 3 ? '…' : ''}</span>
                    )}
                  </span>
                  <Icon name="chevronRight" size={16} />
                </Link>
              </li>
            ))}
          </ul>
          {list.length > 8 && (
            <button className="link-btn risk-more" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${list.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}


// Every section this term as a compact row: code, subject, students, current average.
function ClassesTile({ sections, colors, onNew }) {
  return (
    <Tile area="classes" className="classes-tile" title="My classes" sub={`${sections.length} section${sections.length === 1 ? '' : 's'} this term`} action={<button type="button" className="tile-link" onClick={onNew}><Icon name="plus" size={14} /> New</button>}>
      <ul className="class-rows">
        {sections.map((s) => {
          const avg = currentAvg(s);
          return (
            <li key={s.id}>
              <Link to={`/faculty/sections/${s.id}`} className={`class-row sc-${colors.get(s.id) ?? 0}`}>
                <span className="cr-code">{s.code.replace(/^[A-Z]+/, '') || s.code}</span>
                <span className="cr-main">
                  <strong>{s.code}</strong>
                  <small>{titleCase(s.subjectTitle || s.subjectCode || '')}</small>
                </span>
                <span className="cr-meta"><Icon name="users" size={13} /> {s.studentCount}</span>
                <span className="cr-avg">
                  <b>{avg == null ? '—' : `${avg.toFixed(1)}%`}</b>
                  <i><em style={{ width: `${Math.min(100, avg || 0)}%` }} /></i>
                </span>
                <span className={`cr-pub ${s.published ? 'on' : ''}`} title={s.published ? 'Visible to students' : 'Hidden from students'}><Icon name={s.published ? 'eye' : 'eyeOff'} size={14} /></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}

// Equivalents from best to worst (4.0 … 1.0, then R); pass/fail scales after.
const eqRank = (eq) => (eq === 'R' || eq === 'Repeat' ? -1 : Number.isFinite(Number(eq)) ? Number(eq) : -0.5);
const isFail = (eq) => eq === 'R' || eq === 'Repeat' || eq === 'F' || eq === 'Failed';
// The grade that matters now: the final once Finals has items, the midterm before.
const currentAvg = (s) => (s.finalsItemCount || s.gradingMode === 'final' ? s.finalAverage : s.midtermAverage);
const pct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);
// Shades of blue for the grade donut (best = darkest), gold for failing.
const DONUT_BLUES = ['#1f2a72', '#27348b', '#4352a8', '#6573bd', '#8995cf', '#aeb6df', '#d0d5ec']; // NU blue, darkest = best grade

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
    <>
      <ChartCard className="ga-trend" title="Attendance trend" sub="Present or late, all sections, by class day">
        {trend.length > 6 ? <Line points={trend} height={210} /> : trend.length ? <Columns data={trend.map((p) => ({ ...p, value: p.value ?? 0 }))} height={190} unit="%" /> : <ChartEmpty icon={<Icon name="calendar" size={22} />} title="No attendance yet" action={<Link className="btn" to="/faculty?view=sections">Open a section</Link>}>Take attendance in a section and the rate per class day shows here.</ChartEmpty>}
      </ChartCard>
      <ChartCard className="ga-grades" title="Grade distribution" sub={graded ? `${graded} students this term` : 'This term'}>
        {graded ? <Donut parts={parts} center={graded} centerLabel="students" /> : <ChartEmpty icon={<Icon name="award" size={22} />} title="No grades yet">The spread of grades appears once scores are encoded.</ChartEmpty>}
      </ChartCard>
      <ChartCard className="ga-top" title="Top sections" sub="By class average">
        {ranked.length ? <RankList items={ranked} /> : <ChartEmpty icon={<Icon name="chart" size={22} />} title="No rankings yet">Sections are ranked by class average once they have scores.</ChartEmpty>}
      </ChartCard>
    </>
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
          {sections.length === 0 ? (
            <>
              <Bento layout="solo">
                <HeroTile meta="Faculty" title={<>{greeting()}, <span className="accent">{firstName(user.name)}</span></>} lead="Create your first section to get started." actions={newButton} />
              </Bento>
              <EmptyState title="No sections yet">
                Create a section and import its class list from a PDF.
              </EmptyState>
            </>
          ) : (
            <Bento layout="faculty">
              <HeroTile
                meta={latest?.label}
                title={<>{greeting()}, <span className="accent">{firstName(user.name)}</span></>}
                lead={todayLine(current)}
                actions={newButton}
              >
                <NextClass sections={current} />
              </HeroTile>
              <MiniStat area="s1" tone="blue" icon="layers" label="Sections" value={current.length} meter={current.length ? (published / current.length) * 100 : 0} sub={published ? `${published} of ${current.length} visible` : 'None visible yet'} />
              <MiniStat area="s2" tone="gold" icon="users" label="Students" value={students} sub={`about ${current.length ? Math.round(students / current.length) : 0} per section`} />
              <MiniStat area="s3" tone="green" icon="chart" label="Class average" value={termAverage == null ? '—' : <>{termAverage.toFixed(1)}<small>%</small></>} meter={termAverage ?? undefined} sub={avgs.length ? `${avgs.length} of ${current.length} with scores` : 'No scores yet'} />
              <MiniStat area="s4" tone="rose" icon="check" label="Attendance" value={att.all ? <>{Math.round((att.ok / att.all) * 1000) / 10}<small>%</small></> : '—'} meter={att.all ? (att.ok / att.all) * 100 : undefined} sub={att.all ? `${att.all - att.ok} absence${att.all - att.ok === 1 ? '' : 's'}` : 'Not taken yet'} />
              <ClassesTile sections={current} colors={colors} onNew={() => setCreating(true)} />
              <WeekTile sections={current} colors={colors} onOpen={() => pick('schedule')} />
              <DashCharts sections={current} />
              <div className="tile-plain" style={{ gridArea: 'risk' }}>
                <AtRiskPanel sections={current} colors={colors} />
              </div>
            </Bento>
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
