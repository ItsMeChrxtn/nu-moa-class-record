import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Hero, Icon, firstName } from '../ui.jsx';

const LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

function strength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) s++;
  return Math.max(1, s);
}

export default function ChangePassword() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user === null) return <Navigate to="/login" replace />;
  if (!user) return null;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const score = strength(form.newPassword);
  const matches = form.confirm && form.confirm === form.newPassword;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      const d = await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: form.currentPassword, newPassword: form.newPassword },
      });
      setUser(d.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Hero
        eyebrow="Account security"
        title={user.mustChangePassword ? `Welcome, ${firstName(user.name)}!` : 'Change password'}
        lead={user.mustChangePassword ? 'Before you continue, please set your own password.' : 'Use a password that is hard to guess.'}
      />
      <div className="container lift">
        <form className="card narrow-card" onSubmit={submit}>
          <div className="card-icon-head">
            <span className="stat-icon"><Icon name="lock" size={22} /></span>
            <div>
              <h2>New password</h2>
              <p>At least 8 characters.</p>
            </div>
          </div>

          {user.mustChangePassword && (
            <div className="alert info">
              <Icon name="info" />
              You are using a temporary password. Set your own password to continue.
            </div>
          )}

          <label className="field">
            <span>Current password</span>
            <span className="input-icon">
              <Icon name="key" />
              <input type="password" value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" required />
            </span>
          </label>

          <label className="field">
            <span>New password</span>
            <span className="input-icon">
              <Icon name="lock" />
              <input type="password" value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" minLength={8} required />
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
              <input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
            </span>
            {form.confirm && (
              <span className={`match ${matches ? 'ok' : 'bad'}`}>
                <Icon name={matches ? 'check' : 'x'} size={14} />
                {matches ? 'Passwords match' : 'Passwords do not match'}
              </span>
            )}
          </label>

          {error && <div className="alert error"><Icon name="alert" />{error}</div>}
          <button className="btn primary lg block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        </form>
      </div>
    </>
  );
}
