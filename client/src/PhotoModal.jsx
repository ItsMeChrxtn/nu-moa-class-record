import { useRef, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import { Avatar, Icon, Modal, useUI } from './ui.jsx';

// Shrinks a picked image to a 256 px square (centre crop) JPEG, small enough to store with the account.
function squareJpeg(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      let q = 0.86;
      let out = canvas.toDataURL('image/jpeg', q);
      while (out.length > 85000 && q > 0.4) out = canvas.toDataURL('image/jpeg', (q -= 0.1));
      resolve(out);
    };
    img.onerror = () => reject(new Error('That file is not a picture we can read.'));
    // Read as a data: URL (the site's security policy allows data: images, not blob: links).
    const reader = new FileReader();
    reader.onload = () => (img.src = reader.result);
    reader.onerror = () => reject(new Error('That file could not be opened.'));
    reader.readAsDataURL(file);
  });
}

// Profile picture: choose, preview, save or remove.
export default function PhotoModal({ onClose }) {
  const { user, setUser } = useAuth();
  const { toast } = useUI();
  const input = useRef(null);
  const [preview, setPreview] = useState(user.photo || null);
  const [busy, setBusy] = useState(false);
  const changed = preview !== (user.photo || null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast('Choose a JPG, PNG or WebP picture.', 'error');
    try {
      setPreview(await squareJpeg(file));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function save() {
    setBusy(true);
    try {
      const d = preview
        ? await api('/me/photo', { method: 'PUT', body: { photo: preview }, label: 'Saving photo…' })
        : await api('/me/photo', { method: 'DELETE', label: 'Removing photo…' });
      setUser(d.user);
      toast(preview ? 'Your profile picture is updated.' : 'Your profile picture was removed.');
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Profile picture"
      subtitle="Shown in the top bar and on your profile."
      icon="user"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy || !changed}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <div className="photo-pick">
        <button type="button" className="photo-frame" onClick={() => input.current?.click()} title="Choose a picture">
          <Avatar name={user.name} photo={preview} size={132} />
          <span className="photo-edit"><Icon name="upload" size={16} /></span>
        </button>
        <div className="photo-actions">
          <button type="button" className="btn" onClick={() => input.current?.click()}><Icon name="upload" size={15} /> {preview ? 'Choose another' : 'Choose a picture'}</button>
          {preview && <button type="button" className="btn danger-ghost" onClick={() => setPreview(null)}><Icon name="trash" size={15} /> Remove</button>}
        </div>
        <p className="photo-hint">JPG, PNG or WebP. It is cropped to a square.</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      </div>
    </Modal>
  );
}
