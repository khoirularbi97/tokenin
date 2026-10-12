// Uji logika penyajian file app:// tanpa perlu menjalankan Electron.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveRequest, handle } = require('../serve');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenin-renderer-'));
fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Tokenin</title>');
fs.mkdirSync(path.join(root, 'assets'));
fs.writeFileSync(path.join(root, 'assets', 'index-abc.js'), 'console.log(1)');
fs.writeFileSync(path.join(os.tmpdir(), 'rahasia.txt'), 'jangan bocor');

test('file yang ada dilayani apa adanya', async () => {
  const r = await resolveRequest(root, 'app://tokenin/assets/index-abc.js');
  assert.equal(r.file, path.join(root, 'assets', 'index-abc.js'));
});

test('rute aplikasi tanpa ekstensi dijawab index.html', async () => {
  for (const url of ['app://tokenin/', 'app://tokenin/masuk', 'app://tokenin/meteran/12']) {
    const r = await resolveRequest(root, url);
    assert.equal(r.file, path.join(root, 'index.html'), url);
  }
});

test('file berekstensi yang tidak ada mendapat 404', async () => {
  const r = await resolveRequest(root, 'app://tokenin/assets/hilang.js');
  assert.equal(r.status, 404);
});

test('tidak bisa keluar dari folder aplikasi', async () => {
  for (const url of [
    'app://tokenin/../rahasia.txt',
    'app://tokenin/%2e%2e/rahasia.txt',
    'app://tokenin/assets/%2e%2e%2f%2e%2e%2frahasia.txt',
  ]) {
    const r = await resolveRequest(root, url);
    assert.notEqual(r.file, path.join(os.tmpdir(), 'rahasia.txt'), url);
    if (r.file) assert.ok(r.file.startsWith(root), url);
  }
});

test('host lain ditolak', async () => {
  const r = await resolveRequest(root, 'app://lain/index.html');
  assert.equal(r.status, 404);
});

test('respons membawa content-type dan CSP', async () => {
  const res = await handle(root, { url: 'app://tokenin/meteran/1' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await res.text(), /Tokenin/);
});
