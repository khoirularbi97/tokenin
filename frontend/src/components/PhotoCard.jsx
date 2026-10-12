import { dateTime } from '../lib/format.js';

const STAGE = { before: 'sebelum pengisian', after: 'sesudah pengisian', check: 'saat cek sisa kWh' };

export default function PhotoCard({ photo, title = 'Foto layar meteran' }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className={`photo${photo?.image ? ' has-img' : ''}`}>
        {photo?.image ? (
          <img src={`data:image/jpeg;base64,${photo.image}`} alt={`Layar meteran ${STAGE[photo.stage] || ''}`} />
        ) : (
          'Belum ada foto. Foto diambil otomatis saat cek sisa kWh dan setelah token dimasukkan.'
        )}
      </div>
      {photo && (
        <div className="muted">
          Diambil {STAGE[photo.stage] || ''}, {dateTime(photo.createdAt)}
        </div>
      )}
    </section>
  );
}
