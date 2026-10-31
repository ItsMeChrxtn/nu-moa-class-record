import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { Icon, titleCase, useUI } from './ui.jsx';

const what = (n) => `${n.kind === 'midterm' ? 'Midterm' : 'Final'} grade`;
const when = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Students: a bell with their grade notices ("Your final grade for ACT264 is now available").
// New notices also pop up once when the student opens the app.
export default function NotificationBell() {
  const { toast } = useUI();
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const announced = useRef(false);
  const unread = list.filter((n) => !n.read);

  const markRead = useCallback(() => {
    api('/me/notifications/read', { method: 'POST' })
      .then(() => setList((l) => l.map((n) => ({ ...n, read: true }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api('/me/notifications')
        .then((d) => {
          if (!alive) return;
          setList(d.notifications);
          const fresh = d.notifications.filter((n) => !n.read);
          if (fresh.length && !announced.current) {
            announced.current = true;
            // One line per class: "ZZ999 · Advanced Web Programming: midterm and final grades"
            const bySection = new Map();
            for (const n of fresh) {
              const key = n.section.id;
              if (!bySection.has(key)) bySection.set(key, { s: n.section, kinds: [] });
              bySection.get(key).kinds.push(n.kind === 'midterm' ? 'midterm' : 'final');
            }
            const lines = [...bySection.values()].map(({ s, kinds }) => {
              const k = [...new Set(kinds)].sort((a) => (a === 'midterm' ? -1 : 1));
              return `${s.code}${s.subjectTitle ? ` · ${titleCase(s.subjectTitle)}` : ''}: ${k.join(' and ')} grade${k.length > 1 ? 's' : ''}`;
            });
            toast(`${lines.join('\n')}\n\nYou can see ${fresh.length > 1 ? 'them' : 'it'} below. The bell keeps the list.`, 'info', 'Your grades are now available');
            // Shown once; the bell keeps the list.
            api('/me/notifications/read', { method: 'POST' }).catch(() => {});
          }
        })
        .catch(() => {});
    load();
    // Check again when the student comes back to the tab.
    const onFocus = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    if (unread.length) markRead();
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bell" ref={ref}>
      <button type="button" className={`btn bell-btn ${unread.length ? 'has-new' : ''}`} onClick={() => setOpen(!open)} aria-label={`Notifications${unread.length ? `, ${unread.length} new` : ''}`} aria-expanded={open}>
        <Icon name="bell" size={18} />
        {unread.length > 0 && <span className="bell-count">{unread.length}</span>}
      </button>
      {open && (
        <div className="bell-list" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            <span>{list.length ? `${list.length} recent` : ''}</span>
          </div>
          {list.length === 0 ? (
            <p className="bell-empty">Nothing yet. You&apos;ll be told here when your midterm or final grades are posted.</p>
          ) : (
            <ul>
              {list.map((n) => (
                <li key={n.id} className={n.read ? '' : 'new'}>
                  <span className={`bell-dot ${n.kind}`}><Icon name={n.kind === 'midterm' ? 'chart' : 'award'} size={15} /></span>
                  <span className="bell-text">
                    <strong>{what(n)} posted · {n.section.code}</strong>
                    <small>{[n.section.subjectCode, n.section.subjectTitle && titleCase(n.section.subjectTitle)].filter(Boolean).join(' · ')}</small>
                    <time dateTime={n.at}>{when(n.at)}</time>
                  </span>
                  {!n.read && <span className="bell-new">New</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
