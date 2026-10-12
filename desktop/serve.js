// Melayani file aplikasi web lewat protokol app://tokenin/ di Electron.
// Dipisah dari main.js supaya bisa diuji dengan Node biasa (tanpa Electron).
const fs = require('node:fs/promises');
const path = require('node:path');

const HOST = 'tokenin';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Kebijakan keamanan konten: hanya skrip dari aplikasi sendiri yang boleh jalan.
// connect-src terbuka ke https/wss karena alamat server bisa diganti pengguna.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https: wss: http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Mengubah URL app:// menjadi file di folder renderer.
 * Rute halaman (tanpa ekstensi) dijawab index.html supaya React Router bekerja.
 * Mengembalikan { file, status } atau { status: 404 }.
 */
async function resolveRequest(rootDir, requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return { status: 400 };
  }
  if (url.protocol !== 'app:' || url.host !== HOST) return { status: 404 };

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes('\0')) return { status: 400 };

  const root = path.resolve(rootDir);
  const target = path.resolve(root, '.' + path.posix.normalize('/' + pathname));
  // Tolak upaya keluar dari folder aplikasi (../)
  if (target !== root && !target.startsWith(root + path.sep)) return { status: 403 };

  try {
    const stat = await fs.stat(target);
    if (stat.isFile()) return { file: target, status: 200 };
  } catch {
    /* lanjut ke fallback */
  }

  // File yang diminta tidak ada. Rute aplikasi (tanpa ekstensi) dijawab index.html.
  if (path.extname(pathname) === '') {
    return { file: path.join(root, 'index.html'), status: 200 };
  }
  return { status: 404 };
}

async function handle(rootDir, request) {
  const result = await resolveRequest(rootDir, request.url);
  if (!result.file) {
    return new Response('Tidak ditemukan', { status: result.status, headers: { 'content-type': 'text/plain' } });
  }
  const body = await fs.readFile(result.file);
  const ext = path.extname(result.file).toLowerCase();
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'cache-control': ext === '.html' ? 'no-cache' : 'max-age=31536000',
    },
  });
}

module.exports = { HOST, CSP, resolveRequest, handle };
