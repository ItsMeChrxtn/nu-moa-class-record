import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { BrandMark, Icon, firstName, useUI } from '../ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const { toast } = useUI();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(username, password);
      toast(u.mustChangePassword ? 'Please set a new password to continue.' : 'You are signed in.', 'success', `Welcome back, ${firstName(u.name)}`);
      navigate('/');
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error', 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <span className="brand">
          <BrandMark />
          <span className="brand-text"><strong>Class Record</strong><small>National University MOA</small></span>
        </span>
        <div className="auth-brand-body">
          <h2>Grades, attendance and class records in one place.</h2>
          <ul>
            <li><Icon name="chart" size={16} /> Faculty encode scores and publish grades per term</li>
            <li><Icon name="calendar" size={16} /> Attendance and weekly schedules for every section</li>
            <li><Icon name="award" size={16} /> Students see each score behind their grade</li>
          </ul>
        </div>
        <small className="auth-brand-foot">© {new Date().getFullYear()} National University MOA</small>
      </aside>
      <div className="auth-panel">
      <main className="auth-hero">
        <p className="eyebrow">Welcome</p>
        <h1>Sign in to your account</h1>
        <p className="hero-text">Sign in with your email address and password.</p>

        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              type="text"
              inputMode="email"
              placeholder="Your email address"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <span className="input-icon">
              <Icon name="lock" />
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
              <button type="button" className="icon-btn reveal" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                <Icon name={show ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </span>
          </label>
          {error && <div className="alert error"><Icon name="alert" />{error}</div>}
          <button className="btn primary block" disabled={busy || !username || !password}>
            {busy ? <span className="spinner" style={{ borderColor: '#fff6', borderTopColor: '#fff' }} /> : 'Log in'}
          </button>
          <p className="auth-note">
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>
        </form>
      </main>

      <footer className="auth-foot">If a score looks off, message your instructor.</footer>
      </div>
    </div>
  );
}
