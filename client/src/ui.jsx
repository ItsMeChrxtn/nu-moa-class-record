import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const paths = {
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  sliders: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  layers: <><path d="m12 2 10 5-10 5L2 7l10-5z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" /><path d="M20 17v5H6.5A2.5 2.5 0 0 1 4 19.5" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22" />,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  arrowLeft: <path d="M19 12H5M12 19l-7-7 7-7" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  trash: <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />,
  award: <><circle cx="12" cy="8" r="6" /><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  star: <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  edit:<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  unlock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></>,
  upload:<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
  userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>,
  userMinus: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 11h-6" /></>,
  more: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  sparkle:<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />,
};

export function Icon({ name, size = 18, className = '', strokeWidth = 2 }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function BrandMark({ size = 'md' }) {
  return <span className={`brand-mark ${size}`} aria-hidden="true" />;
}

// "LAST, FIRST MIDDLE" -> { first: "First Middle", last: "Last" }
export function splitName(name = '') {
  if (!name.includes(',')) return { first: titleCase(name), last: '' };
  const [last, first] = name.split(',');
  return { first: titleCase(first.trim()), last: titleCase(last.trim()) };
}

// "CHRISTIAN LLOYD E. DEL ROSARIO" -> "Christian Lloyd E. Del Rosario"
export const titleCase = (s = '') => s.toLowerCase().replace(/(^|[\s.-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());

export function firstName(name = '') {
  // Names may be "LAST, FIRST M." or "FIRST M. LAST".
  const part = name.includes(',') ? name.split(',')[1] : name;
  return titleCase(part.trim().split(/\s+/)[0] || '');
}

export function initials(name = '') {
  const [last, first] = name.includes(',') ? name.split(',') : [null, name];
  const words = (first || '').trim().split(/\s+/).filter((w) => !w.endsWith('.'));
  const a = words[0]?.[0] || '';
  const b = last ? last.trim()[0] : words[words.length - 1]?.[0] || '';
  return (a + (words.length > 1 || last ? b : '')).toUpperCase();
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Avatar({ name, size = 36 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </span>
  );
}

export function Stat({ icon, label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <Icon name={icon} size={16} />}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function eqTone(eq) {
  if (eq == null) return 'none';
  if (eq === 'R' || eq === 'Repeat') return 'fail';
  if (eq === '4.0' || eq === '3.5' || eq === 'Pass') return 'high';
  if (eq === '3.0' || eq === '2.5') return 'good';
  return 'mid';
}

export function EqBadge({ eq, size }) {
  return <span className={`eq-badge tone-${eqTone(eq)} ${size || ''}`}>{eq ?? '—'}</span>;
}

// Percent ring. Large: label, percent and a grade-point pill inside. Mini: percent and grade point only.
export function Ring({ percent, eq, label, size = 190, stroke = 14, mini = false }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const fail = eqTone(eq) === 'fail';
  const value = percent == null ? '—' : Number(percent).toFixed(mini ? 0 : 2);
  return (
    <div className={`ring tone-${eqTone(eq)} ${mini ? 'mini' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="butt"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          style={{ '--c': c }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">
        {mini ? (
          <>
            <span className="ring-num">{value}</span>
            <span className={`mini-gp ${fail ? 'fail' : ''}`}>{eq ?? '—'}</span>
          </>
        ) : (
          <>
            {label && <span className="ring-label">{label}</span>}
            <span className="ring-num">{value}</span>
            <span className={`gp ${fail ? 'gp-fail' : ''}`}>{eq == null ? '—' : /^\d/.test(eq) ? `GP ${eq}` : eq}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function Hero({ eyebrow, title, lead, back, actions, children }) {
  return (
    <section className="hero">
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-inner">
        <div className="hero-text">
          {back}
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {lead && <p className="lead">{lead}</p>}
          {children}
        </div>
        {actions && <div className="hero-actions">{actions}</div>}
      </div>
    </section>
  );
}

// A button that opens a short list of actions. items: [{ label, icon, onClick, danger }] or 'divider'.
export function Menu({ label, icon = 'more', items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={icon} size={16} /> {label} <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className={`menu-list menu-${align}`} role="menu">
          {items.map((it, i) =>
            it === 'divider' ? (
              <hr key={i} />
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={it.danger ? 'danger' : ''}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
              >
                <Icon name={it.icon} size={16} />
                <span>
                  {it.label}
                  {it.hint && <small>{it.hint}</small>}
                </span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="page-loader">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message }) {
  return (
    <div className="container">
      <div className="alert error"><Icon name="alert" />{message}</div>
    </div>
  );
}

export function EmptyState({ icon = 'layers', title, children }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Modal({ title, subtitle, icon, tone = 'brand', onClose, children, footer, width = 460 }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          {icon && <span className={`modal-icon tone-${tone}`}><Icon name={icon} size={20} /></span>}
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn modal-x" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);

  const toast = useCallback((message, type = 'success') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const confirm = useCallback((opts) => new Promise((resolve) => setDialog({ ...opts, resolve })), []);

  const close = (ok) => {
    dialog.resolve(ok);
    setDialog(null);
  };

  return (
    <UIContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <Icon name={t.type === 'error' ? 'alert' : 'check'} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
      {dialog && <ConfirmDialog dialog={dialog} close={close} />}
    </UIContext.Provider>
  );
}

// requireText: the user must type this exact text before the confirm button enables.
function ConfirmDialog({ dialog, close }) {
  const [typed, setTyped] = useState('');
  const locked = dialog.requireText && typed.trim().toUpperCase() !== dialog.requireText.toUpperCase();
  return (
    <Modal
      title={dialog.title}
      icon={dialog.danger ? 'alert' : 'info'}
      tone={dialog.danger ? 'bad' : 'brand'}
      onClose={() => close(false)}
      width={440}
      footer={
        <>
          <button className="btn" onClick={() => close(false)}>Cancel</button>
          <button className={`btn ${dialog.danger ? 'danger' : 'primary'}`} onClick={() => close(true)} disabled={locked} autoFocus={!dialog.requireText}>
            {dialog.confirmLabel || 'Continue'}
          </button>
        </>
      }
    >
      <p className="dialog-msg">{dialog.message}</p>
      {dialog.requireText && (
        <label className="field">
          <span>Type <code>{dialog.requireText}</code> to confirm</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !locked && close(true)}
            autoFocus
          />
        </label>
      )}
    </Modal>
  );
}

export const useUI = () => useContext(UIContext);
