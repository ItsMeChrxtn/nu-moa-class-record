import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import NotificationBell from './Notifications.jsx';
import { Avatar, BrandMark, Icon, TodayChip, firstName, titleCase, useUI } from './ui.jsx';

const ADMIN_TABS = [
  { tab: 'dashboard', label: 'Dashboard', icon: 'layers' },
  { tab: 'faculty', label: 'Faculty', icon: 'users' },
  { tab: 'sections', label: 'Sections', icon: 'book' },
  { tab: 'students', label: 'Students', icon: 'user' },
  { tab: 'activity', label: 'Activity', icon: 'list' },
];

const ayKey = (s) => (s.academicYear || '').trim();
const ayLabel = (ay) => (ay ? `A.Y. ${ay.replace(/\s*-\s*/, ' - ')}` : 'No academic year');
const readAy = () => {
  try {
    return localStorage.getItem('side-ay');
  } catch {
    return null;
  }
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { confirm, toast } = useUI();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState([]); // every section of this faculty
  const [ay, setAy] = useState(readAy); // academic year shown in the sidebar
  const ready = user && !user.mustChangePassword;
  const params = new URLSearchParams(location.search);

  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (ready && user.role === 'faculty') api('/faculty/sections').then((d) => setSections(d.sections)).catch(() => {});
  }, [ready, user?.role, location.pathname]);

  // Academic years, newest first; opening a section shows its year in the sidebar.
  const years = [...new Set(sections.map(ayKey))].sort((a, b) => b.localeCompare(a));
  const openId = location.pathname.match(/^\/faculty\/sections\/([^/]+)/)?.[1];
  const openAy = openId ? sections.find((x) => x.id === openId) : null;
  useEffect(() => {
    if (openAy) setAy(ayKey(openAy));
  }, [openAy]);
  const shownAy = years.includes(ay) ? ay : years[0];
  const listed = sections.filter((x) => ayKey(x) === shownAy).sort((a, b) => a.code.localeCompare(b.code));
  const pickAy = (v) => {
    setAy(v);
    try {
      localStorage.setItem('side-ay', v);
    } catch {}
  };

  async function doLogout() {
    const ok = await confirm({ title: 'Log out?', message: 'You will need your password to sign in again.', confirmLabel: 'Log out' });
    if (!ok) return;
    const name = firstName(user.name);
    await logout();
    navigate('/login');
    toast(`See you next time, ${name}!`, 'success', 'Logged out');
  }

  const onPath = (p) => location.pathname === p;
  const item = (to, icon, label, active, extra) => (
    <Link key={label} to={to} className={`side-link ${active ? 'on' : ''}`} aria-current={active ? 'page' : undefined}>
      <Icon name={icon} size={17} />
      <span>{label}</span>
      {extra}
    </Link>
  );

  let nav = null;
  if (ready && user.role === 'faculty') {
    const view = params.get('view');
    nav = (
      <>
        <span className="side-label">Workspace</span>
        {item('/faculty', 'layers', 'Dashboard', onPath('/faculty') && view !== 'schedule')}
        {item('/faculty?view=schedule', 'calendar', 'Weekly schedule', onPath('/faculty') && view === 'schedule')}
        {sections.length > 0 && (
          <>
            <span className="side-label">Sections</span>
            <label className="side-ay">
              <Icon name="calendar" size={15} />
              <select value={shownAy} onChange={(e) => pickAy(e.target.value)} aria-label="Academic year">
                {years.map((y) => <option key={y} value={y}>{ayLabel(y)}</option>)}
              </select>
            </label>
            {listed.map((s) => (
              <NavLink key={s.id} to={`/faculty/sections/${s.id}`} className={({ isActive }) => `side-link side-sec ${isActive ? 'on' : ''}`}>
                <b>{s.code}</b>
                <span title={s.subjectTitle}>{titleCase(s.subjectTitle || s.subjectCode || '')}</span>
              </NavLink>
            ))}
          </>
        )}
        <span className="side-label">Account</span>
        {item('/faculty/profile', 'user', 'My profile', onPath('/faculty/profile'))}
      </>
    );
  } else if (ready && user.role === 'admin') {
    const tab = params.get('tab') || 'dashboard';
    nav = (
      <>
        <span className="side-label">Administration</span>
        {ADMIN_TABS.map((t) => item(`/admin?tab=${t.tab}`, t.icon, t.label, onPath('/admin') && tab === t.tab))}
      </>
    );
  } else if (ready && user.role === 'student') {
    nav = (
      <>
        <span className="side-label">Student</span>
        {item('/records', 'award', 'My grades', onPath('/records'))}
      </>
    );
  }

  return (
    <div className={`shell ${nav ? 'has-side' : ''}`}>
      {nav && (
        <>
          <aside className={`side ${open ? 'open' : ''}`}>
            <Link to="/" className="brand side-brand">
              <BrandMark />
              <span className="brand-text">
                <strong>Class Record</strong>
                <small>National University · MOA</small>
              </span>
            </Link>
            <nav className="side-nav" aria-label="Main">{nav}</nav>
            <div className="side-foot">
              <div className="side-user">
                <Avatar name={user.name} size={34} />
                <span className="side-user-meta">
                  <strong title={titleCase(user.name)}>{titleCase(user.name)}</strong>
                  <small>{{ admin: 'Administrator', faculty: 'Faculty', student: user.username }[user.role]}</small>
                </span>
              </div>
              <button className="btn side-logout" onClick={doLogout}>
                <Icon name="logout" size={16} /> Log out
              </button>
            </div>
          </aside>
          {open && <div className="side-scrim" onClick={() => setOpen(false)} />}
        </>
      )}

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-inner">
            {nav ? (
              <button className="icon-btn side-toggle" onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open}>
                <Icon name="list" size={20} />
              </button>
            ) : null}
            <Link to="/" className={`brand ${nav ? 'brand-mobile' : ''}`}>
              <BrandMark />
              <span className="brand-text">
                <strong>Class Record</strong>
                <small>National University · MOA</small>
              </span>
            </Link>
            {nav && user.role === 'faculty' && sections.length > 0 && <SectionSearch sections={sections} />}
            {user && (
              <div className="topbar-user">
                {nav && <span className="hide-sm"><TodayChip /></span>}
                {user.role === 'student' && ready && <NotificationBell />}
                {nav && (
                  <span className="top-me hide-sm" title={titleCase(user.name)}>
                    <Avatar name={user.name} size={32} />
                    <span><strong>{firstName(user.name)}</strong><small>{{ admin: 'Administrator', faculty: 'Faculty', student: 'Student' }[user.role]}</small></span>
                  </span>
                )}
                {!nav && (
                  <button className="btn" title="Log out" onClick={doLogout}>
                    <Icon name="logout" size={16} />
                    <span className="hide-sm">Log out</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </header>
        <main className="main">
          <Outlet />
        </main>
        <footer className="app-footer">© {new Date().getFullYear()} National University MOA · Class Record</footer>
      </div>
    </div>
  );
}

// Jump to a section by code or subject from the top bar.
function SectionSearch({ sections }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const hits = q.trim() ? sections.filter((s) => `${s.code} ${s.subjectTitle || ''} ${s.subjectCode || ''}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const go = (s) => {
    setQ('');
    navigate(`/faculty/sections/${s.id}`);
  };
  return (
    <div className="top-search">
      <Icon name="search" size={16} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0]); if (e.key === 'Escape') setQ(''); }}
        placeholder="Search a section…"
        aria-label="Search a section"
      />
      {hits.length > 0 && (
        <ul className="top-hits">
          {hits.map((s) => (
            <li key={s.id}><button type="button" onMouseDown={(e) => { e.preventDefault(); go(s); }}><b>{s.code}</b><span>{titleCase(s.subjectTitle || s.subjectCode || '')}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
