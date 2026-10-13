import { query } from './db.js';
import { hub } from './hub.js';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { jobJson } from './serialize.js';

export function maskToken(token) {
  return `${token.slice(0, 4)} •••• •••• •••• ${token.slice(16)}`;
}

async function notifyJob(ownerId, jobRow) {
  hub.notifyUser(ownerId, { type: 'job', job: jobJson(jobRow) });
}

export async function startJob({ device, userId, kind, token }) {
  if (!hub.isOnline(device.id)) {
    throw new HttpError(409, 'Alat di meteran ini sedang offline. Pastikan alat menyala dan terhubung ke WiFi.');
  }
  if (hub.activeJobs.has(device.id)) {
    throw new HttpError(409, 'Alat sedang mengerjakan perintah lain. Tunggu sampai selesai.');
  }
  if (kind === 'check' && !device.check_code) {
    throw new HttpError(400, 'Kode cek sisa kWh belum diatur. Isi dulu di halaman detail meteran.');
  }

  // Kunci alat sebelum menulis ke database, supaya dua klik cepat tidak membuat dua perintah
  hub.activeJobs.set(device.id, { jobId: null, kind, timer: null });

  try {
    const { rows } = await query(
      `INSERT INTO jobs (device_id, user_id, kind, token_masked, status)
       VALUES ($1, $2, $3, $4, 'queued') RETURNING *`,
      [device.id, userId, kind, kind === 'topup' ? maskToken(token) : null]
    );
    const job = rows[0];

    const message =
      kind === 'topup'
        ? { type: 'topup', jobId: job.id, token, checkCode: device.check_code || '' }
        : { type: 'check', jobId: job.id, checkCode: device.check_code };

    if (!hub.sendToDevice(device.id, message)) {
      hub.activeJobs.delete(device.id);
      const failed = await failJob(job.id, 'Alat terputus sebelum perintah terkirim.');
      return failed;
    }

    const timer = setTimeout(() => {
      failJob(job.id, 'Alat tidak melapor selesai dalam batas waktu.').catch(() => {});
    }, config.jobTimeoutMs);
    hub.activeJobs.set(device.id, { jobId: job.id, kind, timer });

    await notifyJob(device.owner_id, job);
    return job;
  } catch (err) {
    if (hub.activeJobs.get(device.id)?.jobId == null) hub.activeJobs.delete(device.id);
    throw err;
  }
}

// Mengambil job aktif milik alat; mengabaikan laporan untuk job yang bukan miliknya
export function activeJobFor(deviceId, jobId) {
  const active = hub.activeJobs.get(Number(deviceId));
  if (!active || active.jobId == null) return null;
  if (jobId != null && Number(jobId) !== active.jobId) return null;
  return active;
}

export async function updateProgress(deviceId, jobId, stage, index) {
  if (!activeJobFor(deviceId, jobId)) return null;
  const status = stage === 'checking' ? 'checking' : 'pressing';
  const progress = Math.max(0, Math.min(21, Number(index) || 0));
  const { rows } = await query(
    `UPDATE jobs SET status = $2, progress = $3 WHERE id = $1 AND finished_at IS NULL RETURNING *`,
    [jobId, status, progress]
  );
  return rows[0] || null;
}

async function finish(jobId, ok, error) {
  // Kunci alat dilepas SEBELUM menulis ke database. Begitu dashboard melihat perintah
  // selesai, perintah berikutnya harus langsung bisa diterima.
  for (const [deviceId, active] of hub.activeJobs) {
    if (active.jobId === jobId) {
      clearTimeout(active.timer);
      hub.activeJobs.delete(deviceId);
    }
  }

  const { rows } = await query(
    `UPDATE jobs SET status = $2, error = $3, finished_at = now(),
            progress = CASE WHEN $2 = 'done' AND kind = 'topup' THEN 21 ELSE progress END
     WHERE id = $1 AND finished_at IS NULL RETURNING *`,
    [jobId, ok ? 'done' : 'failed', ok ? null : error || 'Gagal tanpa keterangan dari alat.']
  );
  const job = rows[0];
  if (!job) return null;

  const owner = await query('SELECT owner_id FROM devices WHERE id = $1', [job.device_id]);
  if (owner.rows[0]) await notifyJob(owner.rows[0].owner_id, job);
  return job;
}

export const completeJob = (jobId) => finish(jobId, true, null);
export const failJob = (jobId, error) => finish(jobId, false, error);

// Dipanggil saat alat terputus: perintah yang sedang jalan dianggap gagal
export async function failActiveJobOf(deviceId, reason) {
  const active = hub.activeJobs.get(Number(deviceId));
  if (!active) return;
  if (active.jobId == null) {
    hub.activeJobs.delete(Number(deviceId));
    return;
  }
  await failJob(active.jobId, reason);
}
