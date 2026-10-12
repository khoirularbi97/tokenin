import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Meter3D, { meterState } from '../components/Meter3D.jsx';
import PhotoCard from '../components/PhotoCard.jsx';
import DeviceForm from '../components/DeviceForm.jsx';
import DeviceKey from '../components/DeviceKey.jsx';
import { useLive, activeJob } from '../lib/live.jsx';
import { api } from '../lib/api.js';
import { load, save } from '../lib/storage.js';
import { dateTime, kwh, jobStatusLabel } from '../lib/format.js';
import { requestNotifyPermission } from '../lib/notify.js';
import { isApp, isDesktop } from '../lib/platform.js';

const CHECK_STEPS = ['Mengirim perintah ke alat', 'Menekan kode cek di keypad', 'Memotret layar meteran'];

function checkStep(job) {
  if (!job) return -1;
  if (job.status === 'failed') return -1;
  if (job.status === 'done') return 3;
  if (job.status === 'checking') return 1;
  return 0;
}

function KwhCell({ job, field, deviceId, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const current = job[field];
  if (!editing) {
    return (
      <span className="row" style={{ gap: 6 }}>
        <span>{kwh(current)}</span>
        {job.kind === 'topup' && job.status === 'done' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            {current == null ? 'Isi' : 'Ubah'}
          </button>
        )}
      </span>
    );
  }
  async function saveValue(e) {
    e.preventDefault();
    const body = { [field]: Number(value.replace(',', '.')) };
    const { job: updated } = await api(`/devices/${deviceId}/jobs/${job.id}`, { method: 'PATCH', body });
    onSaved(updated);
    setEditing(false);
  }
  return (
    <form className="row" style={{ gap: 6 }} onSubmit={(e) => saveValue(e).catch(() => {})}>
      <label className="visually-hidden" htmlFor={`kwh-${job.id}-${field}`}>
        Sisa kWh
      </label>
      <input
        id={`kwh-${job.id}-${field}`}
        className="input input-small"
        style={{ minHeight: 36 }}
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
      <button className="btn btn-sm" type="submit">
        Simpan
      </button>
    </form>
  );
}

