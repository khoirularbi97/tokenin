import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

// Kolom NUMERIC dikembalikan sebagai number, bukan string
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: isLocal ? false : { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // Neon free bisa butuh beberapa detik untuk bangun
});

pool.on('error', (err) => console.error('Postgres pool error:', err.message));

export const query = (text, params) => pool.query(text, params);

export async function migrate() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sql = await fs.readFile(path.join(dir, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
}
