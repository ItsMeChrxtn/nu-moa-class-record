// Loading bar with running critters (original characters, drawn here) and sweet-alert style popups.

// Three little runners. Each is a simple SVG: a round body, eyes, blush, two feet and its own crest.
const CRITTERS = [
  { name: 'Zip', body: '#60a5fa', belly: '#dbeafe', crest: 'antenna', accent: '#facc15' },
  { name: 'Sprig', body: '#4ade80', belly: '#dcfce7', crest: 'leaf', accent: '#16a34a' },
  { name: 'Puff', body: '#fb923c', belly: '#ffedd5', crest: 'tuft', accent: '#f97316' },
];

function Critter({ c }) {
  return (
    <svg className="critter-svg" viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
      {c.crest === 'antenna' && (
        <g stroke={c.body} strokeWidth="2.5" strokeLinecap="round" fill="none">
          <path d="M20 12 Q18 5 14 4" />
          <path d="M28 12 Q30 5 34 4" />
          <circle cx="14" cy="4" r="2.6" fill={c.accent} stroke="none" />
          <circle cx="34" cy="4" r="2.6" fill={c.accent} stroke="none" />
        </g>
      )}
      {c.crest === 'leaf' && <path d="M24 12 C22 4 30 1 33 3 C32 8 28 11 24 12 Z" fill={c.accent} />}
      {c.crest === 'tuft' && (
        <g fill={c.accent}>
          <path d="M19 12 L21 5 L24 11 Z" />
          <path d="M23 11 L26 3 L28 11 Z" />
          <path d="M27 12 L31 6 L31 13 Z" />
        </g>
      )}
      <g className="critter-feet">
        <ellipse className="foot foot-a" cx="17" cy="42" rx="5" ry="3" fill={c.accent} />
        <ellipse className="foot foot-b" cx="31" cy="42" rx="5" ry="3" fill={c.accent} />
      </g>
      <ellipse cx="24" cy="27" rx="15" ry="14" fill={c.body} />
      <ellipse cx="24" cy="31" rx="9" ry="7.5" fill={c.belly} />
      <g className="critter-eyes">
        <circle cx="19" cy="23" r="2.6" fill="#0f172a" />
        <circle cx="29" cy="23" r="2.6" fill="#0f172a" />
        <circle cx="19.9" cy="22.1" r="0.9" fill="#fff" />
        <circle cx="29.9" cy="22.1" r="0.9" fill="#fff" />
      </g>
      <ellipse cx="14.5" cy="28" rx="2.6" ry="1.6" fill="#f472b6" opacity="0.7" />
      <ellipse cx="33.5" cy="28" rx="2.6" ry="1.6" fill="#f472b6" opacity="0.7" />
      <path className="critter-mouth" d="M21.5 28.5 Q24 31 26.5 28.5" stroke="#0f172a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const CONFETTI = ['#1d4ed8', '#f59e0b', '#16a34a', '#e11d48', '#7c3aed', '#0ea5e9'];

// progress: { label, value 0–1, done }
export function ProgressOverlay({ progress }) {
  const pct = Math.round(progress.value * 100);
  return (
    <div className="pg-backdrop" role="status" aria-live="polite" aria-label={`${progress.label} ${pct}%`}>
      <div className={`pg-card ${progress.done ? 'is-done' : ''}`}>
        <div className="pg-head">
          <strong>{progress.done ? 'All done!' : progress.label}</strong>
          <span className="pg-pct">{pct}%</span>
        </div>
        <div className="pg-stage">
          <div className="pg-runners" style={{ '--p': `${pct}%` }}>
            {CRITTERS.map((c, i) => (
              <span key={c.name} className={`critter c${i} ${progress.done ? 'cheer' : 'run'}`} title={c.name}>
                <Critter c={c} />
              </span>
            ))}
          </div>
          <div className="pg-track">
            <span className="pg-fill" style={{ width: `${pct}%` }} />
          </div>
          {progress.done && (
            <div className="pg-confetti" aria-hidden="true">
              {Array.from({ length: 26 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    '--x': `${(i * 37) % 100}%`,
                    '--d': `${(i % 7) * 60}ms`,
                    '--r': `${(i * 47) % 360}deg`,
                    background: CONFETTI[i % CONFETTI.length],
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <p className="pg-note">{progress.done ? 'Zip, Sprig and Puff made it!' : 'Zip, Sprig and Puff are on it…'}</p>
      </div>
    </div>
  );
}

// alert: { type: 'success' | 'error' | 'info', title, message }
export function SweetAlert({ alert, onClose }) {
  const title = alert.title || { success: 'Success!', error: 'Something went wrong', info: 'Heads up' }[alert.type];
  return (
    <div className="swal-backdrop" onClick={onClose}>
      <div className={`swal swal-${alert.type}`} role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className={`swal-icon swal-icon-${alert.type}`} aria-hidden="true">
          {alert.type === 'success' && (
            <svg viewBox="0 0 52 52">
              <circle className="swal-ring" cx="26" cy="26" r="24" />
              <path className="swal-check" d="M15 27 L23 35 L38 18" />
            </svg>
          )}
          {alert.type === 'error' && (
            <svg viewBox="0 0 52 52">
              <circle className="swal-ring" cx="26" cy="26" r="24" />
              <path className="swal-x" d="M18 18 L34 34 M34 18 L18 34" />
            </svg>
          )}
          {alert.type === 'info' && (
            <svg viewBox="0 0 52 52">
              <circle className="swal-ring" cx="26" cy="26" r="24" />
              <path className="swal-check" d="M26 16 L26 17 M26 23 L26 36" />
            </svg>
          )}
        </div>
        <h2>{title}</h2>
        {alert.message && <p>{alert.message}</p>}
        <button type="button" className="btn primary swal-ok" onClick={onClose} autoFocus>
          {alert.type === 'error' ? 'OK' : 'Great'}
        </button>
        {alert.type === 'success' && <span className="swal-timer" style={{ animationDuration: `${alert.duration}ms` }} />}
      </div>
    </div>
  );
}
