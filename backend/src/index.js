import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { config, originAllowed } from './config.js';
import { migrate, pool } from './db.js';
import { attachWebSocket } from './socket.js';
import authRoutes from './routes/auth.js';
import deviceRoutes from './routes/devices.js';

const app = express();
app.set('trust proxy', 1); // Render berada di belakang proxy
app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, cb) {
      // Tanpa header Origin (curl, alat) atau daftar kosong saat pengembangan: izinkan
      cb(null, originAllowed(origin));
    },
  })
);
app.use(express.json({ limit: '100kb' }));

app.get('/healthz', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/', (_req, res) => res.json({ name: 'Tokenin API', ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Alamat API tidak ditemukan.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body bukan JSON yang valid.' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan di server.' });
});

const server = http.createServer(app);
const wss = attachWebSocket(server);

try {
  await migrate();
  // Perintah yang masih berjalan saat server sebelumnya mati tidak akan pernah selesai
  const stale = await pool.query(
    `UPDATE jobs SET status = 'failed', error = 'Server dimulai ulang saat perintah berjalan.', finished_at = now()
     WHERE finished_at IS NULL`
  );
  if (stale.rowCount) console.log(`${stale.rowCount} perintah yang terputus ditandai gagal.`);
  console.log('Skema database siap.');
} catch (err) {
  console.error('Gagal menyiapkan database:', err.message);
  process.exit(1);
}

server.listen(config.port, () => console.log(`Tokenin API berjalan di port ${config.port}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    // Saat Render me-restart atau deploy ulang, tutup koneksi alat dan dashboard dengan rapi
    // (kode 1012 = server restart) supaya semuanya langsung menyambung ke server yang baru.
    for (const client of wss.clients) client.close(1012, 'server restart');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
