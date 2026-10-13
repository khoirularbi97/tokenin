import { useState } from 'react';

const FIELDS = [
  { key: 'name', label: 'Nama meteran', placeholder: 'Kontrakan A1', required: true },
  { key: 'meterNumber', label: 'No. meter', placeholder: '11 atau 12 digit di meteran', inputMode: 'numeric' },
  { key: 'meterBrand', label: 'Merek meteran', placeholder: 'Hexing, Itron, dan lainnya' },
  { key: 'powerVa', label: 'Daya (VA)', placeholder: '1300', inputMode: 'numeric' },
  { key: 'checkCode', label: 'Kode cek sisa kWh', placeholder: 'Contoh 37#  (# = Enter, * = hapus)', help: 'Tombol yang ditekan alat untuk menampilkan sisa kWh. Lihat buku panduan meteran.' },
];

export default function DeviceForm({ initial = {}, submitLabel, onSubmit }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, initial[f.key] == null ? '' : String(initial[f.key])]))
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await onSubmit({ ...values, powerVa: values.powerVa === '' ? null : Number(values.powerVa) });
      setMessage({ ok: true, text: 'Tersimpan.' });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} style={{ gap: 14 }}>
      {FIELDS.map((f) => (
        <div className="field" key={f.key}>
          <label htmlFor={`f-${f.key}`}>{f.label}</label>
          <input
            id={`f-${f.key}`}
            className="input"
            value={values[f.key]}
            placeholder={f.placeholder}
            inputMode={f.inputMode}
            required={f.required}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
          {f.help && <span className="muted">{f.help}</span>}
        </div>
      ))}
      {message && <div className={message.ok ? 'ok-text' : 'error-text'}>{message.text}</div>}
      <button className="btn" type="submit" disabled={busy} style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Menyimpan' : submitLabel}
      </button>
    </form>
  );
}
