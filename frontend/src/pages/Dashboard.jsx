import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Meter3D, { meterState } from '../components/Meter3D.jsx';
import PhotoCard from '../components/PhotoCard.jsx';
import { useLive, activeJob } from '../lib/live.jsx';
import { api } from '../lib/api.js';
import { load, save } from '../lib/storage.js';
import { groupToken, kwh, time, jobStatusLabel } from '../lib/format.js';

export default function Dashboard() {
  const live = useLive();
  const { devices, order, jobs, photos, loaded, loadJobs, loadPhoto, setJob } = live;
  const [selectedId, setSelectedId] = useState(() => Number(load('tokenin-selected')) || null);
  const [digits, setDigits] = useState('');
  const [sentDigits, setSentDigits] = useState({}); // jobId -> digit, hanya di browser ini
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const selected = devices[selectedId] || devices[order[0]] || null;
  const id = selected?.id;
  const deviceJobs = jobs[id] || [];
  const running = activeJob(deviceJobs);
  const lastTopup = deviceJobs.find((j) => j.kind === 'topup');
  const topups = deviceJobs.filter((j) => j.kind === 'topup').slice(0, 5);

  useEffect(() => {
    if (!id) return;
    save('tokenin-selected', String(id));
    loadJobs(id).catch(() => {});
    loadPhoto(id).catch(() => {});
  }, [id, loadJobs, loadPhoto]);

  // Kosongkan kolom token setelah pengisian berhasil
  useEffect(() => {
    if (lastTopup?.status === 'done' && sentDigits[lastTopup.id]) setDigits('');
  }, [lastTopup?.status, lastTopup?.id, sentDigits]);

  async function send() {
    setError('');
    if (!selected.online) return setError('Alat di meteran ini sedang offline.');
    if (digits.length !== 20) return setError(`Token harus 20 digit. Sekarang baru ${digits.length} digit.`);
    setSending(true);
    try {
      const { job } = await api(`/devices/${id}/topup`, { method: 'POST', body: { token: digits } });
      setSentDigits((s) => ({ ...s, [job.id]: digits }));
      setJob(job);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!loaded) {
    return (
      <>
        <Header subtitle="Pusat kendali meteran jarak jauh" />
        <main className="page">
          <div className="panel col-main">Memuat data meteran.</div>
        </main>
      </>
    );
  }

  if (!selected) {
    return (
      <>
        <Header subtitle="Pusat kendali meteran jarak jauh" />
        <main className="page">
          <section className="panel col-main">
            <h1>Belum ada meteran</h1>
            <p className="muted" style={{ margin: 0 }}>
              Tambahkan meteran pertama, lalu masukkan ID dan kunci alat ke firmware ESP32-CAM.
            </p>
            <Link to="/meteran/baru" className="btn" style={{ alignSelf: 'flex-start' }}>
              Tambah meteran
            </Link>
          </section>
        </main>
      </>
    );
  }

  const busy = Boolean(running) || sending;
  const runningDigits = running ? sentDigits[running.id] || '' : '';
  const shownJob = running || (lastTopup && Date.now() - new Date(lastTopup.finishedAt).getTime() < 60000 ? lastTopup : null);
  const cellDigits = running ? runningDigits : shownJob ? sentDigits[shownJob.id] || '' : digits;
  const pressed = shownJob?.kind === 'topup' ? Math.min(shownJob.progress || 0, 20) : 0;
  const model = meterState({ job: running, digits: runningDigits, lastKwh: selected.lastKwh });

  let progressText = 'Masukkan token, lalu tekan Kirim ke meteran.';
  if (running?.kind === 'check') progressText = 'Alat sedang mengecek sisa kWh. Tunggu sampai selesai.';
  else if (running?.status === 'queued') progressText = 'Perintah terkirim, menunggu alat mulai.';
  else if (running?.status === 'checking') progressText = 'Mengecek sisa kWh sebelum mengisi.';
  else if (running?.status === 'pressing')
    progressText = running.progress >= 21 ? 'Menekan Enter.' : `${running.progress} dari 20 digit sudah ditekan.`;
  else if (shownJob?.status === 'done') progressText = 'Selesai. Periksa foto layar untuk memastikan token diterima.';
  else if (shownJob?.status === 'failed') progressText = `Gagal: ${shownJob.error}`;

  return (
    <>
      <Header subtitle="Pusat kendali meteran jarak jauh" />
      <main className="page">
        <div className="col col-side">
          <section className="panel">
            <div className="panel-head">
              <h2>Meteran</h2>
              <Link to="/meteran/baru" className="pill">
                Tambah meteran
              </Link>
            </div>
            <div className="stack">
              {order.map((did) => {
                const d = devices[did];
                return (
                  <button
                    key={did}
                    type="button"
                    className="device-btn"
                    aria-pressed={did === id}
                    disabled={busy && did !== id}
                    onClick={() => {
                      setSelectedId(did);
                      setError('');
                    }}
                  >
                    <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                      <span className="name">{d.name}</span>
                      <span className="muted">{d.meterNumber ? `No. meter ${d.meterNumber}` : 'No. meter belum diisi'}</span>
                    </span>
                    <span className="meta">
                      <span className={`dot${d.online ? '' : ' off'}`} aria-hidden="true" />
                      {d.online ? 'Online' : 'Offline'}
                    </span>
                  </button>
                );
              })}
            </div>
            <Link to={`/meteran/${id}`}>Lihat detail meteran</Link>
          </section>

          <section className="panel">
            <h2>Riwayat</h2>
            {topups.length === 0 && <div className="muted">Belum ada pengisian token di meteran ini.</div>}
            <div className="stack">
              {topups.map((j) => (
                <div key={j.id} className="history-item">
                  <div className="top">
                    <span className="mono">{j.tokenMasked}</span>
                    <span className="muted">{time(j.createdAt)}</span>
                  </div>
                  <div>
                    Sisa {kwh(j.kwhBefore)} menjadi {kwh(j.kwhAfter)}
                  </div>
                  <div className={j.status === 'done' ? 'ok-text' : j.status === 'failed' ? 'error-text' : 'muted'}>
                    {jobStatusLabel[j.status]}
                    {j.error ? `: ${j.error}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="col col-model">
          <section className="panel" style={{ alignItems: 'center' }}>
            <h2 style={{ alignSelf: 'flex-start' }}>Model alat</h2>
            <Meter3D lcd={model.lcd} activeKey={model.activeKey} scanning={model.scanning} />
            <div className="muted" style={{ textAlign: 'center' }}>
              Gerakkan kursor atau jari di atas model untuk memutarnya.
            </div>
          </section>
          <PhotoCard photo={photos[id]} />
        </div>

        <div className="col col-main">
          <section className="panel" style={{ gap: 18 }}>
            <div className="stack" style={{ gap: 2 }}>
              <h2>Isi token</h2>
              <div className="muted">
                Tujuan: {selected.name} ({selected.online ? 'online' : 'offline'})
              </div>
            </div>
            <div className="field">
              <label htmlFor="token">Token 20 digit</label>
              <input
                id="token"
                className="input input-token"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0000 0000 0000 0000 0000"
                value={groupToken(digits)}
                disabled={busy}
                onChange={(e) => {
                  setDigits(e.target.value.replace(/\D/g, '').slice(0, 20));
                  setError('');
                }}
              />
              <div className={error ? 'error-text' : 'muted'} role={error ? 'alert' : undefined}>
                {error || `${digits.length} dari 20 digit.`}
              </div>
            </div>
            <button className="btn" type="button" onClick={send} disabled={busy}>
              {sending ? 'Mengirim' : running ? 'Alat sedang bekerja' : 'Kirim ke meteran'}
            </button>

            <div className="stack">
              <div style={{ fontSize: 14, fontWeight: 500 }}>Progres penekanan</div>
              <div className="cells" aria-hidden="true">
                {Array.from({ length: 20 }, (_, i) => {
                  const state = i < pressed ? 'done' : running?.status === 'pressing' && i === pressed ? 'now' : '';
                  return (
                    <div key={i} className={`cell ${state}`}>
                      {cellDigits[i] || ''}
                    </div>
                  );
                })}
              </div>
              <div role="status" style={{ fontSize: 14, color: 'var(--soft)' }}>
                {progressText}
              </div>
            </div>

            <div className="stat-grid">
              <div className="stat">
                <span className="muted">Sisa sebelum</span>
                <span className="value">{kwh(shownJob?.kind === 'topup' ? shownJob.kwhBefore : null)}</span>
              </div>
              <div className="stat">
                <span className="muted">Sisa sesudah</span>
                <span className="value">{kwh(shownJob?.kind === 'topup' ? shownJob.kwhAfter : null)}</span>
              </div>
            </div>
            <div className="muted">Sisa terakhir tercatat: {kwh(selected.lastKwh)}</div>
          </section>
        </div>
      </main>
    </>
  );
}
