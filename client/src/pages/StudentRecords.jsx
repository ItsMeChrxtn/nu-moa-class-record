import { useEffect, useState } from 'react';
import { api, COMPONENTS, gradeBreakdown, roomLabel, schedule, termOf, track } from '../api.js';
import { useAuth } from '../auth.jsx';
import { EmptyState, ErrorState, Icon, PageLoader, Ring, Stat, WelcomeBanner, displayName, eqTone, firstName, titleCase, useUI } from '../ui.jsx';
import { BarRows, ChartCard, ChartEmpty, Donut } from '../Charts.jsx';
import { downloadCertificate } from '../certificate.js';

const NAME = Object.fromEntries(COMPONENTS.map((c) => [c.key, c.name]));
const fmtPct = (p) => (p == null ? '—' : `${Number(p).toFixed(2)}%`);
const TERMS = {
  MID: { name: 'Midterms', weeks: 'Weeks 1 – 7', parts: ['CP', 'EA', 'MPT'], weights: 'midterm' },
  POST: { name: 'Finals', weeks: 'Weeks 8 – 13', parts: ['CP', 'EA', 'CPT'], weights: 'final' },
};

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
  // Each class's latest grade: the final once finals items exist, else the midterm.
  const latest = records.map((r) => {
    const finals = r.section.gradingMode === 'final' || r.items.some((it) => termOf(it) === 'POST');
    return { r, finals, g: finals ? r.grades.final : r.grades.midterm };
  });
  const withPct = latest.filter((x) => x.g.percent != null);
  const avg = withPct.length ? withPct.reduce((a, x) => a + x.g.percent, 0) / withPct.length : null;
  const att = records.reduce((a, r) => { const c = r.attendance?.counts || {}; for (const k of ['P', 'L', 'A', 'E']) a[k] += c[k] || 0; return a; }, { P: 0, L: 0, A: 0, E: 0 });
  const attAll = att.P + att.L + att.A;
  const certs = latest.reduce((a, x) => a + (x.r.grades.midterm.percent != null && x.r.section.gradingMode !== 'final' ? 1 : 0) + (x.finals && x.r.grades.final.percent != null ? 1 : 0), 0);

  return (
    <div className="container dash">
      <WelcomeBanner
        eyebrow={`Student · ${user.username}`}
        title={<>Hello, <span className="accent">{firstName(user.name)}</span> 👋</>}
        lead={records.length ? `You have ${records.length} class${records.length === 1 ? '' : 'es'} with published grades. Here is how you are doing.` : 'Your grades will appear here once your faculty publishes them.'}
      />
      {records.length > 0 && (
        <>
          <div className="kpi-row">
            <Stat tone="blue" icon="book" label="Classes" value={records.length} sub="with published grades" />
            <Stat tone="gold" icon="chart" label="Average" value={<>{avg == null ? '—' : avg.toFixed(1)}<small>%</small></>} sub="latest grade per class" />
            <Stat tone="blue" icon="check" label="Attendance" value={<>{attAll ? Math.round(((att.P + att.L) / attAll) * 100) : '—'}<small>%</small></>} sub={`${att.A} absent · ${att.L} late`} />
            <Stat tone="gold" icon="award" label="Certificates" value={certs} sub="ready to download" />
          </div>
          <div className="dash-grid student-grid">
            <ChartCard className="dash-wide" title="My grades" sub="Latest grade per class, percent">
              <BarRows series={['Grade']} threshold={60} thresholdLabel="Passing" rows={latest.map((x) => ({ label: x.r.section.code, sub: `${titleCase(x.r.section.subjectTitle || '')} · ${x.finals ? 'Final' : 'Midterm'} · GP ${x.g.equivalent ?? '—'}`, values: [x.g.percent] }))} />
            </ChartCard>
            <ChartCard title="Attendance" sub="All classes">
              {att.P + att.L + att.A + att.E ? (
                <Donut parts={[{ label: 'Present', value: att.P, color: 'var(--c1)' }, { label: 'Late', value: att.L, color: 'var(--c2)' }, { label: 'Absent', value: att.A, color: 'var(--red)' }, { label: 'Excused', value: att.E, color: 'var(--c3)' }]} center={att.P + att.L + att.A + att.E} centerLabel="sessions" size={130} />
              ) : <ChartEmpty>No attendance yet.</ChartEmpty>}
            </ChartCard>
          </div>
        </>
      )}
      <div>
        {records.length === 0 ? (
          <EmptyState icon="book" title="No published records yet">
            Your grades will appear here once your faculty publishes them. Please check back later.
          </EmptyState>
        ) : (
          <div className="report">
            {records.length > 1 && (
              <div className="class-picker" role="tablist" aria-label="Your classes">
                {records.map((r, i) => {
                  // The latest grade: the final once finals items exist, else the midterm.
                  const finals = r.items.some((it) => termOf(it) === 'POST');
                  const g = finals ? r.grades.final : r.grades.midterm;
                  return (
                    <button key={r.section.id} role="tab" aria-selected={r === record} onClick={() => setActive(i)}>
                      <span className="class-code">{r.section.code}</span>
                      <span className="class-subject">{titleCase(r.section.subjectTitle || r.section.subjectCode || '')}</span>
                      <span className="class-grade">
                        <small>{finals ? 'Final' : 'Midterm'}</small>
                        <strong>{fmtPct(g.percent)}</strong>
                        <span className={`mini-gp ${eqTone(g.equivalent) === 'fail' ? 'fail' : ''}`}>GP {g.equivalent ?? '—'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <Report key={record.section.id} record={record} user={user} />
          </div>
        )}
      </div>
    </div>
  );
}

// One class: banner (class + both grades), then the chosen term's scores beside its summary.
function Report({ record, user }) {
  const { section, grades, items } = record;
  // A final-only subject has a final grade and nothing else; otherwise finals show up once the
  // faculty has added finals items.
  const finalOnly = section.gradingMode === 'final';
  const finalsOpen = finalOnly ? items.length > 0 : items.some((i) => termOf(i) === 'POST');
  const [view, setView] = useState(finalsOpen ? 'POST' : 'MID');
  const term = finalOnly ? 'POST' : finalsOpen ? view : 'MID';
  const sched = schedule(section).map((x) => [x.day, x.time, x.room && roomLabel(x.room)].filter(Boolean).join(' · ')).filter(Boolean);

  return (
    <>
      <section className="sr-banner">
        <div className="sr-banner-main">
          <span className="sr-kicker">{[section.code, section.subjectCode].filter(Boolean).join(' · ')}</span>
          <h2>{titleCase(section.subjectTitle || section.code)}</h2>
          <dl className="sr-facts">
            <div>
              <dt>Term</dt>
              <dd>{[section.term, section.academicYear && `A.Y. ${section.academicYear}`].filter(Boolean).join(' · ') || '—'}</dd>
            </div>
            <div>
              <dt>Faculty</dt>
              <dd>{section.faculty ? displayName(section.faculty) : '—'}</dd>
            </div>
            <div className="wide">
              <dt>Schedule</dt>
              <dd>{sched.length ? sched.map((s) => <span key={s}>{s}</span>) : '—'}</dd>
            </div>
          </dl>
        </div>
        <div className="sr-grades">
          {!finalOnly && <GradeTile label="Midterm grade" grade={grades.midterm} active={term === 'MID'} onClick={() => setView('MID')} />}
          {finalsOpen ? (
            <GradeTile label="Final grade" grade={grades.final} active={term === 'POST'} onClick={() => setView('POST')} />
          ) : (
            <div className="grade-tile pending">
              <span className="grade-tile-label">Final grade</span>
              <Icon name="lock" size={22} />
              <span className="pending-text">{finalOnly ? 'No items yet' : 'After midterms'}</span>
            </div>
          )}
        </div>
      </section>

      {!finalOnly && <div className="term-tabs" role="tablist">
        <button role="tab" aria-selected={term === 'MID'} onClick={() => setView('MID')}>
          Midterms <small>{fmtPct(grades.midterm.percent)}</small>
        </button>
        {finalsOpen ? (
          <button role="tab" aria-selected={term === 'POST'} onClick={() => setView('POST')}>
            Finals <small>{fmtPct(grades.final.percent)}</small>
          </button>
        ) : (
          <span className="tab-hint"><Icon name="lock" size={14} /> Finals opens once your faculty adds finals items</span>
        )}
      </div>}

      <div className="sr-layout">
        <Scores key={term} record={record} term={term} />
        <aside className="sr-side">
          <Computation record={record} term={term} />
          <Certificates record={record} user={user} finalsOpen={finalsOpen} />
          <Attendance record={record} />
        </aside>
      </div>
    </>
  );
}

function GradeTile({ label, grade, active, onClick }) {
  return (
    <button type="button" className={`grade-tile ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="grade-tile-label">{label}</span>
      <Ring mini size={88} stroke={8} percent={grade.percent} eq={grade.equivalent} />
      <span className="grade-tile-pct">{fmtPct(grade.percent)}</span>
    </button>
  );
}

// Every item of the term, grouped by component, in one table-like list.
function Scores({ record, term }) {
  const { items, scores, section } = record;
  const t = TERMS[term];
  const w = section.weights?.[t.weights] || {};
  const finalOnly = section.gradingMode === 'final';
  const groups = t.parts.map((key) => ({ key, items: items.filter((i) => i.component === key && (finalOnly || termOf(i) === term)), weight: w[key] }));
  const grade = term === 'MID' ? record.grades.midterm : record.grades.final;

  return (
    <section className="sr-card sr-scores">
      <div className="sr-card-head">
        <div>
          <h3>{finalOnly ? 'Final grade' : t.name}</h3>
          <span className="sr-sub">{finalOnly ? 'Final only · no midterm' : t.weeks} · {t.parts.join(' · ')}</span>
        </div>
        <span className="term-grade">
          <strong>{fmtPct(grade.percent)}</strong>
          <span className={`mini-gp ${eqTone(grade.equivalent) === 'fail' ? 'fail' : ''}`}>GP {grade.equivalent ?? '—'}</span>
        </span>
      </div>

      {groups.map((g) => {
        const got = g.items.reduce((s, i) => s + (scores[i.id] ?? 0), 0);
        const max = g.items.reduce((s, i) => s + i.max, 0);
        const pct = max ? (got / max) * 100 : null;
        return (
          <div key={g.key} className={`sr-comp grp-${g.key}`}>
            <div className="sr-comp-head">
              <span className="choice-key">{g.key}</span>
              <span className="sr-comp-name">
                <strong>{NAME[g.key]}</strong>
                <small>{g.items.length} item{g.items.length === 1 ? '' : 's'}{g.weight != null ? ` · ${g.weight}% of the grade` : ''}</small>
              </span>
              <span className="sr-comp-total">
                <strong>{max ? `${got} / ${max}` : '—'}</strong>
                <small>{pct == null ? 'No items yet' : `${pct.toFixed(1)}%`}</small>
              </span>
            </div>
            {g.items.length > 0 && (
              <ul className="sr-items">
                {g.items.map((i) => {
                  const v = scores[i.id];
                  const ratio = v == null ? 0 : v / i.max;
                  return (
                    <li key={i.id} className={v == null ? 'missing' : ratio < 0.6 ? 'low' : ''}>
                      <span className="sr-item-label" title={i.label}>{i.label}</span>
                      <span className="bar"><span className="bar-fill" style={{ width: `${Math.min(1, ratio) * 100}%` }} /></span>
                      <span className="sr-item-score">{v ?? '—'}<small> / {i.max}</small></span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      <p className="sr-foot">Items without a score (—) count as 0. If a score looks off, message your instructor.</p>
    </section>
  );
}

// The term's grade as a sum: each component's share of its weight.
function Computation({ record, term }) {
  const rows = gradeBreakdown(record, term);
  const grade = term === 'MID' ? record.grades.midterm : record.grades.final;
  return (
    <section className="sr-card sr-calc">
      <h4 className="sr-side-title"><Icon name="chart" size={16} /> How your {term === 'MID' ? 'midterm' : 'final'} grade adds up</h4>
      <table>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th>
                {r.key === 'BONUS' ? 'Bonus' : r.key}
                {r.bothTerms && <small> both terms</small>}
              </th>
              <td className="muted">{r.key === 'BONUS' ? '' : r.max ? `${r.got}/${r.max} × ${r.weight}%` : `— × ${r.weight}%`}</td>
              <td>{r.key === 'BONUS' ? '+' : ''}{r.points.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2}>{term === 'MID' ? 'Midterm' : 'Final'} grade</th>
            <td>{fmtPct(grade.percent)}</td>
          </tr>
        </tfoot>
      </table>
      <span className={`sr-gp ${eqTone(grade.equivalent) === 'fail' ? 'fail' : ''}`}>Grade point {grade.equivalent ?? '—'}</span>
    </section>
  );
}

function Certificates({ record, user, finalsOpen }) {
  const { toast } = useUI();
  const [busy, setBusy] = useState('');
  const midOpen = record.items.some((i) => termOf(i) === 'MID');
  const get = async (term) => {
    setBusy(term);
    try {
      await track('Making your certificate…', () => downloadCertificate(record, user, term));
      toast(`Your ${term === 'MID' ? 'midterm' : 'final'} grade certificate was downloaded.`, 'success', 'Certificate ready!');
    } catch {
      toast('The certificate could not be made. Please try again.', 'error');
    }
    setBusy('');
  };
  const row = (term, label, open, grade) => (
    <div className={`sr-cert-row ${open ? '' : 'locked'}`}>
      <span className="sr-cert-seal"><Icon name={open ? 'award' : 'lock'} size={18} /></span>
      <span className="sr-cert-text">
        <strong>{label}</strong>
        <small>{open ? `${fmtPct(grade.percent)} · GP ${grade.equivalent ?? '—'}` : 'Available once finals items are added'}</small>
      </span>
      {open && (
        <button className="btn" disabled={!!busy} onClick={() => get(term)} aria-label={`Download the ${label.toLowerCase()}`}>
          <Icon name="download" size={15} /> {busy === term ? '…' : 'PDF'}
        </button>
      )}
    </div>
  );
  return (
    <section className="sr-card sr-certs">
      <h4 className="sr-side-title"><Icon name="award" size={16} /> Certificates</h4>
      {record.section.gradingMode !== 'final' && row('MID', 'Midterm grade certificate', midOpen, record.grades.midterm)}
      {row('POST', 'Final grade certificate', finalsOpen, record.grades.final)}
    </section>
  );
}

function Attendance({ record }) {
  const c = record.attendance?.counts;
  const total = c ? c.P + c.L + c.A + c.E + c.none : 0;
  if (!total) return null;
  const parts = [['P', 'Present', c.P], ['L', 'Late', c.L], ['A', 'Absent', c.A + c.none], ['E', 'Excused', c.E]];
  return (
    <section className="sr-card sr-att">
      <h4 className="sr-side-title"><Icon name="calendar" size={16} /> Attendance · {total} session{total === 1 ? '' : 's'}</h4>
      <div className="sr-att-bar">
        {parts.map(([k, , n]) => n > 0 && <span key={k} className={`att-${k}`} style={{ flex: n }} />)}
      </div>
      <ul className="sr-att-legend">
        {parts.map(([k, label, n]) => (
          <li key={k}><i className={`att-${k}`} />{label}<strong>{n}</strong></li>
        ))}
      </ul>
    </section>
  );
}
