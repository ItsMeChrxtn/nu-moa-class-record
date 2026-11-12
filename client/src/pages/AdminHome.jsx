import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { ChartCard, ChartEmpty, Donut, Line, RankList } from '../Charts.jsx';
import { useAuth } from '../auth.jsx';
import { Avatar, EmptyState, ErrorState, Icon, Modal, PageLoader, Stat, WelcomeBanner, firstName, initials, titleCase, useUI } from '../ui.jsx';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'layers' },
  { key: 'faculty', label: 'Faculty', icon: 'users' },
  { key: 'sections', label: 'Sections', icon: 'layers' },
  { key: 'students', label: 'Students', icon: 'user' },
  { key: 'activity', label: 'Activity', icon: 'list' },
];

const ACTIONS = {
  'faculty.create': 'Added faculty',
  'faculty.update': 'Edited faculty',
  'faculty.disable': 'Disabled faculty',
  'faculty.enable': 'Re-enabled faculty',
  'faculty.delete': 'Deleted faculty',
  'faculty.reset-password': 'Reset faculty password',
  'faculty.profile': 'Updated own profile',
  'auth.forgot-password': 'Asked for a reset link',
  'auth.reset-password': 'Reset password by email',
  'admin.create': 'Created admin',
  'admin.reset-password': 'Reset admin password',
  'section.create': 'Created section',
  'section.delete': 'Deleted section',
  'section.reassign': 'Moved section',
  'section.enroll': 'Enrolled students',
  'section.publish': 'Published grades',
  'section.unpublish': 'Hid grades',
  'section.accounts': 'Set up student accounts',
  'section.grade-scale': 'Changed grade scale',
  'section.sample': 'Added sample scores',
  'item.delete': 'Deleted item',
  'student.remove': 'Removed student',
  'student.reset-password': 'Reset student password',
};
const DANGER = new Set(['section.delete', 'item.delete', 'student.remove', 'faculty.delete', 'faculty.disable']);

