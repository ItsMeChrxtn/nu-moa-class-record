// Transactional email through Brevo (https://developers.brevo.com/reference/sendtransacemail).
// Configure in server/.env:
//   BREVO_API_KEY=xkeysib-...           (Brevo → SMTP & API → API keys)
//   MAIL_FROM_EMAIL=you@nu-moa.edu.ph   (must be a verified sender in Brevo)
//   MAIL_FROM_NAME=NU MOA Class Record
//   APP_URL=https://your-app-address     (link in the email; defaults to http://localhost:5173)
// Without BREVO_API_KEY and MAIL_FROM_EMAIL nothing is sent and callers fall back to showing the password.

const API_URL = () => process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email';

export const mailConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const titleCase = (s = '') => s.toLowerCase().replace(/(^|[\s.-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());

export async function sendMail({ to, toName, subject, html, text }) {
  if (!mailConfigured()) return { sent: false, configured: false };
  try {
    const res = await fetch(API_URL(), {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: process.env.MAIL_FROM_EMAIL, name: process.env.MAIL_FROM_NAME || 'NU MOA Class Record' },
        to: [{ email: to, ...(toName && { name: toName }) }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { sent: false, configured: true, error: body.message || `Brevo answered ${res.status}` };
    return { sent: true, configured: true, messageId: body.messageId };
  } catch (e) {
    return { sent: false, configured: true, error: e.name === 'TimeoutError' ? 'Brevo did not answer in time' : e.message };
  }
}

// Sign-in details for a new faculty account or after a password reset.
// First given name only ("DELA CRUZ, JUAN P." -> "Juan"), so the greeting never ends in "P..".
const givenName = (name) => titleCase((name.includes(',') ? name.split(',')[1] : name).trim().split(/\s+/)[0] || name);
const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');

export function sendFacultyCredentials({ email, name, tempPassword, reset }) {
  const who = givenName(name);
  return sendCredentials({
    to: email,
    name,
    subject: reset ? 'Your Class Record password was reset' : 'Your NU MOA Class Record faculty account',
    headingHtml: reset ? 'Password <span style="color:#1d4ed8">reset.</span>' : `Welcome, <span style="color:#1d4ed8">${esc(who)}.</span>`,
    greeting: who,
    intro: reset
      ? 'Your Class Record password was reset by the administrator. Use this temporary password to sign in:'
      : 'A faculty account was created for you on the NU MOA Class Record. Sign in with your email and this temporary password:',
    idLabel: 'Email',
    idValue: email,
    tempPassword,
    contact: 'the administrator',
  });
}

// Student account for a section: signs in with this email (the student number also works).
export function sendStudentCredentials({ email, name, tempPassword, section, faculty }) {
  const who = givenName(name);
  const course = [section.code, section.subjectTitle && titleCase(section.subjectTitle)].filter(Boolean).join(' · ');
  return sendCredentials({
    to: email,
    name,
    subject: `Your Class Record account for ${section.code}`,
    headingHtml: `Hi, <span style="color:#1d4ed8">${esc(who)}.</span>`,
    greeting: who,
    intro: `${faculty ? titleCase(faculty) : 'Your faculty'} added you to ${course} on the NU MOA Class Record, where you can see your scores and grades. Log in with this email address and this temporary password:`,
    idLabel: 'Email',
    idValue: email,
    tempPassword,
    contact: 'your faculty',
  });
}

// "Forgot password": a link that lets the user choose a new password (valid for one hour).
export function sendPasswordReset({ email, name, token }) {
  const who = givenName(name);
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const text = [
    `Hi ${who},`,
    '',
    'Someone (hopefully you) asked to reset the password of your NU MOA Class Record account.',
    'Open this link to choose a new password. It works once and expires in 1 hour:',
    '',
    link,
    '',
    'If you did not ask for this, you can ignore this email; your password stays the same.',
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1.5px solid #0f172a;border-radius:16px">
      <tr><td style="padding:28px 28px 8px">
        <div style="font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#1d4ed8">&#9632; NU MOA &middot; Class Record</div>
        <h1 style="margin:14px 0 0;font-size:26px;line-height:1.1;font-weight:900;text-transform:uppercase;letter-spacing:-0.5px">Reset your <span style="color:#1d4ed8">password.</span></h1>
        <p style="margin:16px 0 0;font-size:15px;line-height:1.55;color:#475569">Hi ${esc(who)}, someone (hopefully you) asked to reset the password of your Class Record account. Click the button to choose a new one. The link works once and expires in <strong>1 hour</strong>.</p>
      </td></tr>
      <tr><td style="padding:20px 28px 8px">
        <a href="${esc(link)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border:1.5px solid #0f172a;border-radius:10px;box-shadow:4px 4px 0 #0f172a">Choose a new password</a>
      </td></tr>
      <tr><td style="padding:14px 28px 0;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all">Or paste this link into your browser:<br><span style="font-family:'JetBrains Mono',Consolas,monospace;color:#475569">${esc(link)}</span></td></tr>
      <tr><td style="padding:16px 28px 26px;font-size:13px;line-height:1.5;color:#94a3b8">If you did not ask for this, you can ignore this email. Your password stays the same.</td></tr>
    </table>
  </td></tr></table></body></html>`;

  return sendMail({ to: email, toName: titleCase(name), subject: 'Reset your Class Record password', html, text });
}

function sendCredentials({ to, name, subject, headingHtml, greeting, intro, idLabel, idValue, tempPassword, contact }) {
  const url = appUrl();
  const text = [
    `Hi ${greeting},`,
    '',
    intro,
    '',
    `Sign in at: ${url}/login`,
    `${idLabel}: ${idValue}`,
    `Temporary password: ${tempPassword}`,
    '',
    'You will be asked to choose your own password right after signing in.',
    `If you did not expect this email, please contact ${contact}.`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1.5px solid #0f172a;border-radius:16px">
      <tr><td style="padding:28px 28px 8px">
        <div style="font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#1d4ed8">&#9632; NU MOA &middot; Class Record</div>
        <h1 style="margin:14px 0 0;font-size:26px;line-height:1.1;font-weight:900;text-transform:uppercase;letter-spacing:-0.5px">${headingHtml}</h1>
        <p style="margin:16px 0 0;font-size:15px;line-height:1.55;color:#475569">${esc(intro)}</p>
      </td></tr>
      <tr><td style="padding:16px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;border:1px dashed #cbd2dc;border-radius:12px">
          <tr><td style="padding:14px 16px 6px;font-family:'JetBrains Mono',Consolas,monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#475569">${esc(idLabel)}</td></tr>
          <tr><td style="padding:0 16px 10px;font-family:'JetBrains Mono',Consolas,monospace;font-size:15px;font-weight:700">${esc(idValue)}</td></tr>
          <tr><td style="padding:6px 16px 6px;font-family:'JetBrains Mono',Consolas,monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#475569">Temporary password</td></tr>
          <tr><td style="padding:0 16px 16px;font-family:'JetBrains Mono',Consolas,monospace;font-size:20px;font-weight:700;letter-spacing:2px;color:#1d4ed8">${esc(tempPassword)}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:4px 28px 8px">
        <a href="${esc(url)}/login" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border:1.5px solid #0f172a;border-radius:10px;box-shadow:4px 4px 0 #0f172a">Sign in to Class Record</a>
      </td></tr>
      <tr><td style="padding:16px 28px 26px;font-size:13px;line-height:1.5;color:#94a3b8">You will be asked to choose your own password right after signing in. If you did not expect this email, please contact ${esc(contact)}.</td></tr>
    </table>
  </td></tr></table></body></html>`;

  return sendMail({ to, toName: titleCase(name), subject, html, text });
}
