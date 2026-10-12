import { useState } from 'react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'enter'];
const LABELS = { back: '←', enter: '↵' };
const REST = { rx: 12, ry: -24 };

// Model meteran + rangka 12 solenoid dari CSS 3D. activeKey = tombol yang sedang ditekan.
export default function Meter3D({ lcd = '0000 0000', activeKey = '', scanning = false }) {
  const [tilt, setTilt] = useState(REST);

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ ry: Math.round(px * 56), rx: Math.round(-py * 36) });
  }

  return (
    <div
      className="meter3d"
      role="img"
      aria-label={`Model meteran. Layar: ${lcd}`}
      onPointerMove={onMove}
      onPointerLeave={() => setTilt(REST)}
    >
      <div className="m-body" style={{ transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}>
        <div className="m-face m-back" />
        <div className="m-side m-left" />
        <div className="m-side m-right" />
        <div className="m-cap m-top" />
        <div className="m-cap m-bottom" />
        <div className="m-face m-front" />
        <div className="m-lcd">{lcd}</div>
        {scanning && <div className="m-scan" />}
        <div className="m-keys">
          {KEYS.map((k) => (
            <div key={k} className={`m-key${k === activeKey ? ' on' : ''}`}>
              {LABELS[k] || k}
            </div>
          ))}
        </div>
        <div className="m-frame">
          {KEYS.map((k) => (
            <div key={k} className="m-ring-slot">
              <div className={`m-ring${k === activeKey ? ' on' : ''}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Teks layar dan tombol aktif berdasarkan status perintah
export function meterState({ job, digits = '', lastKwh }) {
  const idle = lastKwh == null ? '-- kWh' : `${Number(lastKwh).toFixed(2)} kWh`;
  if (!job || job.finishedAt) {
    if (job && job.status === 'failed' && Date.now() - new Date(job.finishedAt).getTime() < 15000) {
      return { lcd: 'GAGAL', activeKey: '', scanning: false };
    }
    return { lcd: idle, activeKey: '', scanning: false };
  }
  if (job.status === 'queued') return { lcd: 'MENUNGGU', activeKey: '', scanning: false };
  if (job.status === 'checking') return { lcd: 'CEK SISA', activeKey: '', scanning: true };
  const n = job.progress || 0;
  const activeKey = n >= 21 ? 'enter' : n > 0 ? digits[n - 1] || '' : '';
  const shown = digits ? digits.slice(0, Math.min(n, 20)).slice(-10) : `${Math.min(n, 20)}/20`;
  return { lcd: shown || '_', activeKey, scanning: false };
}
