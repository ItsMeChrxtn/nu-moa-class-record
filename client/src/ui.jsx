import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { activity } from './api.js';
import { Notes, PixelLoader, ProgressOverlay, SwalCard } from './Feedback.jsx';

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
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
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

// "DEL ROSARIO, CHRISTIAN LLOYD E." -> "Christian Lloyd E. Del Rosario"
export function displayName(name = '') {
  const i = name.indexOf(',');
  return titleCase(i < 0 ? name : `${name.slice(i + 1).trim()} ${name.slice(0, i).trim()}`);
}

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

export function Avatar({ name, size = 36, photo }) {
  return (
    <span className={`avatar ${photo ? 'has-photo' : ''}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {photo ? <img src={photo} alt="" /> : initials(name)}
    </span>
  );
}

// tone: blue | teal | amber | ink | red — the colour of the icon tile.
export function Stat({ icon, label, value, sub, tone, trend, meter }) {
  return (
    <div className={`stat ${tone ? `stat-tone tone-${tone}` : ''}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && (tone ? <span className="stat-icon"><Icon name={icon} size={18} /></span> : <Icon name={icon} size={16} />)}
      </div>
      <div className="stat-value">{value}</div>
      {meter != null && <span className="stat-meter"><i style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} /></span>}
      {(sub || trend) && (
        <div className="stat-sub">
          {trend && <span className={`stat-trend ${trend.dir || ''}`}>{trend.dir === 'down' ? '▼' : trend.dir === 'up' ? '▲' : ''} {trend.text}</span>}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}

// NU MOA building, drawn: a glass facade of hexagon windows with the crest at the top.
function CampusArt() {
  const hexes = [];
  const r = 11; // hexagon radius
  const w = Math.sqrt(3) * r;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 9; col++) {
      const x = 34 + col * w + (row % 2 ? w / 2 : 0);
      const y = 40 + row * r * 1.5;
      if (row === 0 && (col === 4 || col === 3)) continue; // room for the crest
      const pts = [0, 1, 2, 3, 4, 5].map((i) => {
        const t = (Math.PI / 3) * i - Math.PI / 2;
        return `${(x + (r - 1.6) * Math.cos(t)).toFixed(1)},${(y + (r - 1.6) * Math.sin(t)).toFixed(1)}`;
      });
      const lit = (row * 7 + col * 3) % 11 === 0;
      hexes.push(<polygon key={`${row}-${col}`} points={pts.join(' ')} className={lit ? 'cb-lit' : row > 5 ? 'cb-low' : 'cb-glass'} />);
    }
  }
  return (
    <svg className="campus-art" viewBox="0 0 220 160" role="img" aria-label="NU MOA campus building">
      <defs>
        <linearGradient id="cb-sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity="0.16" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></linearGradient>
        <clipPath id="cb-clip"><rect x="22" y="22" width="176" height="122" rx="16" /></clipPath>
      </defs>
      <rect x="22" y="22" width="176" height="122" rx="16" fill="#f4f7ff" />
      <g clipPath="url(#cb-clip)">{hexes}</g>
      <rect x="22" y="22" width="176" height="122" rx="16" fill="url(#cb-sky)" />
      <g transform="translate(110 34)">
        <polygon points="0,-13 11.3,-6.5 11.3,6.5 0,13 -11.3,6.5 -11.3,-6.5" fill="#ffffff" stroke="#f5b100" strokeWidth="2" />
        <path d="M-5 -5 h10 v6 c0 4 -5 6 -5 6 c0 0 -5 -2 -5 -6z" fill="#2447c7" />
        <path d="M-2.5 -2 h5" stroke="#f5b100" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <rect x="10" y="142" width="200" height="6" rx="3" fill="#ffffff" fillOpacity="0.22" />
      <rect x="92" y="128" width="36" height="16" rx="3" fill="#1b3486" />
      <path d="M6 148 q10 -14 22 -2 q8 -12 18 2z" fill="#f5b100" fillOpacity="0.85" />
      <path d="M176 148 q10 -16 24 0 q6 -8 14 0z" fill="#f5b100" fillOpacity="0.7" />
    </svg>
  );
}

