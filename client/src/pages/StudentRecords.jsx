import { useEffect, useState } from 'react';
import { api, COMPONENTS, schedule } from '../api.js';
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
  const fail = eqTone(grades.final.equivalent) === 'fail';
  const pick = (component, period) => items.filter((i) => i.component === component && (!period || i.period === period));
  const sched = schedule(section).map((x) => [x.day, x.time].filter(Boolean).join(' ')).filter(Boolean);

  return (
    <>
      <section className={`spotlight ${fail ? 'spotlight-muted' : ''}`}>
        <div>
          <p className="hello">Hello, student</p>
          <h2>
            {first} {last && <span>{last}</span>}
          </h2>
          <ul className="tags">
            <li>{section.code}</li>
            {section.subjectCode && <li>{section.subjectCode}</li>}
            {section.subjectTitle && <li>{titleCase(section.subjectTitle)}</li>}
            {(section.term || section.academicYear) && <li>{[section.term, section.academicYear].filter(Boolean).join(' ')}</li>}
            {sched.map((s) => <li key={s}>{s}</li>)}
          </ul>
          <div className="spotlight-note">
            <span><strong>Midterm grade</strong> {fmtPct(grades.midterm.percent)} · GP {grades.midterm.equivalent ?? '—'}</span>
            <span><strong>Final grade</strong> {fmtPct(grades.final.percent)} · GP {grades.final.equivalent ?? '—'}</span>
          </div>
        </div>
        <Ring label="Final grade" percent={grades.final.percent} eq={grades.final.equivalent} />
      </section>

      <div className="terms">
        <Term
          title="Midterm"
          weeks="Weeks 1 – 7"
          grade={grades.midterm}
          groups={[
            { key: 'CP', items: pick('CP', 'MID'), weight: w.midterm?.CP },
            { key: 'EA', items: pick('EA', 'MID'), weight: w.midterm?.EA },
            { key: 'MPT', items: pick('MPT'), weight: w.midterm?.MPT },
          ]}
          scores={scores}
        />
        <Term
          title="Finals"
          weeks="Weeks 8 – 13"
          grade={grades.final}
          groups={[
            { key: 'CP', items: pick('CP', 'POST'), weight: w.final?.CP },
            { key: 'EA', items: pick('EA', 'POST'), weight: w.final?.EA },
            { key: 'CPT', items: pick('CPT'), weight: w.final?.CPT },
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
      </div>
    </>
  );
}

function Term({ title, weeks, grade, groups, scores, footer }) {
  const shown = groups.filter((g) => g.items.length);
  return (
    <section className="term">
      <div className="term-head">
        <div>
          <h3>{title}</h3>
          <p className="weeks">{weeks}</p>
        </div>
        <Ring mini size={74} stroke={7} percent={grade.percent} eq={grade.equivalent} />
      </div>
      {shown.length === 0 && <p className="note">No graded items yet.</p>}
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
      {footer}
    </section>
  );
}