export default function DeviceDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const navigate = useNavigate();
  const { devices, jobs, photos, loaded, loadJobs, loadPhoto, setDevice, setJob, removeDevice } = useLive();
  const device = devices[id];
  const deviceJobs = jobs[id] || [];
  const running = activeJob(deviceJobs);
  const lastCheck = deviceJobs.find((j) => j.kind === 'check');
  const topups = deviceJobs.filter((j) => j.kind === 'topup');

  const [checkError, setCheckError] = useState('');
  const [threshold, setThreshold] = useState('');
  const [manualKwh, setManualKwh] = useState('');
  const [alertMsg, setAlertMsg] = useState('');
  const [notify, setNotify] = useState(() => load('tokenin-notify') === '1');
  const [newKey, setNewKey] = useState(null);

  useEffect(() => {
    if (!device) return;
    loadJobs(id).catch(() => {});
    loadPhoto(id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, Boolean(device)]);

  useEffect(() => {
    if (device) setThreshold(String(device.lowKwhThreshold ?? ''));
  }, [device?.lowKwhThreshold]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) {
    return (
      <>
        <Header subtitle="Detail meteran" back="/" />
        <main className="page">
          <div className="panel col-main">Memuat data meteran.</div>
        </main>
      </>
    );
  }
  if (!device) {
    return (
      <>
        <Header subtitle="Detail meteran" back="/" />
        <main className="page">
          <div className="panel col-main">Meteran ini tidak ditemukan atau sudah dihapus.</div>
        </main>
      </>
    );
  }

  async function runCheck() {
    setCheckError('');
    try {
      const { job } = await api(`/devices/${id}/check`, { method: 'POST' });
      setJob(job);
    } catch (err) {
      setCheckError(err.message);
    }
  }

  async function saveThreshold(e) {
    e.preventDefault();
    setAlertMsg('');
    try {
      const { device: d } = await api(`/devices/${id}`, {
        method: 'PATCH',
        body: { lowKwhThreshold: Number(threshold.replace(',', '.')) },
      });
      setDevice(d);
      setAlertMsg('Batas peringatan tersimpan.');
    } catch (err) {
      setAlertMsg(err.message);
    }
  }

  async function saveManualKwh(e) {
    e.preventDefault();
    setCheckError('');
    try {
      const { device: d } = await api(`/devices/${id}/kwh`, {
        method: 'POST',
        body: { kwh: Number(manualKwh.replace(',', '.')) },
      });
      setDevice(d);
      setManualKwh('');
    } catch (err) {
      setCheckError(err.message);
    }
  }

  async function toggleNotify(checked) {
    if (checked && !(await requestNotifyPermission())) {
      setAlertMsg(
        isApp
          ? 'Izin notifikasi ditolak. Aktifkan lewat pengaturan aplikasi di perangkat ini.'
          : 'Izin notifikasi ditolak browser. Aktifkan lewat pengaturan situs.'
      );
      return;
    }
    setNotify(checked);
    save('tokenin-notify', checked ? '1' : '0');
  }

  async function rotateKey() {
    if (!window.confirm('Ganti kunci alat? Alat akan terputus sampai firmware diisi kunci baru.')) return;
    const { deviceKey } = await api(`/devices/${id}/rotate-key`, { method: 'POST' });
    setNewKey(deviceKey);
  }

  async function deleteDevice() {
    if (!window.confirm(`Hapus ${device.name} beserta seluruh riwayatnya? Tindakan ini tidak bisa dibatalkan.`)) return;
    await api(`/devices/${id}`, { method: 'DELETE' });
    removeDevice(id);
    navigate('/');
  }

  const checking = running?.kind === 'check' ? running : null;
  const recentCheck =
    lastCheck && (!lastCheck.finishedAt || Date.now() - new Date(lastCheck.finishedAt).getTime() < 60000)
      ? lastCheck
      : null;
  const step = checkStep(checking || recentCheck);
  const model = meterState({ job: running, lastKwh: device.lastKwh });
  const low = device.lastKwh != null && device.lastKwh < device.lowKwhThreshold;

  return (
    <>
      <Header subtitle="Detail meteran" back="/" />
      <main className="page">
        <div className="col col-main">
          <section className="panel">
            <div className="panel-head">
              <h1>{device.name}</h1>
              <span className="row" style={{ gap: 8, fontSize: 14 }}>
                <span className={`dot${device.online ? '' : ' off'}`} aria-hidden="true" />
                {device.online ? 'Alat online' : `Alat offline, terakhir terlihat ${dateTime(device.lastSeen)}`}
              </span>
            </div>
            <DeviceForm key={device.id} initial={device} submitLabel="Simpan perubahan" onSubmit={async (values) => {
              const { device: d } = await api(`/devices/${id}`, { method: 'PATCH', body: values });
              setDevice(d);
            }} />
          </section>

          <section className="panel">
            <div className="panel-head" style={{ alignItems: 'flex-end' }}>
              <div className="stack" style={{ gap: 2 }}>
                <h2>Sisa kWh</h2>
                <div className="kwh-big" style={low ? { color: 'var(--warn)' } : undefined}>
                  {kwh(device.lastKwh)}
                </div>
                <div className="muted">
                  {device.lastKwhAt ? `Tercatat ${dateTime(device.lastKwhAt)}.` : 'Belum pernah dicek.'}
                  {low ? ' Di bawah batas peringatan.' : ''}
                </div>
              </div>
              <button className="btn" type="button" onClick={runCheck} disabled={Boolean(running) || !device.online}>
                {checking ? 'Sedang mengecek' : 'Cek sekarang'}
              </button>
            </div>
            {!device.checkCode && (
              <div className="notice">Isi kode cek sisa kWh di atas supaya alat bisa mengecek otomatis.</div>
            )}
            {checkError && <div className="error-text" role="alert">{checkError}</div>}
            <div className="steps" role="status">
              {CHECK_STEPS.map((label, i) => (
                <div key={label} className={`step${i < step ? ' done' : ''}${i === step ? ' now' : ''}`}>
                  <span className="step-num">{i + 1}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            {lastCheck?.status === 'failed' && !running && (
              <div className="error-text">Cek terakhir gagal: {lastCheck.error}</div>
            )}
            <form className="row" onSubmit={saveManualKwh}>
              <label htmlFor="manual-kwh" style={{ fontSize: 14 }}>
                Angka di foto belum terbaca otomatis? Isi manual:
              </label>
              <input
                id="manual-kwh"
                className="input input-small"
                inputMode="decimal"
                placeholder="0,00"
                value={manualKwh}
                onChange={(e) => setManualKwh(e.target.value)}
              />
              <button className="btn btn-ghost btn-sm" type="submit" disabled={!manualKwh}>
                Simpan kWh
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>Peringatan</h2>
            <form className="row" onSubmit={saveThreshold}>
              <label htmlFor="threshold">Beri tahu saya kalau sisa di bawah</label>
              <input
                id="threshold"
                className="input input-small"
                inputMode="decimal"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
              <span>kWh</span>
              <button className="btn btn-ghost btn-sm" type="submit">
                Simpan batas
              </button>
            </form>
            <label className="check">
              <input type="checkbox" checked={notify} onChange={(e) => toggleNotify(e.target.checked)} />
              <span>Tampilkan notifikasi di perangkat ini</span>
            </label>
            <div className="muted">
              {isDesktop
                ? 'Notifikasi muncul selama aplikasi berjalan, termasuk saat diperkecil ke tray.'
                : isApp
                  ? 'Notifikasi muncul selama aplikasi terbuka. HP bisa memutus koneksi setelah aplikasi lama di latar belakang.'
                  : 'Notifikasi muncul selama Tokenin terbuka di browser perangkat ini.'}
            </div>
            {alertMsg && <div className="muted">{alertMsg}</div>}
          </section>

          <section className="panel">
            <h2>Riwayat pengisian</h2>
            {topups.length === 0 ? (
              <div className="muted">Belum ada pengisian token di meteran ini.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Waktu</th>
                      <th scope="col">Token</th>
                      <th scope="col">Status</th>
                      <th scope="col">Sebelum</th>
                      <th scope="col">Sesudah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topups.map((j) => (
                      <tr key={j.id}>
                        <td>{dateTime(j.createdAt)}</td>
                        <td className="mono">{j.tokenMasked}</td>
                        <td>
                          <span className={`badge ${j.status}`} title={j.error || undefined}>
                            {jobStatusLabel[j.status]}
                          </span>
                        </td>
                        <td>
                          <KwhCell job={j} field="kwhBefore" deviceId={id} onSaved={setJob} />
                        </td>
                        <td>
                          <KwhCell job={j} field="kwhAfter" deviceId={id} onSaved={setJob} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Kunci alat</h2>
            <div className="muted">
              ID alat: <span className="mono">{device.id}</span>
              {device.firmware ? `. Firmware ${device.firmware}.` : '.'}
            </div>
            {newKey ? (
              <DeviceKey deviceId={device.id} deviceKey={newKey} />
            ) : (
              <div className="row">
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => rotateKey().catch(() => {})}>
                  Ganti kunci alat
                </button>
                <button className="btn btn-danger btn-sm" type="button" onClick={() => deleteDevice().catch(() => {})}>
                  Hapus meteran
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="col col-model">
          <section className="panel" style={{ alignItems: 'center' }}>
            <h2 style={{ alignSelf: 'flex-start' }}>Model alat</h2>
            <Meter3D lcd={model.lcd} activeKey={model.activeKey} scanning={model.scanning} />
          </section>
          <PhotoCard photo={photos[id]} title="Foto layar terakhir" />
        </div>
      </main>
    </>
  );
}
