import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header.jsx';
import DeviceForm from '../components/DeviceForm.jsx';
import DeviceKey from '../components/DeviceKey.jsx';
import { api } from '../lib/api.js';
import { useLive } from '../lib/live.jsx';

export default function AddDevice() {
  const { setDevice } = useLive();
  const [created, setCreated] = useState(null);

  async function create(values) {
    const data = await api('/devices', { method: 'POST', body: values });
    setDevice(data.device);
    setCreated(data);
  }

  return (
    <>
      <Header subtitle="Tambah meteran" back="/" />
      <main className="page">
        <section className="panel col-main" style={{ maxWidth: 640 }}>
          {created ? (
            <>
              <h1>{created.device.name} sudah ditambahkan</h1>
              <p className="muted" style={{ margin: 0 }}>
                Tempel konfigurasi ini ke firmware ESP32-CAM, lalu upload. Alat akan muncul online setelah tersambung.
              </p>
              <DeviceKey deviceId={created.device.id} deviceKey={created.deviceKey} />
              <div className="row">
                <Link className="btn" to="/">
                  Ke dashboard
                </Link>
                <Link className="btn btn-ghost" to={`/meteran/${created.device.id}`}>
                  Buka detail meteran
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1>Tambah meteran</h1>
              <DeviceForm submitLabel="Tambah meteran" onSubmit={create} />
            </>
          )}
        </section>
      </main>
    </>
  );
}
