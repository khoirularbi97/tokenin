import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signUserToken, requireUser } from '../auth.js';
import { wrap } from '../errors.js';

const router = Router();

// Pembatas percobaan login sederhana: 10 kali per 15 menit per IP + email
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
function tooManyAttempts(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  attempts.set(key, list);
  return list.length >= 10;
}
function recordAttempt(key) {
  attempts.get(key).push(Date.now());
}

router.post(
  '/login',
  wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Isi email dan kata sandi.' });

    const key = `${req.ip}|${email}`;
    if (tooManyAttempts(key)) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
    }

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      recordAttempt(key);
      return res.status(401).json({ error: 'Email atau kata sandi salah.' });
    }
    attempts.delete(key);
    res.json({ token: signUserToken(user), user: { id: user.id, email: user.email, name: user.name } });
  })
);

router.get(
  '/me',
  requireUser,
  wrap(async (req, res) => {
    const { rows } = await query('SELECT id, email, name FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(401).json({ error: 'Akun tidak ditemukan.' });
    res.json({ user: rows[0] });
  })
);

export default router;
