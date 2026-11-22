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
    <div className="lg">
      <section className="lg-left">
        <header className="lg-brand">
          <BrandMark />
          <span>
            <strong>Class Record</strong>
            <small>National University · Mall of Asia</small>
          </span>
        </header>

        <main className="lg-main">
          <h1>Welcome back</h1>
          <p className="lg-lead">Sign in with your school email to see your classes, grades and attendance.</p>

          <form className="lg-form" onSubmit={submit} noValidate>
            <label className="lg-field">
              <span>Email address</span>
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
            <div className="lg-field lg-field-pass">
            <label className="lg-field">
              <span>Password</span>
              <span className="lg-pass">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button type="button" className="lg-reveal" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                  <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </span>
            </label>
            <Link to="/forgot-password" className="lg-forgot">Forgot password?</Link>
            </div>
            {error && <div className="lg-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
            <button className="lg-submit" disabled={busy || !username || !password}>
              {busy ? <span className="spinner" style={{ borderColor: '#fff6', borderTopColor: '#fff' }} /> : 'Sign in'}
            </button>
          </form>

          <p className="lg-help">Students: your account is set up by your instructor. If you can&apos;t sign in, ask them to resend your details.</p>
        </main>

        <footer className="lg-foot">© {new Date().getFullYear()} National University MOA</footer>
      </section>

      <aside className="lg-right" aria-hidden="true">
        <div className="lg-photo">
          <span className="lg-pill">NU MOA · Class Record</span>
          <div className="lg-caption">
            <h2>Every grade, every class day, <em>in one place.</em></h2>
            <p>Faculty encode scores and attendance. Students see each score behind their grade.</p>
            <dl className="lg-facts">
              <div><dt>Grades</dt><dd>Midterm and final, per term</dd></div>
              <div><dt>Attendance</dt><dd>Check-in codes in class</dd></div>
              <div><dt>Certificates</dt><dd>Downloaded by students</dd></div>
            </dl>
          </div>
        </div>
      </aside>
    </div>
  );
}
