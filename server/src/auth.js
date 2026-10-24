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
  };
}
