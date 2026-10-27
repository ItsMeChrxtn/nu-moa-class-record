import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, schedule } from '../api.js';
import { useAuth } from '../auth.jsx';
import { NewSectionModal, deleteSection } from '../Roster.jsx';
import { EmptyState, ErrorState, Hero, Icon, PageLoader, Stat, firstName, greeting, titleCase, useUI } from '../ui.jsx';

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

export function downloadSection(id) {
  const a = Object.assign(document.createElement('a'), { href: `/api/faculty/export?section=${encodeURIComponent(id)}`, download: '' });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function SectionCard({ s, onDelete }) {
  return (
    <Link to={`/faculty/sections/${s.id}`} className="section-card">
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
      <div className="term-progress" title="Graded items per term">
        <span className={`term-step ${s.finalsItemCount ? 'done' : 'now'}`}>
          Midterms <strong>{s.itemCount - (s.finalsItemCount || 0)}</strong>
        </span>
        <span className={`term-step ${s.finalsItemCount ? 'now' : 'later'}`}>
          Finals <strong>{s.finalsItemCount || 0}</strong>
        </span>
      </div>
      <div className="section-foot">
        <div className="foot-stats">
          <span className="foot-stat"><Icon name="users" size={15} /><strong>{s.studentCount}</strong> students</span>
        </div>
        <span className="card-tools">
          <button
            className="btn card-export"
            title={`Export the ${s.code} grading sheet (Excel)`}
            onClick={(e) => {
              // The card itself is a link, so start the download without following it.
              e.preventDefault();
              e.stopPropagation();
              downloadSection(s.id);
            }}
          >
            <Icon name="download" size={14} /> Excel
          </button>
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

  useEffect(() => {
    api('/faculty/sections')
      .then((d) => setSections(d.sections))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!sections) return <PageLoader />;

  const groups = termGroups(sections);
  const latest = groups[0];
  const students = sections.reduce((s, x) => s + x.studentCount, 0);
  const items = sections.reduce((s, x) => s + x.itemCount, 0);
  const published = sections.filter((s) => s.published).length;

  const card = (s) => (
    <SectionCard
      key={s.id}
      s={s}
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
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> New Section
          </button>
        }
      />
      <div className="container lift">
        <div className="stats">
          <Stat icon="layers" label="Sections" value={sections.length} />
          <Stat icon="users" label="Students" value={students} sub="Across all sections" />
          <Stat icon="list" label="Graded items" value={items} />
          <Stat icon="eye" label="Published" value={<>{published}<small> / {sections.length}</small></>} sub="Visible to students" />
        </div>

        {sections.length === 0 ? (
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
                <a
                  className="btn"
                  href={`/api/faculty/export?${new URLSearchParams({ academicYear: g.academicYear, term: g.term })}`}
                  download
                  title={`Excel grading sheet with the ${g.sections.length} section${g.sections.length === 1 ? '' : 's'} of ${g.label}`}
                >
                  <Icon name="download" size={16} /> Export grading sheet
                </a>
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
