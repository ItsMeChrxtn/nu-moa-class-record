import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import NotificationBell from './Notifications.jsx';
import { Avatar, BrandMark, Icon, firstName, titleCase, useUI } from './ui.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const { confirm, toast } = useUI();
  const navigate = useNavigate();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <BrandMark />
            <span className="brand-text">
              <strong>Class Record</strong>
              <small>National University · MOA</small>
            </span>
          </Link>
          {user && (
            <div className="topbar-user">
              {user.role === 'student' && !user.mustChangePassword && <NotificationBell />}
              <div className="user-pill">
                <Avatar name={user.name} size={32} />
                <span className="user-meta hide-sm">
                  <strong>{titleCase(user.name)}</strong>
                  <small>{{ admin: 'Administrator', faculty: 'Faculty' }[user.role] || user.username}</small>
                </span>
              </div>
              <button
                className="btn glass"
                title="Log out"
                onClick={async () => {
                  const ok = await confirm({ title: 'Log out?', message: 'You will need your password to sign in again.', confirmLabel: 'Log out' });
                  if (!ok) return;
                  const name = firstName(user.name);
                  await logout();
                  navigate('/login');
                  toast(`See you next time, ${name}!`, 'success', 'Logged out');
                }}
              >
                <Icon name="logout" size={16} />
                <span className="hide-sm">Log out</span>
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <footer className="app-footer">© {new Date().getFullYear()} National University MOA · Class Record</footer>
    </div>
  );
}
