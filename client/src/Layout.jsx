import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import NotificationBell, { FacultyBell } from './Notifications.jsx';
import PhotoModal from './PhotoModal.jsx';
import { Avatar, BrandMark, Icon, TodayChip, firstName, titleCase, useUI } from './ui.jsx';

const ADMIN_TABS = [
  { tab: 'dashboard', label: 'Dashboard', icon: 'layers' },
  { tab: 'faculty', label: 'Faculty', icon: 'users' },
  { tab: 'sections', label: 'Sections', icon: 'book' },
  { tab: 'students', label: 'Students', icon: 'user' },
  { tab: 'activity', label: 'Activity', icon: 'list' },
];

const ayKey = (s) => (s.academicYear || '').trim();
export default function Layout() {
  const { user, logout } = useAuth();
  const { confirm, toast } = useUI();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [sections, setSections] = useState([]); // every section of this faculty
  const ready = user && !user.mustChangePassword;
  const params = new URLSearchParams(location.search);

  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (ready && user.role === 'faculty') api('/faculty/sections').then((d) => setSections(d.sections)).catch(() => {});
  }, [ready, user?.role, location.pathname]);

  // Academic years, newest first, for the Sections dropdown.
  const years = [...new Set(sections.map(ayKey))].sort((a, b) => b.localeCompare(a));
  const openId = location.pathname.match(/^\/faculty\/sections\/([^/]+)/)?.[1];

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
  let tabs = []; // bottom bar on phones: { to, icon, label, active }
  if (ready && user.role === 'faculty') {
    const view = params.get('view');
    tabs = [
      { to: '/faculty', icon: 'layers', label: 'Home', active: onPath('/faculty') && !view },
      { to: `/faculty?view=sections${years[0] ? `&ay=${encodeURIComponent(years[0])}` : ''}`, icon: 'book', label: 'Sections', active: view === 'sections' || !!openId },
      { to: '/faculty?view=schedule', icon: 'calendar', label: 'Schedule', active: onPath('/faculty') && view === 'schedule' },
      { to: '/faculty/profile', icon: 'user', label: 'Profile', active: onPath('/faculty/profile') },
    ];
    nav = (
      <>
        <span className="side-label">Workspace</span>
        {item('/faculty', 'layers', 'Home', onPath('/faculty') && !view)}
        {item(`/faculty?view=sections${years[0] ? `&ay=${encodeURIComponent(years[0])}` : ''}`, 'book', 'Sections', view === 'sections' || !!openId)}
        {item('/faculty?view=schedule', 'calendar', 'Schedule', onPath('/faculty') && view === 'schedule')}
        {item('/faculty/profile', 'user', 'Profile', onPath('/faculty/profile'))}
      </>
    );
  } else if (ready && user.role === 'admin') {
    const tab = params.get('tab') || 'dashboard';
    tabs = ADMIN_TABS.map((t) => ({ to: `/admin?tab=${t.tab}`, icon: t.icon, label: t.label === 'Dashboard' ? 'Home' : t.label, active: onPath('/admin') && tab === t.tab }));
    nav = (
      <>
        <span className="side-label">Administration</span>
        {ADMIN_TABS.map((t) => item(`/admin?tab=${t.tab}`, t.icon, t.label === 'Dashboard' ? 'Home' : t.label, onPath('/admin') && tab === t.tab))}
      </>
    );
  } else if (ready && user.role === 'student') {
    nav = (
      <>
        <span className="side-label">Student</span>
        {item('/records', 'award', 'Grades', onPath('/records'))}
      </>
    );
  }

  return (
    <div className={`shell ${nav ? 'has-side' : ''} ${tabs.length ? 'has-tabbar' : ''}`}>
      {nav && (
        <>
          <aside className={`side rail ${open ? 'open' : ''}`}>
            <Link to="/" className="brand side-brand" aria-label="Class Record home">
              <BrandMark />
              <small className="rail-brand">NU MOA</small>
            </Link>
            <nav className="side-nav" aria-label="Main">{nav}</nav>
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
                <small>NU MOA</small>
              </span>
            </Link>
            {nav && user.role === 'faculty' && sections.length > 0 && <SectionSearch sections={sections} />}
            {user && (
              <div className="topbar-user">
                {nav && <span className="hide-sm"><TodayChip /></span>}
                {user.role === 'student' && ready && <NotificationBell />}
                {user.role === 'faculty' && ready && <FacultyBell />}
                <UserMenu user={user} onPhoto={() => setPhotoOpen(true)} onLogout={doLogout} />
              </div>
            )}
          </div>
        </header>
        {photoOpen && <PhotoModal onClose={() => setPhotoOpen(false)} />}
        <main className="main">
          <Outlet />
        </main>
        <footer className="app-footer">© {new Date().getFullYear()} National University MOA · Class Record</footer>
      </div>
      {tabs.length > 0 && (
        <nav className="tabbar" aria-label="Quick navigation">
          {tabs.map((t) => (
            <Link key={t.label} to={t.to} className={`tabbar-item ${t.active ? 'on' : ''}`} aria-current={t.active ? 'page' : undefined}>
              <Icon name={t.icon} size={20} />
              <span>{t.label}</span>
            </Link>
          ))}
        </nav>
      )}
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

// The name in the top bar opens: My profile (faculty), Change photo, Log out.
function UserMenu({ user, onPhoto, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const role = { admin: 'Administrator', faculty: 'Faculty', student: 'Student' }[user.role];
  const run = (fn) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className={`top-me ${open ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={user.name} photo={user.photo} size={34} />
        <span className="hide-sm"><strong>{firstName(user.name)}</strong><small>{role}</small></span>
        <Icon name="chevronDown" size={15} className="top-me-caret" />
      </button>
      {open && (
        <div className="user-pop" role="menu">
          <div className="user-pop-head">
            <Avatar name={user.name} photo={user.photo} size={44} />
            <span>
              <strong>{titleCase(user.name)}</strong>
              <small>{user.role === 'student' ? user.username : role}</small>
            </span>
          </div>
          {user.role === 'faculty' && !user.mustChangePassword && (
            <Link to="/faculty/profile" role="menuitem" className="user-pop-item"><Icon name="user" size={16} /> My profile</Link>
          )}
          <button type="button" role="menuitem" className="user-pop-item" onClick={run(onPhoto)}><Icon name="upload" size={16} /> {user.photo ? 'Change photo' : 'Add a photo'}</button>
          <hr />
          <button type="button" role="menuitem" className="user-pop-item danger" onClick={run(onLogout)}><Icon name="logout" size={16} /> Log out</button>
        </div>
      )}
    </div>
  );
}
