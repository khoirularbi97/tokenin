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

if (config.jwtSecret.length < 32) {
  console.warn('Peringatan: JWT_SECRET sebaiknya minimal 32 karakter.');
}
