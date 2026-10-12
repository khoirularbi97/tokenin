import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Environment variable ${name} belum diisi. Lihat .env.example.`);
    process.exit(1);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  // Batas waktu satu perintah sebelum dianggap gagal
  jobTimeoutMs: Number(process.env.JOB_TIMEOUT_MS || 120000),
  // Jumlah foto yang disimpan per alat
  photosPerDevice: 20,
};

// Origin aplikasi Tokenin sendiri: desktop (Electron), Android, dan iOS (Capacitor).
// Selalu diizinkan, karena login memakai token Bearer, bukan cookie.
// Matikan dengan ALLOW_APP_ORIGINS=false kalau hanya ingin versi web.
export const APP_ORIGINS =
  process.env.ALLOW_APP_ORIGINS === 'false'
    ? []
    : ['app://tokenin', 'https://localhost', 'capacitor://localhost'];

// Dipakai bersama oleh CORS (HTTP) dan pemeriksaan WebSocket
export function originAllowed(origin) {
  if (!origin) return true; // alat ESP32, curl, dan skrip tidak mengirim Origin
  const clean = origin.replace(/\/$/, '');
  if (config.corsOrigins.length === 0) return true; // mode pengembangan: semua boleh
  return config.corsOrigins.includes(clean) || APP_ORIGINS.includes(clean);
}

if (config.jwtSecret.length < 32) {
  console.warn('Peringatan: JWT_SECRET sebaiknya minimal 32 karakter.');
}
