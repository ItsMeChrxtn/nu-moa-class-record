import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Hero, Icon, PageLoader, titleCase, useUI } from '../ui.jsx';
import PhotoModal from '../PhotoModal.jsx';

// The faculty member's own details. The employee ID is the same one the schedule files print.
export default function Profile() {
  const { user, setUser } = useAuth();
  const [photoOpen, setPhotoOpen] = useState(false);
  const { toast } = useUI();
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/faculty/profile')
      .then((d) => {
        setSaved(d.profile);
        setForm({ ...d.profile, currentPassword: '' });
      })
      .catch((err) => setError(err.message));
  }, []);

  if (!form) return error ? <div className="container"><div className="alert error"><Icon name="alert" />{error}</div></div> : <PageLoader />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const emailChanged = form.email.trim().toLowerCase() !== saved.email;
  const dirty = ['name', 'email', 'employeeId', 'phone'].some((k) => form[k].trim() !== saved[k]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/faculty/profile', {
        method: 'PUT',
        label: 'Saving your profile…',
        body: { name: form.name, email: form.email, employeeId: form.employeeId, phone: form.phone, currentPassword: emailChanged ? form.currentPassword : undefined },
      });
      setSaved(d.profile);
      setForm({ ...d.profile, currentPassword: '' });
      setUser(d.user);
      toast(emailChanged ? `Sign in with ${d.profile.email} from now on.` : 'Your details were saved.', 'success', 'Profile updated');
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error', 'Not saved');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Hero
        back={<Link to="/faculty" className="back"><Icon name="arrowLeft" size={15} /> Sections</Link>}
        eyebrow={`Faculty · ${titleCase(saved.name)}`}
        title="My profile"
        lead="Your name, sign-in email and contact details. The employee ID also appears on your schedule files."
      />
      <div className="container lift">
        <form className="card narrow-card profile-card" onSubmit={submit}>
          <div className="profile-cover">
            <button type="button" className="profile-photo big" onClick={() => setPhotoOpen(true)} title="Change profile picture">
              <Avatar name={form.name || saved.name} photo={user?.photo} size={132} />
              <span><Icon name="upload" size={16} /></span>
            </button>
            <h2>{titleCase(form.name || saved.name)}</h2>
            <p>{saved.email || saved.username}</p>
            <button type="button" className="link-add" onClick={() => setPhotoOpen(true)}>{user?.photo ? 'Change photo' : 'Add a photo'}</button>
          </div>

          <label className="field">
            <span>Full name</span>
            <input value={form.name} onChange={set('name')} maxLength={100} placeholder="e.g. Juan P. Dela Cruz" required />
          </label>

          <label className="field">
            <span>Email (used to sign in)</span>
            <span className="input-icon">
              <Icon name="mail" />
              <input type="email" value={form.email} onChange={set('email')} maxLength={100} autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="e.g. juan.delacruz@gmail.com" required />
            </span>
            <small className="field-hint">Password reset links are sent here.</small>
          </label>

          {emailChanged && (
            <label className="field">
              <span>Current password</span>
              <span className="input-icon">
                <Icon name="key" />
                <input type="password" value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" required />
              </span>
              <small className="field-hint">Needed to change the email you sign in with.</small>
            </label>
          )}

          <div className="row-2">
            <label className="field">
              <span>Employee ID</span>
              <input value={form.employeeId} onChange={set('employeeId')} maxLength={40} placeholder="e.g. 00-00000" />
            </label>
            <label className="field">
              <span>Contact number</span>
              <input type="tel" value={form.phone} onChange={set('phone')} maxLength={20} autoComplete="tel" placeholder="e.g. 0917 123 4567" />
            </label>
          </div>

          {error && <div className="alert error"><Icon name="alert" />{error}</div>}
          <button className="btn primary lg block" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button>
          <Link to="/change-password" className="btn block"><Icon name="lock" size={16} /> Change password</Link>
        </form>
      </div>
      {photoOpen && <PhotoModal onClose={() => setPhotoOpen(false)} />}
    </>
  );
}
