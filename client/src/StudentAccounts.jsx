import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { Avatar, Icon, Modal, PageLoader, useUI } from './ui.jsx';

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

// Create student accounts for a section and email each student their temporary password.
export function StudentAccountsModal({ section, onClose, onDone }) {
  const { toast } = useUI();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [resend, setResend] = useState(false);
  const [includeNoEmail, setIncludeNoEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api(`/faculty/sections/${section.id}/accounts`).then(setData).catch((e) => setError(e.message));
  }, [section.id]);

  // Same rules as the server, so the button says exactly how many will be sent.
  const plan = useMemo(() => {
    if (!data) return null;
    const p = { email: 0, show: 0, active: 0, shared: 0, sent: 0, noEmail: 0 };
    for (const s of data.students) {
      if (s.status === 'active') p.active++;
      else if (s.shared) p.shared++;
      else if (s.status === 'sent' && !resend) p.sent++;
      else if (data.mailConfigured && s.email) p.email++;
      else if (includeNoEmail) p.show++;
      else p.noEmail++;
    }
    return p;
  }, [data, resend, includeNoEmail]);

  async function send() {
    setBusy(true);
    setError('');
    try {
      const d = await api(`/faculty/sections/${section.id}/accounts/send`, { method: 'POST', body: { resend, includeNoEmail } });
      setResult(d.result);
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const handOut = [...result.shown, ...result.failed.filter((f) => f.tempPassword)];
    return (
      <Modal
        title="Accounts sent"
        subtitle={section.code}
        icon="check"
        tone="high"
        onClose={onClose}
        width={640}
        footer={
          <>
            {handOut.length > 0 && (
              <button className="btn" onClick={() => downloadCsv(`student-accounts-${section.code}.csv`, handOut)}>
                <Icon name="download" size={16} /> Download passwords (CSV)
              </button>
            )}
            <button className="btn primary" onClick={onClose}>Done</button>
          </>
        }
      >
        <div className="result-stats">
          <div><strong>{result.sent}</strong><span>emailed</span></div>
          <div><strong>{handOut.length}</strong><span>to hand out</span></div>
          <div><strong>{result.skippedActive + result.skippedShared + result.skippedSent + result.skippedNoEmail}</strong><span>skipped</span></div>
        </div>
        {result.sent > 0 && (
          <div className="alert ok"><Icon name="check" />{result.sent} student{result.sent === 1 ? '' : 's'} got their student number and temporary password by email.</div>
        )}
        {(result.skippedActive > 0 || result.skippedShared > 0 || result.skippedSent > 0 || result.skippedNoEmail > 0) && (
          <div className="alert info">
            <Icon name="info" />
            <span>
              Skipped: {[
                result.skippedActive && `${result.skippedActive} already signed in`,
                result.skippedShared && `${result.skippedShared} with an account from another class (password not changed)`,
                result.skippedSent && `${result.skippedSent} already emailed`,
                result.skippedNoEmail && `${result.skippedNoEmail} without email`,
              ].filter(Boolean).join(', ')}.
            </span>
          </div>
        )}
        {result.failed.length > 0 && (
          <div className="alert error"><Icon name="alert" /><span>{result.failed.length} email{result.failed.length === 1 ? '' : 's'} could not be sent: {[...new Set(result.failed.map((f) => f.error))].join('; ')}</span></div>
        )}
        {handOut.length > 0 && (
          <>
            <p className="muted small">Give these students their password yourself. A copy is saved on the server, and these are shown only once.</p>
            <div className="cred-table">
              {handOut.map((c) => (
                <div key={c.studentNo} className="cred-line">
                  <div className="roster-info">
                    <strong>{c.name}</strong>
                    <span>{c.studentNo}{c.email ? ` · ${c.email}` : ''}</span>
                  </div>
                  <code>{c.tempPassword}</code>
                  <button className="icon-btn" title="Copy" onClick={() => navigator.clipboard.writeText(`${c.studentNo} / ${c.tempPassword}`).then(() => toast('Copied'))}>
                    <Icon name="copy" size={15} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    );
  }

  const total = plan ? plan.email + plan.show : 0;
  return (
    <Modal
      title="Student accounts"
      subtitle="Create accounts for this section and email each student their student number and temporary password."
      icon="mail"
      onClose={onClose}
      width={680}
      footer={
        data && (
          <>
            <span className="foot-note muted small">
              {plan.email > 0 && `${plan.email} by email`}
              {plan.email > 0 && plan.show > 0 && ' · '}
              {plan.show > 0 && `${plan.show} shown here`}
              {total === 0 && 'Nothing to send'}
            </span>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={busy || total === 0} onClick={send}>
              <Icon name="mail" size={16} />
              {busy ? 'Sending…' : `Create & send ${total} account${total === 1 ? '' : 's'}`}
            </button>
          </>
        )
      }
    >
      {error && <div className="alert error"><Icon name="alert" />{error}</div>}
      {!data ? (
        <PageLoader />
      ) : (
        <>
          {!data.mailConfigured && (
            <div className="alert error"><Icon name="alert" />Email is not set up on the server, so passwords can only be shown here.</div>
          )}
          <div className="acct-summary">
            {['none', 'temp', 'sent', 'active'].map((k) => (
              <span key={k} className={`acct-chip acct-${k}`}>
                <i />{ACCOUNT_LABEL[k]} <strong>{data.students.filter((s) => s.status === k).length}</strong>
              </span>
            ))}
            <span className="acct-chip">
              <Icon name="mail" size={13} /> With email <strong>{data.students.filter((s) => s.email).length}</strong>
            </span>
          </div>

          {plan.shared > 0 && (
            <div className="alert info">
              <Icon name="info" />
              <span>
                <strong>{plan.shared} student{plan.shared === 1 ? ' already has' : 's already have'} an account from another class.</strong> They keep the same sign-in and their password is not changed. This section appears on their account once you show its grades.
              </span>
            </div>
          )}

          <div className="acct-list">
            {data.students.map((s) => (
              <div key={s.id} className="acct-row">
                <Avatar name={s.name} size={28} />
                <div className="roster-info">
                  <strong>{s.name}</strong>
                  <span>{s.studentNo} · {s.email || <em className="no-mail">no email</em>}</span>
                </div>
                <span className={`acct-chip acct-${s.status}`}><i />{s.shared ? 'From another class' : ACCOUNT_LABEL[s.status]}</span>
              </div>
            ))}
          </div>

          <label className="check">
            <input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} />
            <span>
              <strong>Resend to students already emailed</strong>
              <small>They get a new temporary password. Students who already signed in, or got their account from another class, are never changed.</small>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={includeNoEmail} onChange={(e) => setIncludeNoEmail(e.target.checked)} />
            <span>
              <strong>Also create accounts for students without email</strong>
              <small>Their passwords are shown here for you to hand out. To email them instead, re-import a class list with emails (Students button).</small>
            </span>
          </label>
        </>
      )}
    </Modal>
  );
}
