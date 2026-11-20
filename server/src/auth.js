import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './models.js';

const COOKIE = 'token';

export function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}

// Readable temp password, no ambiguous characters (0/O, 1/l/I).
export function tempPassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// Temporary passwords are also kept encrypted (key derived from JWT_SECRET) so faculty can view them again.
const tempKey = () => crypto.createHash('sha256').update(`temp-password:${process.env.JWT_SECRET}`).digest();

export function encryptTemp(pw) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', tempKey(), iv);
  const data = Buffer.concat([c.update(String(pw), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decryptTemp(enc) {
  try {
    const [iv, tag, data] = String(enc).split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', tempKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch {
    return null; // JWT_SECRET changed, or the value is damaged
  }
}

export function setSession(res, user) {
  const token = jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '8h',
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE);
}

export async function requireAuth(req, res, next) {
  try {
    const payload = jwt.verify(req.cookies?.[COOKIE] || '', process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    // A disabled account loses access immediately, even with a valid session cookie.
    if (!user || user.disabled) return res.status(401).json({ error: 'Not logged in' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Not logged in' });
  }
}

// Users with a temporary password may only change it.
export function requirePasswordSet(req, res, next) {
  if (req.user.mustChangePassword)
    return res.status(403).json({ error: 'Please change your temporary password first.' });
  next();
}

export function requireRole(role) {
  return (req, res, next) =>
    req.user.role === role ? next() : res.status(403).json({ error: 'Forbidden' });
}

export function publicUser(user) {
  return {
    id: user._id,
    username: user.username,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    photo: user.photo || null,
  };
}
