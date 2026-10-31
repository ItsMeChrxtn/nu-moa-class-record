// Professional popups in the style of SweetAlert: a loading popup (spinner, step, progress bar),
// result popups (success / error / info) and the shared frame used by confirmations.

const TONE_TITLE = { success: 'Success', error: 'Something went wrong', info: 'Notice', warning: 'Are you sure?', question: 'Continue?' };

// The round icon at the top of a popup.
export function SwalIcon({ type }) {
  if (type === 'loading')
    return (
      <div className="swal-icon swal-icon-loading" aria-hidden="true">
        <span className="swal-spinner" />
      </div>
    );
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

// The shared popup frame: a thin coloured accent, the icon, the title, then the content.
export function SwalCard({ type, title, children, onClose, label, backdrop = true }) {
  const card = (
    <div className={`swal swal-${type}`} role={type === 'loading' ? 'status' : 'alertdialog'} aria-modal={type === 'loading' ? undefined : true} aria-label={label || title} onClick={(e) => e.stopPropagation()}>
      <SwalIcon type={type} />
      <h2>{title}</h2>
      {children}
    </div>
  );
  if (!backdrop) return card;
  return (
    <div className={`swal-backdrop ${type === 'loading' ? 'is-loading' : ''}`} onClick={onClose}>
      {card}
    </div>
  );
}

// Pixel-style loader: "LOADING..." over a pixel-bordered bar with a checkered fill.
// value 0–1 fills the bar; without a value the checkers sweep back and forth (page loading).
export function PixelLoader({ label, value }) {
  const pct = value == null ? null : Math.round(value * 100);
  return (
    <div className="px-loader" role={pct == null ? 'status' : 'progressbar'} aria-label={label} aria-valuemin={pct == null ? undefined : 0} aria-valuemax={pct == null ? undefined : 100} aria-valuenow={pct ?? undefined}>
      <div className="px-title" aria-hidden="true">
        LOADING<span className="px-dots"><i>.</i><i>.</i><i>.</i></span>
      </div>
      <div className="px-bar">
        <span className={`px-fill ${pct == null ? 'is-sweep' : ''}`} style={pct == null ? undefined : { width: `${pct}%` }} />
      </div>
      <div className="px-foot">
        <span>{label}</span>
        {pct != null && <span>{pct}%</span>}
      </div>
    </div>
  );
}

// progress: { label, value 0–1 }
export function ProgressOverlay({ progress }) {
  return (
    <div className="swal-backdrop is-loading">
      <PixelLoader label={progress.label} value={progress.value} />
    </div>
  );
}

// alert: { type: 'success' | 'error' | 'info', title, message, duration }
export function SweetAlert({ alert, onClose }) {
  const title = alert.title || TONE_TITLE[alert.type];
  return (
    <SwalCard type={alert.type} title={title} onClose={onClose}>
      {alert.message && <p>{alert.message}</p>}
      <button type="button" className={`btn swal-ok`} onClick={onClose} autoFocus>
        OK
      </button>
      {alert.type === 'success' && <span className="swal-timer" style={{ animationDuration: `${alert.duration}ms` }} />}
    </SwalCard>
  );
}