export function ago(date) {
  if (!date) return 'Never';
  const s = (Date.now() - new Date(date).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
const clock = (d) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
// "Today", "Yesterday", or the date, for grouping the activity log by day.
function dayLabel(d) {
  const day = new Date(d).toDateString();
  const today = new Date();
  if (day === today.toDateString()) return 'Today';
  if (day === new Date(today.getTime() - 86400000).toDateString()) return 'Yesterday';
  return new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
// [[day, entries], …] in the list's order (newest first).
function byDay(list) {
  const days = new Map();
  for (const a of list) {
    const k = dayLabel(a.at);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(a);
  }
  return [...days];
}
const TERM_ORDER = ['first', 'second', 'third', 'summer'];
const termRank = (t) => {
  const i = TERM_ORDER.indexOf(String(t || '').trim().toLowerCase().split(/\s+/)[0]);
  return i < 0 ? 99 : i;
};
const termKey = (s) => `${s.academicYear || ''}|${s.term || ''}`;

export default function AdminHome() {
  const { user } = useAuth();
  // The sidebar picks the tab (?tab=…).
  const [params] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'dashboard';
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const refresh = useCallback(() => api('/admin/overview').then(setOverview).catch((e) => setError(e.message)), []);
  useEffect(() => void refresh(), [refresh]);

  if (error) return <ErrorState message={error} />;
  if (!overview) return <PageLoader />;

  const meta = TABS.find((t) => t.key === tab);
  return (
    <div className="container dash">
      {tab === 'dashboard' ? (
        <AdminDashboard overview={overview} user={user} />
      ) : (
        <>
          <div className="page-head">
            <div>
              <p className="eyebrow">Administrator · NU MOA</p>
              <h1>{meta.label}</h1>
            </div>
          </div>
          {tab === 'faculty' && <FacultyTab onChange={refresh} mailConfigured={overview.mailConfigured} />}
          {tab === 'sections' && <SectionsTab />}
          {tab === 'students' && <StudentsTab />}
          {tab === 'activity' && <ActivityTab />}
        </>
      )}
    </div>
  );
}

// The admin dashboard: totals, activity, account status, busiest faculty and the latest actions.
function AdminDashboard({ overview, user }) {
  const [faculty, setFaculty] = useState(null);
  const [recent, setRecent] = useState(null);
  useEffect(() => {
    api('/admin/faculty').then((d) => setFaculty(d.faculty)).catch(() => setFaculty([]));
    api('/admin/activity?limit=6').then((d) => setRecent(d.activity)).catch(() => setRecent([]));
  }, []);
  const activity = (overview.activity || []).map((d) => {
    const day = new Date(`${d.day}T00:00:00`);
    return { label: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), title: day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), value: d.n };
  });
  const maxAct = Math.max(4, ...activity.map((a) => a.value));
  const notSent = Math.max(0, (overview.accounts ?? 0) - (overview.activeAccounts ?? 0) - (overview.sentAccounts ?? 0));
  const top = (faculty || []).filter((f) => f.students > 0 || f.sections > 0).sort((a, b) => b.students - a.students).slice(0, 5);
  const maxStudents = Math.max(1, ...top.map((f) => f.students));
  return (
    <>
      <WelcomeBanner
        eyebrow="Administrator · NU MOA"
        title={<>Welcome back, <span className="accent">{firstName(user.name)}</span></>}
        lead={`${overview.faculty} faculty  ·  ${overview.sections} sections  ·  ${overview.students} students`}
        actions={<Link className="btn primary" to="/admin?tab=faculty"><Icon name="userPlus" size={16} /> Faculty accounts</Link>}
      />
      <div className="kpi-row">
        <Stat tone="blue" icon="users" label="Faculty" value={overview.faculty} sub={overview.disabled ? `${overview.disabled} disabled` : 'All active'} />
        <Stat tone="gold" icon="layers" label="Sections" value={overview.sections} sub={`${overview.published} published`} />
        <Stat tone="blue" icon="user" label="Students" value={overview.students} sub={`${overview.enrollments} enrollments`} />
        <Stat tone="gold" icon="key" label="Student accounts" value={<>{overview.activeAccounts ?? 0}<small> / {overview.accounts ?? 0}</small></>} sub="signed in" />
      </div>
      <div className="dash-grid">
        <ChartCard className="dash-wide" title="Activity" sub={`Actions per day · last 14 days · ${activity.reduce((a, d) => a + d.value, 0)} total`}>
          {activity.some((d) => d.value) ? <Line points={activity} height={210} unit=" actions" max={maxAct} /> : <ChartEmpty>No activity in the last 14 days.</ChartEmpty>}
        </ChartCard>
        <ChartCard title="Student accounts" sub={`${overview.accounts ?? 0} accounts`}>
          <Donut
            parts={[
              { label: 'Signed in', value: overview.activeAccounts ?? 0, color: 'var(--c1)' },
              { label: 'Emailed', value: overview.sentAccounts ?? 0, color: 'var(--c3)' },
              { label: 'Not sent', value: notSent, color: 'var(--c2)' },
            ]}
            center={overview.accounts ?? 0}
            centerLabel="accounts"
          />
        </ChartCard>
        <ChartCard title="Top faculty" sub="By number of students">
          {faculty == null ? <ChartEmpty>Loading…</ChartEmpty> : top.length ? (
            <RankList max={maxStudents} items={top.map((f) => ({ key: f.id, code: initials(f.name), title: titleCase(f.name), sub: `${f.sections} section${f.sections === 1 ? '' : 's'}`, value: f.students, label: `${f.students}` }))} />
          ) : <ChartEmpty>No sections yet.</ChartEmpty>}
        </ChartCard>
      </div>
      <section className="card dash-table">
        <header className="dash-table-head">
          <h3>Recent activity</h3>
          <Link className="link-more" to="/admin?tab=activity">View all <Icon name="chevronRight" size={14} /></Link>
        </header>
        <div className="table-scroll">
          <table className="dtable">
            <thead><tr><th>Who</th><th>Action</th><th>What</th><th>When</th></tr></thead>
            <tbody>
              {(recent || []).map((a) => (
                <tr key={a.id}>
                  <td><span className="dt-sec"><span className="dt-tile">{initials(a.actor || '?')}</span><span><strong>{titleCase(a.actor || 'Someone')}</strong><small>{a.role}</small></span></span></td>
                  <td><span className={`pill ${/delete|remove|disable/.test(a.action) ? 'pill-warn' : 'pill-on'}`}>{ACTIONS[a.action] || a.action}</span></td>
                  <td className="dt-what">{a.target}</td>
                  <td className="muted">{new Date(a.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                </tr>
              ))}
              {recent && recent.length === 0 && <tr><td colSpan={4} className="muted">No activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// Result of emailing sign-in details through Brevo (only for faculty).
function MailStatus({ mail, to }) {
  if (!mail) return null;
  if (mail.sent)
    return <div className="alert ok"><Icon name="check" />Sign-in details were emailed to <strong>{to}</strong>.</div>;
  if (mail.configured)
    return <div className="alert error"><Icon name="alert" /><span>The email could not be sent ({mail.error}). Share the password below with them instead.</span></div>;
  return <div className="alert info"><Icon name="info" />Email sending is not set up yet, so share the password below with them.</div>;
}

function TempPasswordModal({ info, onClose }) {
  const { toast } = useUI();
  return (
    <Modal
      title={info.title}
      subtitle="This is shown only once. It is also saved in server/credentials/."
      icon="key"
      onClose={onClose}
      width={480}
      footer={<button className="btn primary" onClick={onClose}>Done</button>}
    >
      <MailStatus mail={info.mail} to={info.username} />
      <div className="cred-who">
        <Avatar name={info.name} size={42} />
        <div>
          <strong>{titleCase(info.name)}</strong>
          <span className="muted small">They must choose a new password at first sign-in.</span>
        </div>
      </div>
      <div className="cred-box">
        <div className="cred-row"><span>{info.username.includes("@") ? "Email" : "Username"}</span><code>{info.username}</code></div>
        <div className="cred-row">
          <span>Password</span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <code className="big">{info.tempPassword}</code>
            <button
              className="icon-btn"
              title="Copy"
              onClick={() => navigator.clipboard.writeText(`${info.username} / ${info.tempPassword}`).then(() => toast('Copied'))}
            >
              <Icon name="copy" size={16} />
            </button>
          </span>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Faculty ----------

function FacultyTab({ onChange, mailConfigured }) {
  const { confirm, toast } = useUI();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // {} for new, faculty object for edit
  const [shown, setShown] = useState(null);

  const load = useCallback(() => api('/admin/faculty').then((d) => setList(d.faculty)).catch((e) => setError(e.message)), []);
  useEffect(() => void load(), [load]);

  const update = (f) => setList((l) => l.map((x) => (x.id === f.id ? { ...x, ...f } : x)));

  async function resetPassword(f) {
    const ok = await confirm({
      title: 'Reset password?',
      message: `A new temporary password will be created for ${titleCase(f.name)}. Their current password will stop working.`,
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    try {
      const d = await api(`/admin/faculty/${f.id}/reset-password`, { method: 'POST' });
      update({ id: f.id, mustChangePassword: true });
      setShown({ ...d, name: f.name, title: 'New temporary password' });
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function toggleDisabled(f) {
    const disabling = !f.disabled;
    const ok = await confirm({
      title: disabling ? `Disable ${titleCase(f.name)}?` : `Re-enable ${titleCase(f.name)}?`,
      message: disabling
        ? 'They are signed out and can no longer sign in. Their sections, students and scores are kept, and students can still see published grades.'
        : 'They will be able to sign in again with their current password.',
      confirmLabel: disabling ? 'Disable account' : 'Re-enable',
      danger: disabling,
    });
    if (!ok) return;
    try {
      const d = await api(`/admin/faculty/${f.id}`, { method: 'PATCH', body: { disabled: disabling } });
      update(d.faculty);
      onChange();
      toast(disabling ? 'Account disabled' : 'Account re-enabled');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function remove(f) {
    const ok = await confirm({
      title: `Delete ${titleCase(f.name)}?`,
      message: 'This permanently deletes the faculty account. It cannot be undone.',
      confirmLabel: 'Delete account',
      danger: true,
      requireText: f.username,
    });
    if (!ok) return;
    try {
      await api(`/admin/faculty/${f.id}`, { method: 'DELETE' });
      setList((l) => l.filter((x) => x.id !== f.id));
      onChange();
      toast('Faculty account deleted');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  if (error) return <div className="alert error"><Icon name="alert" />{error}</div>;
  if (!list) return <PageLoader />;

  return (
    <section className="card table-card admin-card">
      <div className="table-toolbar">
        <h2 className="panel-title">Faculty accounts <span className="count-badge">{list.length}</span></h2>
        <div className="toolbar-actions">
          <span className={`chip ${mailConfigured ? 'ok' : ''}`} title={mailConfigured ? 'New accounts and password resets are emailed to the faculty member.' : 'Set BREVO_API_KEY and MAIL_FROM_EMAIL in server/.env to email sign-in details.'}>
            <span className="dot" />Email {mailConfigured ? 'on' : 'off'} · Brevo
          </span>
          <button className="btn primary" onClick={() => setEditing({})}>
            <Icon name="plus" size={16} /> Add faculty
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="empty-inline">No faculty yet. Add the first one.</div>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Faculty</th>
                <th>Email</th>
                <th className="num-col">Sections</th>
                <th className="num-col">Students</th>
                <th>Last sign-in</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id} className={f.disabled ? 'is-disabled' : ''}>
                  <td>
                    <div className="person">
                      <Avatar name={f.name} size={32} />
                      <strong>{titleCase(f.name)}</strong>
                    </div>
                  </td>
                  <td className="mono">
                    {f.email || (
                      <span className="no-email" title={`Signs in with the old username “${f.username}”. Edit to add their email.`}>
                        <span className="chip bad"><span className="dot" />No email</span>
                        <span className="cell-sub">{f.username}</span>
                      </span>
                    )}
                  </td>
                  <td className="num-col mono">{f.sections}</td>
                  <td className="num-col mono">{f.students}</td>
                  <td className="mono muted">{ago(f.lastLoginAt)}</td>
                  <td>
                    {f.disabled ? (
                      <span className="chip bad"><span className="dot" />Disabled</span>
                    ) : f.mustChangePassword ? (
                      <span className="chip"><span className="dot" />Temp password</span>
                    ) : (
                      <span className="chip ok"><span className="dot" />Active</span>
                    )}
                  </td>
                  <td className="row-actions">
                    <button className="icon-btn" title="Edit" onClick={() => setEditing(f)}><Icon name="edit" size={16} /></button>
                    <button className="icon-btn" title="Reset password" onClick={() => resetPassword(f)}><Icon name="key" size={16} /></button>
                    <button className={`icon-btn ${f.disabled ? '' : 'danger'}`} title={f.disabled ? 'Re-enable' : 'Disable'} onClick={() => toggleDisabled(f)}>
                      <Icon name={f.disabled ? 'unlock' : 'ban'} size={16} />
                    </button>
                    <button
                      className="icon-btn danger"
                      title={f.sections ? 'Move or delete their sections first' : 'Delete account'}
                      disabled={f.sections > 0}
                      onClick={() => remove(f)}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <FacultyForm
          faculty={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={(d) => {
            setEditing(null);
            if (d.tempPassword) {
              setList((l) => [...l, d.faculty].sort((a, b) => a.name.localeCompare(b.name)));
              setShown({ username: d.faculty.username, name: d.faculty.name, tempPassword: d.tempPassword, mail: d.mail, title: 'Faculty account created' });
              onChange();
            } else {
              update(d.faculty);
              toast('Saved');
            }
          }}
        />
      )}
      {shown && <TempPasswordModal info={shown} onClose={() => setShown(null)} />}
    </section>
  );
}

function FacultyForm({ faculty, onClose, onSaved }) {
  const [form, setForm] = useState({ name: faculty ? titleCase(faculty.name) : '', email: faculty?.email || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { name: form.name, email: form.email.trim().toLowerCase() };
    try {
      const d = faculty
        ? await api(`/admin/faculty/${faculty.id}`, { method: 'PATCH', body })
        : await api('/admin/faculty', { method: 'POST', body });
      onSaved(d);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={faculty ? 'Edit faculty' : 'Add faculty'}
      subtitle={
        faculty
          ? 'They sign in with this email. Changing it changes how they sign in.'
          : 'They sign in with their email (Gmail is fine). A temporary password is emailed to them, and they choose their own at first sign-in.'
      }
      icon={faculty ? 'edit' : 'userPlus'}
      onClose={onClose}
      width={480}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" form="faculty-form" disabled={busy}>
            {busy ? 'Saving…' : faculty ? 'Save changes' : 'Create account'}
          </button>
        </>
      }
    >
      <form id="faculty-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <label className="field">
          <span>Full name</span>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Dela Cruz, Juan P." required autoFocus />
        </label>
        <label className="field">
          <span>Email <span className="hint">(used to sign in and to receive the password)</span></span>
          <input
            type="email"
            className="mono-input"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value.replace(/\s+/g, '') }))}
            placeholder="juan.delacruz@gmail.com"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
        {error && <div className="alert error"><Icon name="alert" />{error}</div>}
      </form>
    </Modal>
  );
}

// ---------- Sections ----------

function SectionsTab() {
  const { confirm, toast } = useUI();
  const [sections, setSections] = useState(null);
  const [faculty, setFaculty] = useState([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [termFilter, setTermFilter] = useState('');

  useEffect(() => {
    Promise.all([api('/admin/sections'), api('/admin/faculty')])
      .then(([s, f]) => {
        setSections(s.sections);
        setFaculty(f.faculty);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function move(s, facultyId) {
    const to = faculty.find((f) => f.id === facultyId);
    if (!to || to.id === s.faculty?.id) return;
    const ok = await confirm({
      title: `Move ${s.code}?`,
      message: `${s.code} with its ${s.studentCount} students and all scores moves from ${titleCase(s.faculty?.name || 'nobody')} to ${titleCase(to.name)}. Only ${titleCase(to.name)} will be able to manage it.`,
      confirmLabel: 'Move section',
    });
    if (!ok) return;
    try {
      const d = await api(`/admin/sections/${s.id}`, { method: 'PATCH', body: { faculty: to.id } });
      setSections((l) => l.map((x) => (x.id === s.id ? { ...x, faculty: d.faculty } : x)));
      toast(`${s.code} moved to ${titleCase(to.name)}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  if (error) return <div className="alert error"><Icon name="alert" />{error}</div>;
  if (!sections) return <PageLoader />;
  const ql = q.trim().toLowerCase();
  // Terms present, newest academic year first, terms in order within it.
  const terms = [...new Map(sections.map((s) => [termKey(s), s])).values()]
    .sort((a, b) => (b.academicYear || '').localeCompare(a.academicYear || '') || termRank(a.term) - termRank(b.term))
    .map((s) => ({ key: termKey(s), label: [s.academicYear ? `A.Y. ${s.academicYear}` : 'No A.Y.', s.term || 'No term'].join(' · ') }));
  const rows = sections
    .filter((s) => !termFilter || termKey(s) === termFilter)
    .filter((s) => !ql || `${s.code} ${s.subjectCode} ${s.subjectTitle} ${s.faculty?.name}`.toLowerCase().includes(ql))
    .sort((a, b) => (b.academicYear || '').localeCompare(a.academicYear || '') || termRank(a.term) - termRank(b.term) || a.code.localeCompare(b.code));

  return (
    <section className="card table-card admin-card">
      <div className="table-toolbar">
        <h2 className="panel-title">All sections <span className="count-badge">{rows.length}</span></h2>
        <div className="toolbar-right">
          <select className="term-select" value={termFilter} onChange={(e) => setTermFilter(e.target.value)} aria-label="Academic year and term">
            <option value="">All terms</option>
            {terms.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <span className="input-icon">
            <Icon name="search" />
            <input placeholder="Search code, subject or faculty…" value={q} onChange={(e) => setQ(e.target.value)} />
          </span>
        </div>
      </div>
      {sections.length === 0 ? (
        <EmptyState icon="layers" title="No sections yet">Faculty create sections from their dashboard.</EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Subject</th>
                <th>Term</th>
                <th className="num-col">Students</th>
                <th className="num-col">Items</th>
                <th>Grades</th>
                <th>Faculty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td><span className="code-cell">{s.code}</span></td>
                  <td>
                    <strong className="cell-title">{titleCase(s.subjectTitle || '—')}</strong>
                    <span className="cell-sub mono">{s.subjectCode}</span>
                  </td>
                  <td className="mono muted small">{[s.term, s.academicYear].filter(Boolean).join(' ')}</td>
                  <td className="num-col mono">{s.studentCount}</td>
                  <td className="num-col mono">{s.itemCount}</td>
                  <td>{s.published ? <span className="chip ok"><span className="dot" />Published</span> : <span className="chip"><span className="dot" />Hidden</span>}</td>
                  <td>
                    <select className="owner-select" value={s.faculty?.id || ''} onChange={(e) => move(s, e.target.value)} aria-label={`Faculty for ${s.code}`}>
                      {!s.faculty && <option value="">— none —</option>}
                      {faculty.map((f) => (
                        <option key={f.id} value={f.id}>{titleCase(f.name)}{f.disabled ? ' (disabled)' : ''}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="no-results">No sections match{q ? ` “${q}”` : ' this term'}.</div>}
        </div>
      )}
    </section>
  );
}

// ---------- Students ----------

function StudentsTab() {
  const { confirm, toast } = useUI();
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api(`/admin/students?q=${encodeURIComponent(q.trim())}`).then(setData).catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function resetPassword(s) {
    const ok = await confirm({
      title: 'Reset password?',
      message: `A new temporary password will be created for ${titleCase(s.name)}. Their current password will stop working.`,
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    try {
      const d = await api(`/admin/students/${s.id}/reset-password`, { method: 'POST' });
      setShown({ ...d, name: s.name, title: 'New temporary password' });
      setData((x) => ({ ...x, students: x.students.map((y) => (y.id === s.id ? { ...y, account: { ...y.account, mustChangePassword: true } } : y)) }));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <section className="card table-card admin-card">
      <div className="table-toolbar">
        <h2 className="panel-title">Students {data && <span className="count-badge">{data.total}</span>}</h2>
        <span className="input-icon">
          <Icon name="search" />
          <input placeholder="Search by name or student number…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </span>
      </div>
      {error && <div className="alert error" style={{ margin: 16 }}><Icon name="alert" />{error}</div>}
      {!data ? (
        <PageLoader />
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Student no.</th>
                <th>Sections</th>
                <th>Last sign-in</th>
                <th>Account</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="person">
                      <Avatar name={s.name} size={30} />
                      <span>
                        <strong className="cell-title">{s.name}</strong>
                        {s.course && <span className="cell-sub mono">{s.course}</span>}
                      </span>
                    </div>
                  </td>
                  <td className="mono">{s.studentNo}</td>
                  <td>
                    <span className="mini-tags">
                      {s.sections.length ? s.sections.map((c) => <span key={c}>{c}</span>) : <span className="muted">—</span>}
                    </span>
                  </td>
                  <td className="mono muted">{s.account ? ago(s.account.lastLoginAt) : '—'}</td>
                  <td>
                    {!s.account ? (
                      <span className="chip bad"><span className="dot" />No account</span>
                    ) : s.account.mustChangePassword ? (
                      <span className="chip"><span className="dot" />Temp password</span>
                    ) : (
                      <span className="chip ok"><span className="dot" />Active</span>
                    )}
                  </td>
                  <td className="row-actions">
                    {s.account && (
                      <button className="icon-btn" title="Reset password" onClick={() => resetPassword(s)}><Icon name="key" size={16} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.students.length === 0 && <div className="no-results">{q ? `No students match “${q}”.` : 'No students yet.'}</div>}
          {data.total > data.students.length && (
            <div className="table-foot">Showing {data.students.length} of {data.total}. Search to narrow down.</div>
          )}
        </div>
      )}
      {shown && <TempPasswordModal info={shown} onClose={() => setShown(null)} />}
    </section>
  );
}

// ---------- Activity ----------

function ActivityTab() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/admin/activity').then((d) => setList(d.activity)).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert error"><Icon name="alert" />{error}</div>;
  if (!list) return <PageLoader />;

  return (
    <section className="card table-card admin-card">
      <div className="table-toolbar">
        <h2 className="panel-title">Recent activity</h2>
        <span className="toolbar-meta">Deletes, password resets, publishing and account changes</span>
      </div>
      {list.length === 0 ? (
        <div className="empty-inline">Nothing recorded yet. Actions are logged from now on.</div>
      ) : (
        byDay(list).map(([day, entries]) => (
          <div key={day} className="activity-day">
            <h3 className="activity-day-title">{day} <span className="count-badge">{entries.length}</span></h3>
            <ol className="activity">
              {entries.map((a) => (
                <li key={a.id} className={DANGER.has(a.action) ? 'danger' : ''}>
                  <span className="act-dot" />
                  <div className="act-body">
                    <p>
                      <strong>{a.actor ? titleCase(a.actor) : 'System'}</strong>
                      {a.role && <span className="act-role">{a.role}</span>}
                      <span className="act-verb">{ACTIONS[a.action] || a.action}</span>
                      {a.target && <span className="act-target">{a.target}</span>}
                    </p>
                    {a.detail && <p className="act-detail">{a.detail}</p>}
                  </div>
                  <time className="act-time" dateTime={a.at} title={new Date(a.at).toLocaleString()}>{clock(a.at)}</time>
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
    </section>
  );
}
