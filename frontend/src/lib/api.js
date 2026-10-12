import { load, save } from './storage.js';
import { isApp } from './platform.js';

// Alamat server bawaan dari build. Di aplikasi desktop dan HP, pengguna bisa menggantinya
// dari halaman masuk tanpa build ulang.
const BUILT_IN = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export function normalizeServerUrl(input) {
  let value = String(input || '').trim();
  if (!value) return '';
  if (/\s/.test(value)) throw new Error('Alamat server tidak boleh berisi spasi.');
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Alamat server tidak valid. Contoh: https://tokenin-api.onrender.com');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Cukup alamat utamanya saja, tanpa /api atau garis miring di belakang.');
  }
  return url.origin;
}

export function getApiUrl() {
  const custom = isApp ? load('tokenin-server') : null;
  return custom || BUILT_IN;
}

export function getBuiltInApiUrl() {
  return BUILT_IN;
}

export function setApiUrl(url) {
  save('tokenin-server', url && url !== BUILT_IN ? url : null);
}

export function getWsUrl() {
  return `${getApiUrl().replace(/^http/, 'ws')}/ws`;
}

let token = load('tokenin-token');
let onUnauthorized = null;

export function getToken() {
  return token;
}

export function setToken(value) {
  token = value;
  save('tokenin-token', value);
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function api(path, { method = 'GET', body, base } = {}) {
  let res;
  try {
    res = await fetch(`${base || getApiUrl()}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    const err = new Error(data.error || `Permintaan gagal (kode ${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Dipakai untuk tombol "Tes koneksi" sebelum alamat server disimpan
export async function testServer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75000);
  try {
    const res = await fetch(`${url}/healthz`, { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error('Server menjawab, tapi bukan server Tokenin.');
    return true;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Server tidak menjawab dalam 75 detik.');
    if (err.message.startsWith('Server menjawab')) throw err;
    throw new Error('Tidak bisa terhubung. Periksa alamatnya dan pastikan server sudah dideploy.');
  } finally {
    clearTimeout(timer);
  }
}
