import { load, save } from './storage.js';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
export const WS_URL = `${API_URL.replace(/^http/, 'ws')}/ws`;

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

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
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
