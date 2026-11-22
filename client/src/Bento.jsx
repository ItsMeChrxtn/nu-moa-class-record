// Bento dashboard building blocks: a grid of tiles of different sizes.
import { Link } from 'react-router-dom';
import { DAYS, meetingsOn, roomLabel, to12, todayCode } from './api.js';
import { Icon, titleCase } from './ui.jsx';

// The grid. `layout` picks a set of named areas from bento.css (faculty | admin | student).
export function Bento({ layout, children }) {
  return <div className={`bento bento-${layout}`}>{children}</div>;
}

export function Tile({ area, className = '', title, sub, action, children }) {
  return (
    <section className={`tile ${className}`} style={area ? { gridArea: area } : undefined}>
      {(title || action) && (
        <header className="tile-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <p>{sub}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

// Small number tile: icon, label, figure, one line under it, optional meter.
export function MiniStat({ area, icon, label, value, sub, tone = 'blue', meter }) {
  return (
    <section className={`tile mini tone-${tone}`} style={area ? { gridArea: area } : undefined}>
      <span className="mini-icon"><Icon name={icon} size={17} /></span>
      <span className="mini-label">{label}</span>
      <strong className="mini-value">{value}</strong>
      {meter != null && <span className="mini-meter"><i style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} /></span>}
      {sub && <span className="mini-sub">{sub}</span>}
    </section>
  );
}

// The big tile: campus photo, date, greeting, a line, actions, and whatever sits at its foot.
export function HeroTile({ area = 'hero', meta, title, lead, actions, children }) {
  const d = new Date();
  return (
    <section className="tile hero-tile" style={{ gridArea: area }}>
      <div className="hero-photo" aria-hidden="true" />
      <div className="hero-top">
        <span className="hero-date">
          <b>{d.toLocaleDateString(undefined, { weekday: 'long' })}</b>
          {d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
        </span>
        {meta && <span className="hero-meta">{meta}</span>}
      </div>
      <h1>{title}</h1>
      {lead && <p className="hero-lead">{lead}</p>}
      {actions && <div className="hero-actions">{actions}</div>}
      {children && <div className="hero-foot">{children}</div>}
    </section>
  );
}

const toMin = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);

// The class in progress, or the next one within the coming week.
export function nextMeeting(sections) {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = DAYS.indexOf(todayCode());
  for (let off = 0; off < 7; off++) {
    const day = DAYS[(start + off) % 7];
    const list = sections
      .flatMap((s) => meetingsOn(s, day).map((m) => ({ ...m, s })))
      .filter((m) => off > 0 || toMin(m.end) == null || toMin(m.end) > mins)
      .sort((a, b) => (a.start || '99').localeCompare(b.start || '99'));
    if (list.length) {
      const m = list[0];
      const live = off === 0 && toMin(m.start) != null && toMin(m.start) <= mins;
      return { ...m, off, live };
    }
  }
  return null;
}

const WHEN = (off) => (off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : null);

// "Next class" card that sits inside the hero tile.
export function NextClass({ sections }) {
  const n = nextMeeting(sections);
  if (!n)
    return (
      <div className="next-class empty">
        <Icon name="calendar" size={18} />
        <span>No classes on the schedule this week</span>
      </div>
    );
  return (
    <Link to={`/faculty/sections/${n.s.id}`} className={`next-class ${n.live ? 'live' : ''}`}>
      <span className="nc-tag">{n.live ? 'In class now' : 'Next class'}</span>
      <span className="nc-when">
        <b>{to12(n.start) || '—'}</b>
        <small>{WHEN(n.off) || n.day.slice(0, 1) + n.day.slice(1).toLowerCase()}</small>
      </span>
      <span className="nc-what">
        <strong>{n.s.code}</strong>
        <small>{titleCase(n.s.subjectTitle || n.s.subjectCode || '')}</small>
      </span>
      {n.room && <span className="nc-room"><Icon name="layers" size={14} /> {roomLabel(n.room)}</span>}
      <span className="nc-go"><Icon name="chevronRight" size={18} /></span>
    </Link>
  );
}

// Monday to Saturday as columns, each with that day's classes.
export function WeekTile({ area = 'week', sections, colors, onOpen }) {
  const today = todayCode();
  const days = DAYS.slice(0, 6);
  return (
    <Tile area={area} className="week-tile" title="This week" sub="Your classes, Monday to Saturday" action={onOpen && <button type="button" className="tile-link" onClick={onOpen}>Full schedule <Icon name="chevronRight" size={14} /></button>}>
      <div className="week-cols">
        {days.map((d) => {
          const list = sections.flatMap((s) => meetingsOn(s, d).map((m) => ({ ...m, s }))).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
          return (
            <div key={d} className={`week-col ${d === today ? 'is-today' : ''}`}>
              <span className="week-day">{d.slice(0, 1) + d.slice(1, 3).toLowerCase()}</span>
              {list.length ? list.map((m, i) => (
                <Link key={i} to={`/faculty/sections/${m.s.id}`} className={`week-chip sc-${colors?.get(m.s.id) ?? 0}`} title={`${m.s.code} · ${m.time}`}>
                  <b>{m.s.code.replace(/^[A-Z]+/, '')}</b>
                  <small>{to12(m.start).replace(':00', '')}</small>
                </Link>
              )) : <span className="week-free">Free</span>}
            </div>
          );
        })}
      </div>
    </Tile>
  );
}
