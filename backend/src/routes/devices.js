import { Router } from 'express';
import { query } from '../db.js';
import { requireUser, newDeviceKey, hashDeviceKey } from '../auth.js';
import { hub } from '../hub.js';
import { wrap, HttpError } from '../errors.js';
import { startJob } from '../jobs.js';
import { recordKwh } from '../socket.js';
import { deviceJson, jobJson, photoJson } from '../serialize.js';

const router = Router();
router.use(requireUser);

function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function optionalNumber(value, { min = 0, max = 1e7 } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, 'Angka tidak valid.');
  return n;
}

async function ownDevice(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(404, 'Meteran tidak ditemukan.');
  const { rows } = await query('SELECT * FROM devices WHERE id = $1 AND owner_id = $2', [id, req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Meteran tidak ditemukan.');
  return rows[0];
}

router.get(
  '/',
  wrap(async (req, res) => {
    const { rows } = await query('SELECT * FROM devices WHERE owner_id = $1 ORDER BY id', [req.user.id]);
    res.json({ devices: rows.map((d) => deviceJson(d, hub.isOnline(d.id))) });
  })
);

router.post(
  '/',
  wrap(async (req, res) => {
    const name = text(req.body?.name, 60);
    if (!name) throw new HttpError(400, 'Nama meteran wajib diisi.');
    const key = newDeviceKey();
    const { rows } = await query(
      `INSERT INTO devices (owner_id, name, meter_number, meter_brand, power_va, check_code, device_key_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.user.id,
        name,
        text(req.body?.meterNumber, 20),
        text(req.body?.meterBrand, 40),
        optionalNumber(req.body?.powerVa, { max: 200000 }),
        text(req.body?.checkCode, 20).replace(/[^0-9*#]/g, ''),
        hashDeviceKey(key),
      ]
    );
    // Kunci alat hanya dikirim sekali, saat dibuat
    res.status(201).json({ device: deviceJson(rows[0], false), deviceKey: key });
  })
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const device = await ownDevice(req);
    res.json({ device: deviceJson(device, hub.isOnline(device.id)) });
  })
);

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const device = await ownDevice(req);
    const b = req.body || {};
    const next = {
      name: b.name !== undefined ? text(b.name, 60) : device.name,
      meter_number: b.meterNumber !== undefined ? text(b.meterNumber, 20) : device.meter_number,
      meter_brand: b.meterBrand !== undefined ? text(b.meterBrand, 40) : device.meter_brand,
      power_va: b.powerVa !== undefined ? optionalNumber(b.powerVa, { max: 200000 }) : device.power_va,
      check_code:
        b.checkCode !== undefined ? text(b.checkCode, 20).replace(/[^0-9*#]/g, '') : device.check_code,
      low_kwh_threshold:
        b.lowKwhThreshold !== undefined
          ? optionalNumber(b.lowKwhThreshold, { max: 10000 }) ?? 10
          : device.low_kwh_threshold,
    };
    if (!next.name) throw new HttpError(400, 'Nama meteran wajib diisi.');
    const { rows } = await query(
      `UPDATE devices SET name = $2, meter_number = $3, meter_brand = $4, power_va = $5,
              check_code = $6, low_kwh_threshold = $7
       WHERE id = $1 RETURNING *`,
      [device.id, next.name, next.meter_number, next.meter_brand, next.power_va, next.check_code, next.low_kwh_threshold]
    );
    // Kabari alat kalau kode cek berubah
    hub.sendToDevice(device.id, { type: 'config', checkCode: rows[0].check_code });
    res.json({ device: deviceJson(rows[0], hub.isOnline(device.id)) });
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const device = await ownDevice(req);
    const entry = hub.devices.get(device.id);
    if (entry) entry.ws.close(4004, 'device deleted');
    await query('DELETE FROM devices WHERE id = $1', [device.id]);
    res.status(204).end();
  })
);

router.post(
  '/:id/rotate-key',
  wrap(async (req, res) => {
    const device = await ownDevice(req);
    const key = newDeviceKey();
    await query('UPDATE devices SET device_key_hash = $2 WHERE id = $1', [device.id, hashDeviceKey(key)]);
    const entry = hub.devices.get(device.id);
    if (entry) entry.ws.close(4001, 'key rotated');
    res.json({ deviceKey: key });
  })
);

router.get(
  '/:id/jobs',
  wrap(async (req, res) => {
    const device = await ownDevice(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const kind = req.query.kind === 'topup' || req.query.kind === 'check' ? req.query.kind : null;
    const { rows } = await query(
      `SELECT * FROM jobs WHERE device_id = $1 AND ($2::text IS NULL OR kind = $2)
       ORDER BY id DESC LIMIT $3`,
      [device.id, kind, limit]
    );
    res.json({ jobs: rows.map(jobJson) });
  })
);

// Isi kWh manual dari foto, selama OCR belum dipakai
router.patch(
  '/:id/jobs/:jobId',
  wrap(async (req, res) => {
    const device = await ownDevice(req);
    const jobId = Number(req.params.jobId);
    const before = optionalNumber(req.body?.kwhBefore, { max: 100000 });
    const after = optionalNumber(req.body?.kwhAfter, { max: 100000 });
    const { rows } = await query(
      `UPDATE jobs SET kwh_before = COALESCE($3, kwh_before), kwh_after = COALESCE($4, kwh_after)
       WHERE id = $1 AND device_id = $2 RETURNING *`,
      [jobId, device.id, before, after]
    );
    if (!rows[0]) throw new HttpError(404, 'Riwayat tidak ditemukan.');
    hub.notifyUser(req.user.id, { type: 'job', job: jobJson(rows[0]) });
    res.json({ job: jobJson(rows[0]) });
  })
);

// Catat sisa kWh manual (dibaca pengguna dari foto layar)
router.post(
  '/:id/kwh',
  wrap(async (req, res) => {
    const device = await ownDevice(req);
    const kwh = optionalNumber(req.body?.kwh, { max: 100000 });
    if (kwh == null) throw new HttpError(400, 'Isi angka sisa kWh.');
    await recordKwh(device.id, req.user.id, null, 'check', kwh);
    const { rows } = await query('SELECT * FROM devices WHERE id = $1', [device.id]);
    res.json({ device: deviceJson(rows[0], hub.isOnline(device.id)) });
  })
);

router.get(
  '/:id/photos/latest',
  wrap(async (req, res) => {
    const device = await ownDevice(req);
    const { rows } = await query(
      'SELECT * FROM photos WHERE device_id = $1 ORDER BY id DESC LIMIT 1',
      [device.id]
    );
    res.json({ photo: rows[0] ? photoJson(rows[0]) : null });
  })
);

router.post(
  '/:id/topup',
  wrap(async (req, res) => {
    const token = String(req.body?.token || '').replace(/\D/g, '');
    if (token.length !== 20) {
      throw new HttpError(400, `Token harus 20 digit. Yang diterima ${token.length} digit.`);
    }
    const device = await ownDevice(req);
    const job = await startJob({ device, userId: req.user.id, kind: 'topup', token });
    res.status(202).json({ job: jobJson(job) });
  })
);

router.post(
  '/:id/check',
  wrap(async (req, res) => {
    const device = await ownDevice(req);
    const job = await startJob({ device, userId: req.user.id, kind: 'check' });
    res.status(202).json({ job: jobJson(job) });
  })
);

export default router;
