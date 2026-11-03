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
      <header className="auth-top">
        <span className="brand">
          <BrandMark />
          <span className="brand-text"><strong>Class Record</strong></span>
        </span>
        <span className="top-chip">National University · MOA</span>
      </header>

      <main className="auth-hero">
        <p className="eyebrow">Grade breakdown · Online class record</p>
        <h1>
          Know your <span className="accent">grades.</span>
        </h1>
        <p className="hero-text">
          Every quiz, activity and exam behind your midterm and final grade. Sign in with your student number to see it.
        </p>

        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>Student number / Email</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your student number, e.g. 2023-150144"
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
            {busy ? <span className="spinner" style={{ borderColor: '#fff6', borderTopColor: '#fff' }} /> : 'Show my grades'}
          </button>
          <p className="auth-note">
            Faculty: sign in with your email. <Link to="/forgot-password">Forgot your password?</Link>
          </p>
        </form>
      </main>

      <footer className="auth-foot">For viewing only · If a score looks off, message your instructor.</footer>
    </div>
  );
}
