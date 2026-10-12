// Membuat atau memperbarui akun pengguna.
// Pemakaian: npm run create-user -- email@contoh.com kataSandi "Nama Lengkap"
import bcrypt from 'bcryptjs';
import { pool, migrate } from '../src/db.js';

const [email, password, ...nameParts] = process.argv.slice(2);
if (!email || !password) {
  console.log('Pemakaian: npm run create-user -- email kataSandi "Nama"');
  process.exit(1);
}
if (password.length < 8) {
  console.log('Kata sandi minimal 8 karakter.');
  process.exit(1);
}

await migrate();
const hash = await bcrypt.hash(password, 12);
const { rows } = await pool.query(
  `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name
   RETURNING id, email, name`,
  [email.trim().toLowerCase(), nameParts.join(' '), hash]
);
console.log('Akun siap:', rows[0]);
await pool.end();
