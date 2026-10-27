import { useEffect, useState } from 'react';
import { api, COMPONENTS, schedule, termOf } from '../api.js';
import { useAuth } from '../auth.jsx';
import { EmptyState, ErrorState, Hero, PageLoader, Ring, eqTone, splitName, titleCase } from '../ui.jsx';

const NAME = Object.fromEntries(COMPONENTS.map((c) => [c.key, c.name]));
const fmtPct = (p) => (p == null ? '—' : `${Number(p).toFixed(2)}%`);

export default function StudentRecords() {
  const { user } = useAuth();
  const [records, setRecords] = useState(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    api('/me/records')
      .then((d) => setRecords(d.records))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!records) return <PageLoader />;

  const record = records[Math.min(active, records.length - 1)];

  return (
    <>
      <Hero
        eyebrow={`Grade breakdown · ${user.username}`}
        title={<>Your <span className="accent">grades.</span></>}
        lead="Every quiz, activity and exam behind your midterm and final grade."
      />
      <div className="container">
        {records.length === 0 ? (
          <EmptyState icon="book" title="No published records yet">
            Your grades will appear here once your faculty publishes them. Please check back later.
          </EmptyState>
        ) : (
          <div className="report">
            {records.length > 1 && (
              <div className="section-switch" role="tablist">
                {records.map((r, i) => (
                  <button key={r.section.id} role="tab" aria-selected={r === record} onClick={() => setActive(i)}>
                    {r.section.code} · {r.section.subjectCode}
                  </button>
                ))}
              </div>
            )}
            <Report key={record.section.id} record={record} name={user.name} />
          </div>
        )}
      </div>
    </>
  );
}

function Report({ record, name }) {
  const { section, grades, scores, bonus, items } = record;
  const w = section.weights || {};
  const { first, last } = splitName(name);
  const pick = (component, period) => items.filter((i) => i.component === component && termOf(i) === period);
  // Finals shows up once the faculty has added finals items.
  const finalsOpen = items.some((i) => termOf(i) === 'POST');
  const [view, setView] = useState(finalsOpen ? 'POST' : 'MID');
  const tab = finalsOpen ? view : 'MID';
  const current = tab === 'MID' ? grades.midterm : grades.final;
  const fail = eqTone(current.equivalent) === 'fail';
  const sched = schedule(section).map((x) => [x.day, x.time, x.room && `Rm ${x.room}`].filter(Boolean).join(' · ')).filter(Boolean);
  const details = [
    ['Section', section.code],
    ['Subject', [section.subjectCode, section.subjectTitle && titleCase(section.subjectTitle)].filter(Boolean).join(' · ')],
    ['Term', [section.term, section.academicYear && `A.Y. ${section.academicYear}`].filter(Boolean).join(' · ')],
    ['Schedule', sched.join('\n')],
  ].filter(([, v]) => v);

  return (
    <>
      <section className={`spotlight ${fail ? 'spotlight-muted' : ''}`}>
        <div>
          <p className="hello">Hello, student</p>
          <h2>
            {first} {last && <span>{last}</span>}
          </h2>
          <dl className="info-grid">
            {details.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="grade-pair">
          <GradeTile label="Midterm grade" grade={grades.midterm} active={tab === 'MID'} />
          {finalsOpen ? (
            <GradeTile label="Final grade" grade={grades.final} active={tab === 'POST'} />
          ) : (
            <div className="grade-tile pending">
              <span className="grade-tile-label">Final grade</span>
              <span className="pending-text">After midterms</span>
            </div>
          )}
        </div>
      </section>

      <div className="term-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'MID'} onClick={() => setView('MID')}>
          Midterms <small>{fmtPct(grades.midterm.percent)}</small>
        </button>
        {finalsOpen && (
          <button role="tab" aria-selected={tab === 'POST'} onClick={() => setView('POST')}>
            Finals <small>{fmtPct(grades.final.percent)}</small>
          </button>
        )}
      </div>

      {tab === 'MID' ? (
        <Term
          key="MID"
          title="Midterms"
          weeks="Weeks 1 – 7"
          grade={grades.midterm}
          groups={[
            { key: 'CP', items: pick('CP', 'MID'), weight: w.midterm?.CP },
            { key: 'EA', items: pick('EA', 'MID'), weight: w.midterm?.EA },
            { key: 'MPT', items: pick('MPT', 'MID'), weight: w.midterm?.MPT },
          ]}
          scores={scores}
          footer={<p className="note">Items without a score (—) count as 0. If a score looks off, message your instructor.</p>}
        />
      ) : (
        <Term
          key="POST"
          title="Finals"
          weeks="Weeks 8 – 13"
          grade={grades.final}
          groups={[
            { key: 'CP', items: pick('CP', 'POST'), weight: w.final?.CP },
            { key: 'EA', items: pick('EA', 'POST'), weight: w.final?.EA },
            { key: 'CPT', items: pick('CPT', 'POST'), weight: w.final?.CPT },
          ]}
          scores={scores}
          footer={
            <>
              {bonus > 0 && <p className="bonus">Bonus: <strong>+{bonus}</strong> added to your final grade.</p>}
              <p className="note">
                Your final grade counts every CP and EA item from both terms, plus the MPT ({w.final?.MPT ?? 0}%) and CPT. Items
                without a score (—) count as 0. If a score looks off, message your instructor.
              </p>
            </>
          }
        />
      )}
    </>
  );
}

function GradeTile({ label, grade, active }) {
  return (
    <div className={`grade-tile ${active ? 'active' : ''}`}>
      <span className="grade-tile-label">{label}</span>
      <Ring mini size={92} stroke={8} percent={grade.percent} eq={grade.equivalent} />
      <span className="grade-tile-pct">{fmtPct(grade.percent)}</span>
    </div>
  );
}

function Term({ title, weeks, grade, groups, scores, footer }) {
  const shown = groups.filter((g) => g.items.length);
  return (
    <section className="term term-wide">
      <div className="term-head">
        <div>
          <h3>{title}</h3>
          <p className="weeks">{weeks}</p>
        </div>
        <span className="term-grade">
          <strong>{fmtPct(grade.percent)}</strong>
          <span className={`mini-gp ${eqTone(grade.equivalent) === 'fail' ? 'fail' : ''}`}>GP {grade.equivalent ?? '—'}</span>
        </span>
      </div>
      {shown.length === 0 && <p className="note">No graded items yet.</p>}
      <div className="group-grid">
      {shown.map((g) => {
        const got = g.items.reduce((s, i) => s + (scores[i.id] ?? 0), 0);
        const max = g.items.reduce((s, i) => s + i.max, 0);
        return (
          <div key={g.key} className={`group grp-${g.key}`}>
            <div className="group-head">
              <span className="gdot" />
              <h4>{NAME[g.key]}</h4>
              {g.weight != null && <span className="group-weight">{g.weight}%</span>}
              <span className="group-total">{got}<small> / {max}</small></span>
            </div>
            <ul>
              {g.items.map((i) => {
                const v = scores[i.id];
                const ratio = v == null ? 0 : v / i.max;
                return (
                  <li key={i.id} className={`bar-row ${v == null ? 'missing' : ratio < 0.6 ? 'low' : ''}`}>
                    <span className="bar-label" title={i.label}>{i.label}</span>
                    <span className="bar"><span className="bar-fill" style={{ width: `${Math.min(1, ratio) * 100}%` }} /></span>
                    <span className="bar-score">{v ?? '—'}<small> / {i.max}</small></span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      </div>
      {footer}
    </section>
  );
}
