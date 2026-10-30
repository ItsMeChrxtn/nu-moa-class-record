// Loading bar where Blaze (a little red dragon) chases Sparky (a yellow speedster) with fire breath,
// and sweet-alert style popups. Both characters are original drawings made for this app.

// Blaze faces right. Its mouth is at about (96, 34) in this 110 × 84 box.
function Dragon({ happy }) {
  return (
    <svg className="dragon-svg" viewBox="0 0 110 84" aria-hidden="true">
      {/* tail with a spade tip */}
      <path className="dragon-tail" d="M30 56 Q10 60 6 44 Q4 36 12 34" fill="none" stroke="#dc2626" strokeWidth="8" strokeLinecap="round" />
      <path d="M12 34 L4 26 L18 28 Z" fill="#7f1d1d" />
      {/* back wing */}
      <path className="dragon-wing" d="M44 32 Q30 6 52 2 Q50 14 62 12 Q58 22 66 26 Z" fill="#991b1b" stroke="#7f1d1d" strokeWidth="2" strokeLinejoin="round" />
      {/* legs */}
      <g className="dragon-legs" fill="#b91c1c">
        <rect className="leg leg-a" x="34" y="62" width="10" height="16" rx="5" />
        <rect className="leg leg-b" x="56" y="62" width="10" height="16" rx="5" />
      </g>
      {/* body and belly */}
      <ellipse cx="50" cy="52" rx="28" ry="22" fill="#ef4444" />
      <ellipse cx="54" cy="58" rx="16" ry="13" fill="#fde68a" />
      <path d="M44 50 h20 M43 57 h22 M45 64 h18" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      {/* spikes */}
      <path d="M30 36 l4 -8 l4 7 M40 31 l4 -8 l4 7" fill="#7f1d1d" />
      {/* head */}
      <circle cx="80" cy="34" r="18" fill="#ef4444" />
      <ellipse cx="92" cy="38" rx="11" ry="9" fill="#f87171" />
      <circle cx="96" cy="35" r="1.6" fill="#7f1d1d" />
      <path d="M70 18 L66 6 L76 15 Z M82 16 L84 4 L89 15 Z" fill="#fde68a" stroke="#d97706" strokeWidth="1" />
      {happy ? (
        <path d="M74 28 q4 -5 8 0" stroke="#111827" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      ) : (
        <>
          <ellipse cx="78" cy="29" rx="4.2" ry="5" fill="#fff" />
          <circle cx="79.5" cy="29.5" r="2.6" fill="#111827" />
          <path d="M72 22 L84 25" stroke="#7f1d1d" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
      <path d={happy ? 'M86 43 Q93 49 100 42' : 'M88 43 L102 40'} stroke="#7f1d1d" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <ellipse cx="70" cy="38" rx="3.4" ry="2" fill="#fb7185" opacity="0.7" />
    </svg>
  );
}

// Sparky faces right, looking back over its shoulder while running.
function Speedster({ happy }) {
  return (
    <svg className="speedster-svg" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M30 8 L36 2 L35 9 L42 6 L37 14 Z" fill="#f59e0b" stroke="#b45309" strokeWidth="1" strokeLinejoin="round" />
      <g className="speedster-legs" stroke="#b45309" strokeWidth="3" strokeLinecap="round">
        <path className="leg leg-a" d="M26 50 L22 60" />
        <path className="leg leg-b" d="M38 50 L42 60" />
      </g>
      <ellipse cx="32" cy="34" rx="20" ry="19" fill="#facc15" />
      <ellipse cx="34" cy="40" rx="11" ry="9" fill="#fef3c7" />
      <path className="speedster-wing" d="M14 34 Q6 30 8 40 Q12 44 18 40 Z" fill="#eab308" />
      {happy ? (
        <>
          <path d="M22 27 q3 -4 6 0 M36 27 q3 -4 6 0" stroke="#111827" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M26 35 Q32 42 38 35" fill="#f97316" stroke="#c2410c" strokeWidth="1.2" />
        </>
      ) : (
        <>
          {/* worried eyes looking back at the dragon */}
          <ellipse cx="24" cy="28" rx="4" ry="4.6" fill="#fff" />
          <ellipse cx="38" cy="28" rx="4" ry="4.6" fill="#fff" />
          <circle cx="22.6" cy="28.5" r="2.3" fill="#111827" />
          <circle cx="36.6" cy="28.5" r="2.3" fill="#111827" />
          <path d="M28 36 L36 34 L30 40 Z" fill="#f97316" stroke="#c2410c" strokeWidth="1" strokeLinejoin="round" />
          <path className="speedster-sweat" d="M48 16 Q51 21 48 23 Q45 21 48 16 Z" fill="#7dd3fc" />
        </>
      )}
    </svg>
  );
}

const CONFETTI = ['#1d4ed8', '#f59e0b', '#16a34a', '#e11d48', '#7c3aed', '#0ea5e9', '#facc15'];

function Confetti({ count = 30 }) {
  return (
    <div className="pg-confetti" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={{
            '--x': `${(i * 37) % 100}%`,
            '--d': `${(i % 8) * 55}ms`,
            '--r': `${(i * 47) % 360}deg`,
            background: CONFETTI[i % CONFETTI.length],
          }}
        />
      ))}
    </div>
  );
}

