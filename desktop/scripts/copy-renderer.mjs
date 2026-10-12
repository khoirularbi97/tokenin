// Menyalin hasil build web (frontend/dist) ke desktop/renderer sebelum dikemas Electron.
import { cp, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const from = path.resolve(here, '../../frontend/dist');
const to = path.resolve(here, '../renderer');

try {
  await access(path.join(from, 'index.html'));
} catch {
  console.error('frontend/dist belum ada. Jalankan "npm run build:web" dulu.');
  process.exit(1);
}
await rm(to, { recursive: true, force: true });
await cp(from, to, { recursive: true });
// Service worker hanya untuk versi web
await rm(path.join(to, 'sw.js'), { force: true });
console.log('Renderer disalin dari frontend/dist.');
