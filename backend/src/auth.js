import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from './config.js';

export function signUserToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyUserToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return { id: Number(payload.sub), email: payload.email };
  } catch {
    return null;
  }
}

export function requireUser(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token && verifyUserToken(token);
  if (!user) return res.status(401).json({ error: 'Sesi berakhir. Silakan masuk lagi.' });
  req.user = user;
  next();
}

// Kunci alat: 32 byte acak, ditampilkan sekali ke pengguna, disimpan sebagai hash SHA-256
export function newDeviceKey() {
  return crypto.randomBytes(24).toString('base64url');
}

export function hashDeviceKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

export function deviceKeyMatches(key, hash) {
  const a = Buffer.from(hashDeviceKey(key), 'hex');
  const b = Buffer.from(String(hash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