// progress: { label, value 0–1, done }
export function ProgressOverlay({ progress }) {
  const pct = Math.round(progress.value * 100);
  const done = progress.done;
  return (
    <div className="pg-backdrop" role="status" aria-live="polite" aria-label={`${progress.label} ${pct}%`}>
      <div className={`pg-card ${done ? 'is-done' : ''}`}>
        <div className="pg-head">
          <strong>{done ? 'All done!' : progress.label}</strong>
          <span className="pg-pct">{pct}%</span>
        </div>
        <div className="pg-stage">
          <div className={`pg-chase ${done ? 'cheer' : 'run'}`} style={{ '--p': `${pct}%` }}>
            <span className="chaser">
              <Dragon happy={done} />
              <span className={`fire ${done ? 'fireworks' : ''}`} aria-hidden="true">
                <i /><i /><i /><i /><i />
              </span>
            </span>
            <span className="runner">
              <Speedster happy={done} />
              {!done && <span className="dust" aria-hidden="true"><i /><i /><i /></span>}
            </span>
          </div>
          <div className="pg-track">
            <span className="pg-fill" style={{ width: `${pct}%` }} />
          </div>
          {done && <Confetti />}
        </div>
        <p className="pg-note">{done ? 'Sparky made it, and Blaze is cheering!' : 'Blaze is chasing Sparky to the finish…'}</p>
      </div>
    </div>
  );
}

const TONE_TITLE = { success: 'Success!', error: 'Something went wrong', info: 'Heads up', warning: 'Are you sure?', question: 'Continue?' };

// The round icon at the top of a popup: success, error, info, warning or question.
export function SwalIcon({ type }) {
  return (
    <div className={`swal-icon swal-icon-${type}`} aria-hidden="true">
      <svg viewBox="0 0 52 52">
        <circle className="swal-ring" cx="26" cy="26" r="24" />
        {type === 'success' && <path className="swal-mark" d="M15 27 L23 35 L38 18" />}
        {type === 'error' && <path className="swal-mark" d="M18 18 L34 34 M34 18 L18 34" />}
        {type === 'info' && <path className="swal-mark" d="M26 16 L26 17 M26 23 L26 36" />}
        {type === 'warning' && <path className="swal-mark" d="M26 14 L26 30 M26 37 L26 38" />}
        {type === 'question' && <path className="swal-mark" d="M20 20 Q20 14 26 14 Q32 14 32 20 Q32 25 26 27 L26 31 M26 37 L26 38" />}
      </svg>
    </div>
  );
}

// The shared popup frame: a coloured band with the icon, then the content.
export function SwalCard({ type, title, children, onClose, label }) {
  return (
    <div className="swal-backdrop" onClick={onClose}>
      <div className={`swal swal-${type}`} role="alertdialog" aria-modal="true" aria-label={label || title} onClick={(e) => e.stopPropagation()}>
        <div className="swal-band" aria-hidden="true">
          <span className="swal-dots" />
          {type === 'success' && (
            <span className="swal-mascot">
              <Speedster happy />
            </span>
          )}
        </div>
        <SwalIcon type={type} />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

// alert: { type: 'success' | 'error' | 'info', title, message, duration }
export function SweetAlert({ alert, onClose }) {
  const title = alert.title || TONE_TITLE[alert.type];
  return (
    <SwalCard type={alert.type} title={title} onClose={onClose}>
      {alert.message && <p>{alert.message}</p>}
      <button type="button" className={`btn swal-ok swal-btn-${alert.type}`} onClick={onClose} autoFocus>
        {alert.type === 'error' ? 'OK' : 'Great!'}
      </button>
      {alert.type === 'success' && <span className="swal-timer" style={{ animationDuration: `${alert.duration}ms` }} />}
      {alert.type === 'success' && <Confetti count={18} />}
    </SwalCard>
  );
}
