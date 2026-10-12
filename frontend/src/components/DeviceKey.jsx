import { useState } from 'react';
import { API_URL } from '../lib/api.js';

// Menampilkan konfigurasi firmware. Kunci hanya terlihat sekali, saat dibuat atau diganti.
export default function DeviceKey({ deviceId, deviceKey }) {
  const [copied, setCopied] = useState(false);
  const host = API_URL.replace(/^https?:\/\//, '');
  const secure = API_URL.startsWith('https');
  const snippet = [
    `#define TOKENIN_DEVICE_ID  ${deviceId}`,
    `#define TOKENIN_DEVICE_KEY "${deviceKey}"`,
    `#define TOKENIN_HOST       "${host}"`,
    `#define TOKENIN_PORT       ${secure ? 443 : 80}`,
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
