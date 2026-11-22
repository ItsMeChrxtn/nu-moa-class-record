// Loading feedback: the page loader and a thin progress line while something saves.
// Results and confirmations are SweetAlert2 popups (see swal.js).
import { BrandMark } from './ui.jsx';

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