// Dashboard welcome card: greeting and a real summary on the left, today's date on the right.
export function WelcomeBanner({ eyebrow, title, lead, actions, facts = [] }) {
  const d = new Date();
  return (
    <section className="hero-nu">
      <div className="hero-nu-photo" role="img" aria-label="NU MOA campus building" />
      <div className="hero-nu-shade" />
      <div className="hero-nu-body">
        <div className="hero-nu-top">
          {eyebrow && <span className="hero-nu-tag"><i />{eyebrow}</span>}
          <span className="hero-nu-date">{d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        </div>
        <h1>{title}</h1>
        {lead && <p className="hero-nu-lead">{lead}</p>}
        <div className="hero-nu-foot">
          {actions && <div className="hero-nu-actions">{actions}</div>}
          {facts.length > 0 && (
            <dl className="hero-nu-facts">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      <span className="hero-nu-mark" aria-hidden="true">NU MOA</span>
    </section>
  );
}

// A button that downloads a file and shows that it is working ("Preparing…") until the file is saved.
export function DownloadButton({ url, children, className = 'btn', title, small }) {
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`${className} ${busy ? 'is-busy' : ''}`}
      title={title}
      disabled={busy}
      aria-busy={busy}
      onClick={async (e) => {
        // Buttons inside a card link must not open the card.
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        try {
          const { downloadFile } = await import('./api.js');
          const name = await downloadFile(url);
          toast(`Downloaded ${name}`);
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <span className="spinner sm" /> : <Icon name="download" size={small ? 14 : 16} />} {busy ? 'Preparing…' : children}
    </button>
  );
}

// A time picker that always shows AM/PM (the browser's own time box follows the PC's 24-hour setting).
// value / onChange use "HH:MM" (24-hour), '' when not set.
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
// min / max ("HH:MM", optional) limit what can be picked: options outside are greyed out, and a
// choice that would land outside (e.g. switching AM to PM) snaps to the nearest allowed time.
export function TimeInput({ value, onChange, label, min, max }) {
  const [h24, m] = value ? value.split(':').map(Number) : [null, null];
  const parts = value ? { h: h24 % 12 || 12, m: String(m).padStart(2, '0'), ap: h24 < 12 ? 'AM' : 'PM' } : { h: '', m: '', ap: '' };
  const hhmm = (h, mm, ap) => `${String((Number(h) % 12) + (ap === 'PM' ? 12 : 0)).padStart(2, '0')}:${mm}`;
  const allowed = (t) => (!min || t >= min) && (!max || t <= max);
  // Minutes that aren't on the 5-minute list (e.g. from a PDF) are kept as an option.
  const minutes = parts.m && !MINUTES.includes(parts.m) ? [...MINUTES, parts.m].sort() : MINUTES;
  const apOk = (ap) => HOURS.some((h) => minutes.some((mm) => allowed(hhmm(h, mm, ap))));
  const ap = parts.ap || (apOk('AM') ? 'AM' : 'PM');
  const hourOk = (h) => minutes.some((mm) => allowed(hhmm(h, mm, ap)));
  const emit = (next) => {
    const p = { ...parts, ap, ...next };
    if (p.h === '') return onChange('');
    let t = hhmm(p.h, p.m || '00', p.ap);
    if (!allowed(t)) {
      // Try the other half of the day first (picking "7" when only PM is allowed means 7 PM), then snap.
      const other = hhmm(p.h, p.m || '00', p.ap === 'AM' ? 'PM' : 'AM');
      t = next.ap === undefined && allowed(other) ? other : min && t < min ? min : max || t;
    }
    onChange(t);
  };
  return (
    <span className="time-input" role="group" aria-label={label}>
      <select value={parts.h} onChange={(e) => emit({ h: e.target.value })} aria-label={`${label} hour`}>
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h} value={h} disabled={!hourOk(h)}>{h}</option>
        ))}
      </select>
      <span className="time-colon">:</span>
      <select value={parts.m} onChange={(e) => emit({ m: e.target.value })} aria-label={`${label} minutes`} disabled={parts.h === ''}>
        {parts.h === '' && <option value="">--</option>}
        {minutes.map((x) => (
          <option key={x} value={x} disabled={parts.h !== '' && !allowed(hhmm(parts.h, x, ap))}>{x}</option>
        ))}
      </select>
      <select value={parts.ap} onChange={(e) => emit({ ap: e.target.value })} aria-label={`${label} AM or PM`} disabled={parts.h === ''} className="time-ap">
        {parts.h === '' && <option value="">--</option>}
        <option value="AM" disabled={!apOk('AM')}>AM</option>
        <option value="PM" disabled={!apOk('PM')}>PM</option>
      </select>
    </span>
  );
}

