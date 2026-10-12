import { useState } from 'react';
import { getApiUrl } from '../lib/api.js';

// Menampilkan konfigurasi firmware. Kunci hanya terlihat sekali, saat dibuat atau diganti.
export default function DeviceKey({ deviceId, deviceKey }) {
  const [copied, setCopied] = useState(false);
  const url = new URL(getApiUrl());
  const secure = url.protocol === 'https:';
  const host = url.hostname;
  const port = url.port || (secure ? 443 : 80);
  const snippet = [
    `#define TOKENIN_DEVICE_ID  ${deviceId}`,
    `#define TOKENIN_DEVICE_KEY "${deviceKey}"`,
    `#define TOKENIN_HOST       "${host}"`,
    `#define TOKENIN_PORT       ${port}`,
    `#define TOKENIN_SECURE     ${secure ? 'true' : 'false'}`,
  ].join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="stack">
      <div className="notice">
        Simpan kunci ini sekarang. Setelah halaman ditutup, kunci tidak bisa dilihat lagi dan harus diganti baru.
      </div>
      <div className="secret">{snippet}</div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={copy} style={{ alignSelf: 'flex-start' }}>
        {copied ? 'Tersalin' : 'Salin konfigurasi'}
      </button>
    </div>
  );
}
