import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { BrandMark, Icon, firstName, useUI } from '../ui.jsx';
import { LABELS, strength } from './ChangePassword.jsx';

function AuthShell({ eyebrow, title, accent, text, children }) {
  return (
    <div className="auth-page">
      <header className="auth-top">
        <Link to="/login" className="brand">
          <BrandMark />
          <span className="brand-text"><strong>Class Record</strong></span>
        </Link>
        <span className="top-chip">National University · MOA</span>
      </header>
      <main className="auth-hero">
        <p className="eyebrow">{eyebrow}</p>
        <h1>
          {title} <span className="accent">{accent}</span>
        </h1>
        <p className="hero-text">{text}</p>
        {children}
      </main>
      <footer className="auth-foot">Remembered it? <Link to="/login">Back to sign in</Link></footer>
    </div>
  );
}

// Step 1: ask for a reset link.
export function ForgotPassword() {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { username }, label: 'Sending the reset link…' });
      setSent(username.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Forgot your"
      accent="password?"
      text="Type your student number or email. We'll email you a link to choose a new password."
    >
      {sent ? (
        <div className="auth-form">
          <div className="alert ok">
            <Icon name="mail" />
            <span>
              If <strong>{sent}</strong> has an account with an email on file, a reset link is on its way. Check your inbox and spam folder. The link expires in 1 hour.
            </span>
          </div>
          <p className="auth-note">
            No email after a few minutes? Students: your email comes from the class list, so ask your faculty to reset your password. Faculty: ask the administrator.
          </p>
          <Link to="/login" className="btn primary block">Back to sign in</Link>
          <button type="button" className="btn block" onClick={() => setSent('')}>Use a different account</button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>Student number / Email</span>
            <span className="input-icon">
              <Icon name="user" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. 2023-150144 or juan.delacruz@gmail.com"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                required
              />
            </span>
          </label>
          {error && <div className="alert error"><Icon name="alert" />{error}</div>}
          <button className="btn primary block" disabled={busy || !username.trim()}>
            {busy ? <span className="spinner" style={{ borderColor: '#fff6', borderTopColor: '#fff' }} /> : 'Email me a reset link'}
          </button>
          <p className="auth-note"><Link to="/login">← Back to sign in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}

// Step 2: the link from the email (/reset-password?token=…).
export function ResetPassword() {
  const { user } = useAuth();
  const { toast } = useUI();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [account, setAccount] = useState(undefined); // undefined = checking, null = bad link
  const [linkError, setLinkError] = useState('');
  const [form, setForm] = useState({ newPassword: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setAccount(null);
      setLinkError('This page needs the link from your email.');
      return;
    }
    api('/auth/reset-password/check', { method: 'POST', body: { token }, label: 'Checking the link…' })
      .then(setAccount)
      .catch((err) => {
        setAccount(null);
        setLinkError(err.message);
      });
  }, [token]);

  if (user) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const score = strength(form.newPassword);
  const matches = form.confirm && form.confirm === form.newPassword;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, newPassword: form.newPassword }, label: 'Saving your new password…' });
      toast('Sign in with your new password.', 'success', 'Password changed');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new"
      accent="password."
      text={account ? `Hi ${firstName(account.name)}! Set a new password for ${account.username}. At least 8 characters.` : 'At least 8 characters, hard to guess.'}
    >
      {account === undefined ? (
        <div className="auth-form"><span className="spinner" /></div>
      ) : account === null ? (
        <div className="auth-form">
          <div className="alert error"><Icon name="alert" />{linkError}</div>
          <Link to="/forgot-password" className="btn primary block">Send a new link</Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>New password</span>
            <span className="input-icon">
              <Icon name="lock" />
              <input type={show ? 'text' : 'password'} value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" minLength={8} autoFocus required />
              <button type="button" className="icon-btn reveal" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                <Icon name={show ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </span>
            {form.newPassword && (
              <>
                <span className="strength" data-score={score}><i /><i /><i /><i /></span>
                <span className="strength-label">
                  <span>Strength: <strong>{LABELS[score]}</strong></span>
                  <span>{form.newPassword.length} characters</span>
                </span>
              </>
            )}
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <span className="input-icon">
              <Icon name="lock" />
              <input type={show ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
            </span>
            {form.confirm && (
              <span className={`match ${matches ? 'ok' : 'bad'}`}>
                <Icon name={matches ? 'check' : 'x'} size={14} />
                {matches ? 'Passwords match' : 'Passwords do not match'}
              </span>
            )}
          </label>
          {error && <div className="alert error"><Icon name="alert" />{error}</div>}
          <button className="btn primary block" disabled={busy || form.newPassword.length < 8 || !matches}>
            {busy ? <span className="spinner" style={{ borderColor: '#fff6', borderTopColor: '#fff' }} /> : 'Save new password'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
