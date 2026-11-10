// Feedback that stays out of the way: a thin progress line while something saves, small
// notifications in the corner for results, and a proper dialog only when a decision is needed.
import { useEffect } from 'react';
import { BrandMark } from './ui.jsx';

const TONE_TITLE = { success: 'Saved', error: 'Something went wrong', info: 'Notice', warning: 'Are you sure?', question: 'Continue?' };
const TONE_ICON = {
  success: <path d="M20 6 9 17l-5-5" />,
  error: <path d="M18 6 6 18M6 6l12 12" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  warning: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></>,
};

export function ToneIcon({ type }) {
  return (
    <span className={`fb-icon fb-${type}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {TONE_ICON[type] || TONE_ICON.info}
      </svg>
    </span>
  );
}

// The dialog frame used by confirmations (delete, log out, …).
export function SwalCard({ type, title, children, onClose, label }) {
  return (
    <div className="swal-backdrop" onClick={onClose}>
      <div className={`swal swal-${type}`} role="alertdialog" aria-modal="true" aria-label={label || title} onClick={(e) => e.stopPropagation()}>
        <div className="swal-head">
          <ToneIcon type={type} />
          <h2>{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

// Page loading: the brand mark with a sliding bar under it.
export function PixelLoader({ label }) {
  return (
    <div className="ld" role="status" aria-label={label}>
      <span className="ld-mark"><BrandMark /></span>
      <span className="ld-bar"><i /></span>
      <span className="ld-label">{label}</span>
    </div>
  );
}

// While something saves: a line across the top of the window and a small pill. The page stays usable.
export function ProgressOverlay({ progress }) {
  const pct = Math.round(progress.value * 100);
  return (
    <>
      <div className="topline" role="progressbar" aria-label={progress.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="busy-pill" aria-hidden="true">
        <span className="busy-spin" />
        {progress.label}
      </div>
    </>
  );
}

// One notification. alert: { id, type: 'success' | 'error' | 'info', title, message, duration }
function Note({ alert, onClose }) {
  useEffect(() => {
    const t = setTimeout(() => onClose(alert.id), alert.duration);
    return () => clearTimeout(t);
  }, [alert, onClose]);
  const title = alert.title || TONE_TITLE[alert.type];
  return (
    <div className={`note note-${alert.type}`} role={alert.type === 'error' ? 'alert' : 'status'}>
      <ToneIcon type={alert.type} />
      <div className="note-text">
        <strong>{title}</strong>
        {alert.message && alert.message !== title && <p>{alert.message}</p>}
      </div>
      <button type="button" className="note-x" onClick={() => onClose(alert.id)} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
      <span className="note-timer" style={{ animationDuration: `${alert.duration}ms` }} />
    </div>
  );
}

export function Notes({ alerts, onClose }) {
  if (!alerts.length) return null;
  return (
    <div className="notes" aria-live="polite">
      {alerts.slice(-4).map((a) => <Note key={a.id} alert={a} onClose={onClose} />)}
    </div>
  );
}
