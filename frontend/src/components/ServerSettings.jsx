import { useState } from 'react';
import { getApiUrl, getBuiltInApiUrl, normalizeServerUrl, setApiUrl, setToken, testServer } from '../lib/api.js';

// Hanya tampil di aplikasi desktop dan HP: alamat server bisa diganti tanpa build ulang
export default function ServerSettings() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(getApiUrl());
  const [value, setValue] = useState(current);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setStatus(null);
    let url;
    try {
      url = normalizeServerUrl(value) || getBuiltInApiUrl();
    } catch (err) {
      setStatus({ ok: false, text: err.message });
      return;
    }
    if (url.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(url)) {
      setStatus({ ok: false, text: 'Aplikasi hanya bisa memakai alamat https://, kecuali server di laptop sendiri.' });
      return;
    }
    setBusy(true);
    setStatus({ ok: true, text: 'Menghubungi server. Server gratis yang sedang tidur butuh sampai satu menit.' });
    try {
      await testServer(url);
      setApiUrl(url);
      setToken(null); // akun di server lama tidak berlaku di server baru
      setCurrent(url);
      setValue(url);
      setStatus({ ok: true, text: 'Tersambung. Alamat server disimpan.' });
      setOpen(false);
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const host = current.replace(/^https?:\/\//, '');

  if (!open) {
    return (
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          Server: {host}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          Ubah server
        </button>
        {status?.ok && <span className="ok-text">{status.text}</span>}
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={save}>
      <div className="field">
        <label htmlFor="server-url">Alamat server</label>
        <input
          id="server-url"
          className="input"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={getBuiltInApiUrl()}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <span className="muted">Kosongkan untuk kembali ke alamat bawaan.</span>
      </div>
      {status && (
        <div className={status.ok ? 'muted' : 'error-text'} role="status">
          {status.text}
        </div>
      )}
      <div className="row">
        <button className="btn btn-sm" type="submit" disabled={busy}>
          {busy ? 'Mengecek' : 'Tes dan simpan'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setValue(current);
            setStatus(null);
          }}
        >
          Batal
        </button>
      </div>
    </form>
  );
}
