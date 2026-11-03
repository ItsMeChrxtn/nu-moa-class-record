import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, meetingsOn, schedule, todayCode } from '../api.js';
import { useAuth } from '../auth.jsx';
import { NewSectionModal, deleteSection } from '../Roster.jsx';
import Timetable, { LoadingReportModal, sectionColors } from '../Timetable.jsx';
import { DownloadButton, EmptyState, ErrorState, Hero, Icon, PageLoader, Stat, TodayChip, firstName, greeting, titleCase, useUI } from '../ui.jsx';

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
        <p className="today-empty">Enjoy the free day. Your sections are below.</p>
      ) : (
        <ol className="today-list">
          {classes.map((c, i) => {
            const live = toMin(c.start) != null && toMin(c.start) <= mins && mins < toMin(c.end);
            const done = toMin(c.end) != null && toMin(c.end) <= mins;
            return (
              <li key={`${c.s.id}-${i}`} className={`sc-${colors.get(c.s.id) ?? 0} ${live ? 'live' : done ? 'done' : i === nextIdx ? 'next' : ''}`}>
                <Link to={`/faculty/sections/${c.s.id}`}>
                  <span className="today-time">{c.time || 'Time not set'}</span>
                  <span className="today-code">{c.s.code}</span>
                  <span className="today-subject">{titleCase(c.s.subjectTitle || c.s.subjectCode || '')}</span>
                  <span className="today-room">{c.room ? `Rm ${c.room}` : ''}</span>
                  <span className="today-tag">{live ? 'Now' : done ? 'Done' : i === nextIdx ? 'Next' : ''}</span>
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
            {x.room && <span className="sched-room">Rm {x.room}</span>}
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
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem('faculty-view') || 'sections';
    } catch {
      return 'sections';
    }
  });
  const pick = (v) => {
    setView(v);
    try {
      localStorage.setItem('faculty-view', v);
    } catch {}
  };

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
  const students = sections.reduce((s, x) => s + x.studentCount, 0);
  const published = sections.filter((s) => s.published).length;
  // Average of this term's section averages (midterm grade until finals start).
  const current = (latest?.sections || []).map((s) => (s.finalsItemCount || s.gradingMode === 'final' ? s.finalAverage : s.midtermAverage)).filter((v) => v != null);
  const termAverage = current.length ? current.reduce((a, b) => a + b, 0) / current.length : null;
  const colors = sectionColors(sections);

  const card = (s) => (
    <SectionCard
      key={s.id}
      s={s}
      color={colors.get(s.id)}
      onDelete={async () => {
        if (await deleteSection(s, { confirm, toast }, { students: s.studentCount, items: s.itemCount }))
          setSections((list) => list.filter((x) => x.id !== s.id));
      }}
    />
  );

  return (
    <>
      <Hero
        eyebrow={latest ? latest.label : 'Faculty'}
        title={<>{greeting()}, <span className="accent">{firstName(user.name)}.</span></>}
        lead="Choose a section to encode scores, adjust grade percentages, and publish grades to students."
        actions={
          <>
            <TodayChip />
            <button className="btn primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} /> New Section
            </button>
          </>
        }
      />
      <div className="container lift">
        <div className="dash-top">
          <div className="stats stats-2x2">
            <Stat tone="blue" icon="layers" label="Sections" value={sections.length} sub={`${groups.length} term${groups.length === 1 ? '' : 's'}`} />
            <Stat tone="teal" icon="users" label="Students" value={students} sub="Across all sections" />
            <Stat
              tone="amber"
              icon="chart"
              label="Class average"
              value={<>{termAverage == null ? '—' : termAverage.toFixed(2)}<small>%</small></>}
              sub={latest ? `${latest.term || 'Latest term'} · ${current.length} section${current.length === 1 ? '' : 's'}` : null}
            />
            <Stat tone="ink" icon="eye" label="Published" value={<>{published}<small> / {sections.length}</small></>} sub="Visible to students" />
          </div>
          <TodayPanel sections={latest?.sections || []} colors={colors} onOpenWeek={() => pick('schedule')} />
        </div>

        {sections.length > 0 && (
          <div className="view-tabs home-tabs" role="tablist">
            <button role="tab" aria-selected={view === 'sections'} onClick={() => pick('sections')}>
              <Icon name="layers" size={15} /> Sections
            </button>
            <button role="tab" aria-selected={view === 'schedule'} onClick={() => pick('schedule')}>
              <Icon name="calendar" size={15} /> Weekly schedule
            </button>
          </div>
        )}

        {sections.length > 0 && view === 'schedule' ? (
          <Timetable sections={latest?.sections || []} blocks={blocks} onBlocksChange={setBlocks} termLabel={latest?.label} onExport={() => setReporting(true)} workHours={workHours} onWorkHoursChange={setWorkHours} />
        ) : sections.length === 0 ? (
          <EmptyState title="No sections yet">
            Create a section and import its class list from a PDF.
            <br />
            <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} /> New Section
            </button>
          </EmptyState>
        ) : (
          // One group per academic year + term; each exports its own Excel file so terms are never mixed.
          groups.map((g) => (
            <section key={g.key} className="term-group">
              <div className="section-title-row">
                <h2>
                  {g.label} <span className="count-badge">{g.sections.length}</span>
                </h2>
                <DownloadButton
                  url={`/api/faculty/export?${new URLSearchParams({ academicYear: g.academicYear, term: g.term })}`}
                  title={`Excel grading sheet with the ${g.sections.length} section${g.sections.length === 1 ? '' : 's'} of ${g.label}`}
                >
                  Export grading sheet
                </DownloadButton>
              </div>
              <div className="grid">
                {g.sections.map(card)}
                {/* Adds a section to this academic year + term. */}
                <button className="section-card add-card" onClick={() => setCreating({ academicYear: g.academicYear, term: g.term })}>
                  <span className="add-icon"><Icon name="plus" size={20} /></span>
                  <strong>New Section</strong>
                  <span>{g.term || 'No term'} · A.Y. {g.academicYear.replace(/\s*-\s*/, ' - ') || '—'}</span>
                </button>
              </div>
            </section>
          ))
        )}
      </div>

      {reporting && <LoadingReportModal term={latest} onClose={() => setReporting(false)} />}
      {creating && (
        <NewSectionModal
          sections={sections}
          preset={typeof creating === 'object' ? creating : undefined}
          onClose={() => setCreating(false)}
          onCreated={(section, result) => navigate(`/faculty/sections/${section.id}`, { state: { result } })}
        />
      )}
    </>
  );
}
