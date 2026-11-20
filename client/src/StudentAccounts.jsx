import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { Avatar, EmptyState, Icon, PageLoader, useUI } from './ui.jsx';

export const ACCOUNT_LABEL = {
  none: 'No account',
  temp: 'Not emailed',
  sent: 'Emailed',
  active: 'Signed in',
};

function downloadCsv(filename, rows) {
  const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const text = ['Student number,Name,Email,Temporary password', ...rows.map((r) => [r.studentNo, r.name, r.email, r.tempPassword].map(csv).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

const signInText = (studentNo, pw) => `Student number: ${studentNo}\nTemporary password: ${pw}`;
const shortDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

// A student can get a temporary password unless they already signed in, or their account
// (and its password) came from another faculty's class.
const canSend = (s) => s.status !== 'active' && !s.shared;

// "Accounts" tab of a section: every student's sign-in status. The faculty ticks who should get a
// temporary password; it is emailed when possible and shown here otherwise.
export function AccountsView({ section, query, setQuery, onChanged }) {
  const { toast, confirm } = useUI();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [revealed, setRevealed] = useState({}); // student id -> temporary password, shown on request

  const load = () => api(`/faculty/sections/${section.id}/accounts`).then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [section.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () => (data ? data.students.filter((s) => `${s.name} ${s.studentNo} ${s.email || ''}`.toLowerCase().includes(q)) : []),
    [data, q]
  );
  const selectable = rows.filter(canSend);
  const allOn = selectable.length > 0 && selectable.every((s) => selected.has(s.id));

  if (error) return <div className="alert error"><Icon name="alert" />{error}</div>;
  if (!data) return <div className="card"><PageLoader /></div>;

  const count = (k) => data.students.filter((s) => s.status === k).length;
  const toggle = (id) =>
    setSelected((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const pick = (test) => setSelected(new Set(data.students.filter((s) => canSend(s) && test(s)).map((s) => s.id)));
  const toggleAll = () =>
    setSelected((cur) => {
      const next = new Set(cur);
      for (const s of selectable) allOn ? next.delete(s.id) : next.add(s.id);
      return next;
    });

  const chosen = data.students.filter((s) => selected.has(s.id));
  const byEmail = chosen.filter((s) => data.mailConfigured && s.email).length;
  const replacing = chosen.filter((s) => s.status !== 'none').length;

  async function reveal(s) {
    try {
      const d = await api(`/faculty/sections/${section.id}/students/${s.id}/temp-password`);
      setRevealed((r) => ({ ...r, [s.id]: d.tempPassword }));
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  // Older temporary passwords were never kept, so they cannot be shown: make a new one instead
  // (emailed when the student has an email, and shown here either way).
  async function renew(s) {
    const ok = await confirm({
      title: `New temporary password for ${s.name}?`,
      message: `The old temporary password was made before passwords could be viewed again, so it cannot be shown. A new one replaces it${s.email && data.mailConfigured ? ` and is emailed to ${s.email}` : ''}; you can copy it here.`,
      confirmLabel: 'Make new password',
    });
    if (!ok) return;
    try {
      const d = await api(`/faculty/sections/${section.id}/students/${s.id}/reset-password`, { method: 'POST', label: 'Making a new password…' });
      setRevealed((r) => ({ ...r, [s.id]: d.tempPassword }));
      toast(d.mail?.sent ? `New password emailed to ${d.email}` : 'New password ready: copy it and send it to the student', d.mail?.sent ? 'success' : 'info');
      load();
      onChanged?.();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const copy = (studentNo, pw) => navigator.clipboard.writeText(signInText(studentNo, pw)).then(() => toast('Sign-in details copied'));

  async function send() {
    const parts = [
      byEmail && `${byEmail} will get it by email`,
      chosen.length - byEmail && `${chosen.length - byEmail} will be shown here for you to hand out`,
    ].filter(Boolean);
    const ok = await confirm({
      title: `Send a temporary password to ${chosen.length} student${chosen.length === 1 ? '' : 's'}?`,
      message: `${parts.join(', ')}.${replacing ? ` ${replacing} already ha${replacing === 1 ? 's' : 've'} a temporary password; it will be replaced with a new one.` : ''}`,
      confirmLabel: 'Send',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const d = await api(`/faculty/sections/${section.id}/accounts/send`, {
        method: 'POST',
        body: { studentIds: chosen.map((s) => s.id) },
        label: 'Sending temporary passwords…',
      });
      setResult(d.result);
      setSelected(new Set());
      setRevealed({});
      const handOut = d.result.shown.length + d.result.failed.filter((f) => f.tempPassword).length;
      if (d.result.sent) toast(`${d.result.sent} emailed${handOut ? `, ${handOut} to hand out` : ''}`);
      else if (handOut) toast(`${handOut} password${handOut === 1 ? '' : 's'} to hand out`, 'info');
      load();
      onChanged?.();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const handOut = result ? [...result.shown, ...result.failed.filter((f) => f.tempPassword)] : [];

  return (
    <>
      {result && (
        <div className="card acct-result">
          <div className="acct-result-head">
            <div>
              <strong>Sent</strong>
              <span>
                {result.sent} emailed · {handOut.length} to hand out
                {result.failed.length > 0 && ` · ${result.failed.length} email${result.failed.length === 1 ? '' : 's'} failed`}
              </span>
            </div>
            <div className="toolbar-right">
              {handOut.length > 0 && (
                <button className="btn" onClick={() => downloadCsv(`student-accounts-${section.code}.csv`, handOut)}>
                  <Icon name="download" size={16} /> Download CSV
                </button>
              )}
              <button className="icon-btn" title="Close" onClick={() => setResult(null)}><Icon name="x" size={16} /></button>
            </div>
          </div>
          {result.failed.length > 0 && (
            <div className="alert error"><Icon name="alert" /><span>Could not email: {[...new Set(result.failed.map((f) => f.error))].join('; ')}. Give these students the password below.</span></div>
          )}
          {handOut.length > 0 && (
            <div className="cred-table">
              {handOut.map((c) => (
                <div key={c.studentNo} className="cred-line">
                  <div className="roster-info">
                    <strong>{c.name}</strong>
                    <span>{c.studentNo}{c.email ? ` · ${c.email}` : ''}</span>
                  </div>
                  <code>{c.tempPassword}</code>
                  <button className="icon-btn" title="Copy sign-in details" onClick={() => copy(c.studentNo, c.tempPassword)}>
                    <Icon name="copy" size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card table-card">
        <div className="table-toolbar">
          <div className="toolbar-title">
            <strong>Student accounts</strong>
            <span>
              {count('active')} signed in · {count('sent')} emailed · {count('temp')} not emailed · {count('none')} no account
            </span>
          </div>
          <div className="toolbar-right">
            <span className="input-icon">
              <Icon name="search" />
              <input placeholder="Search by name, ID number or email…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </span>
            <button className="btn primary" disabled={busy || chosen.length === 0} onClick={send}>
              <Icon name="mail" size={16} />
              {busy ? 'Sending…' : chosen.length ? `Send password to ${chosen.length}` : 'Send password'}
            </button>
          </div>
        </div>
        <div className="toolbar-meta table-meta acct-pick">
          <span>Select:</span>
          <button className="link-btn" onClick={() => pick((s) => s.status === 'none')}>No account</button>
          <button className="link-btn" onClick={() => pick((s) => s.status === 'temp')}>Not emailed</button>
          <button className="link-btn" onClick={() => pick((s) => s.status === 'sent')}>Emailed, not signed in</button>
          <button className="link-btn" onClick={() => pick(() => true)}>All not signed in</button>
          {selected.size > 0 && <button className="link-btn" onClick={() => setSelected(new Set())}>Clear ({selected.size})</button>}
          {!data.mailConfigured && <span className="no-mail">Email is not set up on the server: passwords are shown here instead.</span>}
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="users" title={data.students.length ? 'No match' : 'No students yet'}>
            {data.students.length ? 'No student matches your search.' : 'Import the class list first.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="acct-table">
              <thead>
                <tr>
                  <th className="acct-check">
                    <input type="checkbox" checked={allOn} disabled={!selectable.length} onChange={toggleAll} title="Select all shown" />
                  </th>
                  <th>Student</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Temporary password</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const on = selected.has(s.id);
                  return (
                    <tr key={s.id} className={on ? 'on' : ''} onClick={() => canSend(s) && toggle(s.id)}>
                      <td className="acct-check">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!canSend(s)}
                          title={s.status === 'active' ? 'Already signed in' : s.shared ? 'Account from another class' : ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggle(s.id)}
                        />
                      </td>
                      <td>
                        <div className="acct-who">
                          <Avatar name={s.name} size={28} />
                          <div className="roster-info">
                            <strong>{s.name}</strong>
                            <span>{s.studentNo}</span>
                          </div>
                        </div>
                      </td>
                      <td>{s.email || <em className="no-mail">no email</em>}</td>
                      <td>
                        <span className={`acct-chip acct-${s.status}`}><i />{s.shared ? 'From another class' : ACCOUNT_LABEL[s.status]}</span>
                        <small className="acct-when">
                          {s.status === 'active' ? s.lastLoginAt && `Last sign-in ${shortDate(s.lastLoginAt)}` : s.status === 'sent' && s.sentAt && `Emailed ${shortDate(s.sentAt)}`}
                        </small>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {s.status === 'temp' || s.status === 'sent' ? (
                          revealed[s.id] ? (
                            <span className="acct-pw">
                              <code>{revealed[s.id]}</code>
                              <button className="icon-btn" title="Copy sign-in details" onClick={() => copy(s.studentNo, revealed[s.id])}>
                                <Icon name="copy" size={15} />
                              </button>
                            </span>
                          ) : s.viewable ? (
                            <button className="btn btn-sm" onClick={() => reveal(s)}>
                              <Icon name="eye" size={14} /> Show
                            </button>
                          ) : s.shared ? (
                            <span className="muted small">Issued in another class</span>
                          ) : (
                            <button className="btn btn-sm" title="The old password cannot be shown" onClick={() => renew(s)}>
                              <Icon name="key" size={14} /> New password
                            </button>
                          )
                        ) : (
                          <span className="muted small">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