// Today's date, e.g. "Tue · Oct 27, 2026", for dashboard headers.
export function TodayChip() {
  const d = new Date();
  return (
    <span className="today-chip">
      <Icon name="calendar" size={15} />
      <span>
        <strong>{d.toLocaleDateString(undefined, { weekday: 'short' })}</strong> · {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
    </span>
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

export function Hero({ eyebrow, title, lead, back, actions, children, compact }) {
  return (
    <section className={`hero ${compact ? 'hero-compact' : ''}`}>
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

// Shown while a page loads its data: the same look as the loading popup, in the page.
export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="page-loader">
      <PixelLoader label={label === 'Loading…' ? 'Getting your data…' : label} />
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

const MIN_RUN = 400; // ms the progress line stays at least, so it never just flickers
const DONE_PAUSE = 200; // ms showing 100% before it fades
const ALERT_MS = { success: 2600, info: 4500, error: 7000 }; // how long a notification stays

export function UIProvider({ children }) {
  const [alerts, setAlerts] = useState([]); // corner notifications
  const [dialog, setDialog] = useState(null);
  const [progress, setProgress] = useState(null); // { label, value, done }
  const run = useRef({ active: new Map(), shownAt: 0, failed: false, timer: null });

  // toast(message, 'success' | 'error' | 'info', title?) shows a notification in the corner.
  const toast = useCallback((message, type = 'success', title) => {
    setAlerts((a) => [...a, { id: Math.random(), message, type, title, duration: ALERT_MS[type] || ALERT_MS.info }]);
  }, []);
  const closeAlert = useCallback((id) => setAlerts((a) => a.filter((x) => x.id !== id)), []);

  // Loading bar: follows every save / delete / download announced by api.js.
  useEffect(() => {
    let alive = true;
    const st = run.current;
    const tick = () => {
      setProgress((p) => {
        if (!p || p.done) return p;
        const real = Math.max(0, ...[...st.active.values()].map((x) => x.value || 0));
        // Ease towards 90% while waiting; real download progress can push it further.
        const eased = p.value + (0.9 - p.value) * 0.09;
        return { ...p, value: Math.min(0.97, Math.max(eased, real * 0.97)) };
      });
    };
    const finish = () => {
      const wait = Math.max(0, MIN_RUN - (Date.now() - st.shownAt));
      setTimeout(() => {
        if (!alive || st.active.size) return; // something new started meanwhile
        clearInterval(st.timer);
        st.timer = null;
        if (st.failed) {
          setProgress(null);
          return;
        }
        setProgress((p) => p && { ...p, value: 1 });
        setTimeout(() => alive && !st.active.size && setProgress(null), DONE_PAUSE);
      }, wait);
    };
    const onStart = (e) => {
      const { id, label } = e.detail;
      if (!st.active.size && !st.timer) {
        st.shownAt = Date.now();
        st.failed = false;
        setProgress({ label, value: 0.04, done: false });
        st.timer = setInterval(tick, 90);
      } else setProgress((p) => (p ? { ...p, label, done: false } : { label, value: 0.04, done: false }));
      st.active.set(id, { value: 0 });
    };
    const onProgress = (e) => {
      const x = st.active.get(e.detail.id);
      if (x) x.value = e.detail.value;
    };
    const onEnd = (e) => {
      st.active.delete(e.detail.id);
      if (!e.detail.ok) st.failed = true;
      if (!st.active.size) finish();
    };
    activity.addEventListener('start', onStart);
    activity.addEventListener('progress', onProgress);
    activity.addEventListener('end', onEnd);
    return () => {
      alive = false;
      clearInterval(st.timer);
      st.timer = null;
      activity.removeEventListener('start', onStart);
      activity.removeEventListener('progress', onProgress);
      activity.removeEventListener('end', onEnd);
    };
  }, []);

  const confirm = useCallback((opts) => new Promise((resolve) => setDialog({ ...opts, resolve })), []);

  const close = (ok) => {
    dialog.resolve(ok);
    setDialog(null);
  };

  return (
    <UIContext.Provider value={{ toast, confirm }}>
      {children}
      {progress && <ProgressOverlay progress={progress} />}
      <Notes alerts={alerts} onClose={closeAlert} />
      {dialog && <ConfirmDialog dialog={dialog} close={close} />}
    </UIContext.Provider>
  );
}

// requireText: the user must type this exact text before the confirm button enables.
function ConfirmDialog({ dialog, close }) {
  const [typed, setTyped] = useState('');
  const locked = dialog.requireText && typed.trim().toUpperCase() !== dialog.requireText.toUpperCase();
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && close(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [close]);
  return (
    <SwalCard type={dialog.danger ? 'warning' : 'question'} title={dialog.title} onClose={() => close(false)}>
        {dialog.message && <p>{dialog.message}</p>}
        {dialog.requireText && (
          <label className="field swal-field">
            <span>Type <code>{dialog.requireText}</code> to confirm</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !locked && close(true)}
              autoFocus
            />
          </label>
        )}
        <div className="swal-actions">
          <button type="button" className="btn" onClick={() => close(false)}>Cancel</button>
          <button type="button" className={`btn ${dialog.danger ? 'danger' : 'primary'}`} onClick={() => close(true)} disabled={locked} autoFocus={!dialog.requireText}>
            {dialog.confirmLabel || 'Continue'}
          </button>
        </div>
    </SwalCard>
  );
}

export const useUI = () => useContext(UIContext);
