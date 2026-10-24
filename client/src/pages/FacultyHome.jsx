import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, schedule } from '../api.js';
import { useAuth } from '../auth.jsx';
import { NewSectionModal, deleteSection } from '../Roster.jsx';
import { EmptyState, ErrorState, Hero, Icon, PageLoader, Stat, firstName, greeting, titleCase, useUI } from '../ui.jsx';

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

  const first = sections[0];
  const students = sections.reduce((s, x) => s + x.studentCount, 0);
  const items = sections.reduce((s, x) => s + x.itemCount, 0);
  const published = sections.filter((s) => s.published).length;

  return (
    <>
      <Hero
        eyebrow={first ? `${first.term} · A.Y. ${first.academicYear}` : 'Faculty'}
        title={<>{greeting()}, <span className="accent">{firstName(user.name)}.</span></>}
        lead="Choose a section to encode scores, adjust grade percentages, and publish grades to students."
        actions={
          <>
            {sections.length > 0 && (
              // Downloads one Excel file: a Summary sheet plus one sheet per section.
              <a className="btn" href="/api/faculty/export" download>
                <Icon name="download" size={16} /> Export grading sheet
              </a>
            )}
            <button className="btn primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} /> New Section
            </button>
          </>
        }
      />
      <div className="container lift">
        <div className="stats">
          <Stat icon="layers" label="Sections" value={sections.length} />
          <Stat icon="users" label="Students" value={students} sub="Across all sections" />
          <Stat icon="list" label="Graded items" value={items} />
          <Stat icon="eye" label="Published" value={<>{published}<small> / {sections.length}</small></>} sub="Visible to students" />
        </div>

        <div className="section-title-row">
          <h2>Sections <span className="count-badge">{sections.length}</span></h2>
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
          <div className="grid">
            {sections.map((s) => (
              <Link key={s.id} to={`/faculty/sections/${s.id}`} className="section-card">
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
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (await deleteSection(s, { confirm, toast }, { students: s.studentCount, items: s.itemCount }))
                          setSections((list) => list.filter((x) => x.id !== s.id));
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
                <div className="section-foot">
                  <div className="foot-stats">
                    <span className="foot-stat"><Icon name="users" size={15} /><strong>{s.studentCount}</strong> students</span>
                    <span className="foot-stat"><Icon name="list" size={15} /><strong>{s.itemCount}</strong> items</span>
                  </div>
                  <Icon name="chevronRight" className="go" />
                </div>
              </Link>
            ))}
            <button className="section-card add-card" onClick={() => setCreating(true)}>
              <span className="add-icon"><Icon name="plus" size={20} /></span>
              <strong>New Section</strong>
              <span>Import the class list from a PDF</span>
            </button>
          </div>
        )}
      </div>

      {creating && (
        <NewSectionModal
          sections={sections}
          onClose={() => setCreating(false)}
          onCreated={(section, result) => navigate(`/faculty/sections/${section.id}`, { state: { result } })}
        />
      )}
    </>
  );
}
