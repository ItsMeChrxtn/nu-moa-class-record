import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { Icon, titleCase, useUI } from './ui.jsx';

// Title and icon for one notice.
const TITLE = { midterm: 'Midterm grade released', final: 'Final grade released', score: 'New score', attendance: 'Attendance recorded' };
const ICON = { midterm: 'chart', final: 'award', score: 'edit', attendance: 'calendar' };
const subject = (n) => [n.section.code, n.section.subjectTitle && titleCase(n.section.subjectTitle)].filter(Boolean).join(' · ');
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
            // The newest few in one pop-up: "ACT262 · Nov 13 · Present".
            const lines = fresh.slice(0, 4).map((n) => `${n.section.code} · ${n.text || TITLE[n.kind] || 'Update'}`);
            const more = fresh.length > 4 ? `\n…and ${fresh.length - 4} more in the bell.` : '';
            toast(`${lines.join('\n')}${more}`, 'info', fresh.length === 1 ? TITLE[fresh[0].kind] || 'New update' : `${fresh.length} new updates in your classes`);
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
            <p className="bell-empty">Nothing yet. New scores, attendance and released grades show up here.</p>
          ) : (
            <ul>
              {list.map((n) => (
                <li key={n.id} className={n.read ? '' : 'new'}>
                  <span className={`bell-dot ${n.kind}`}><Icon name={ICON[n.kind] || 'bell'} size={15} /></span>
                  <span className="bell-text">
                    <strong>{TITLE[n.kind] || 'Update'}{n.text ? `: ${n.text}` : ''}</strong>
                    <small>{subject(n)}</small>
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

const names = (list) => {
  const first = list.slice(0, 3).map((s) => titleCase(s.name));
  return list.length > 3 ? `${first.join(', ')} and ${list.length - 3} more` : first.join(', ').replace(/, ([^,]*)$/, ' and $1');
};

// Faculty: a bell with the students who signed in, grouped by section ("ACT264 · 3 students signed in").
// Clicking a section opens its Accounts tab. New sign-ins also pop up once when the app opens.
export function FacultyBell() {
  const { toast } = useUI();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const announced = useRef(false);
  const unread = groups.reduce((n, g) => n + g.unread, 0);

  const markRead = useCallback(() => {
    api('/faculty/notifications/read', { method: 'POST' })
      .then(() => setGroups((gs) => gs.map((g) => ({ ...g, unread: 0, students: g.students.map((s) => ({ ...s, read: true })) }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api('/faculty/notifications')
        .then((d) => {
          if (!alive) return;
          setGroups(d.groups);
          const fresh = d.groups.filter((g) => g.unread);
          if (fresh.length && !announced.current) {
            announced.current = true;
            const total = fresh.reduce((n, g) => n + g.unread, 0);
            const lines = fresh.slice(0, 4).map((g) => `${g.section.code} · ${g.unread} signed in (${g.signedIn} of ${g.total})`);
            const more = fresh.length > 4 ? `\n…and ${fresh.length - 4} more sections in the bell.` : '';
            toast(`${lines.join('\n')}${more}`, 'info', `${total} student${total === 1 ? '' : 's'} signed in`);
          }
        })
        .catch(() => {});
    load();
    const onFocus = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      // Read once the list was seen and closed, so the "New" marks show while it is open.
      if (unread) markRead();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bell" ref={ref}>
      <button type="button" className={`btn bell-btn ${unread ? 'has-new' : ''}`} onClick={() => setOpen(!open)} aria-label={`Notifications${unread ? `, ${unread} new` : ''}`} aria-expanded={open}>
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="bell-count">{unread}</span>}
      </button>
      {open && (
        <div className="bell-list" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Student sign-ins</strong>
            <span>Last 30 days</span>
          </div>
          {groups.length === 0 ? (
            <p className="bell-empty">No sign-ins yet. When a student signs in and sets their password, it shows up here per section.</p>
          ) : (
            <ul>
              {groups.map((g) => {
                const fresh = g.students.filter((s) => !s.read);
                const shown = fresh.length ? fresh : g.students;
                return (
                  <li key={g.section.id} className={`bell-link ${g.unread ? 'new' : ''}`} onClick={() => { setOpen(false); navigate(`/faculty/sections/${g.section.id}`, { state: { view: 'accounts' } }); }}>
                    <span className="bell-dot signin"><Icon name="users" size={15} /></span>
                    <span className="bell-text">
                      <strong>
                        {g.section.code} · {fresh.length ? `${fresh.length} new sign-in${fresh.length === 1 ? '' : 's'}` : `${g.students.length} signed in recently`}
                      </strong>
                      <small title={shown.map((s) => titleCase(s.name)).join(', ')}>{names(shown)}</small>
                      <span className="bell-progress" title={`${g.signedIn} of ${g.total} students have signed in`}>
                        <span style={{ width: `${g.total ? (g.signedIn / g.total) * 100 : 0}%` }} />
                      </span>
                      <time dateTime={g.students[0].at}>{g.signedIn} of {g.total} signed in · {when(g.students[0].at)}</time>
                    </span>
                    {g.unread > 0 && <span className="bell-new">New</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
