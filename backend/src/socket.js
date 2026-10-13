import { WebSocketServer } from 'ws';
import { query } from './db.js';
import { hub } from './hub.js';
import { config, originAllowed } from './config.js';
import { verifyUserToken, deviceKeyMatches } from './auth.js';
import { updateProgress, completeJob, failJob, failActiveJobOf, activeJobFor } from './jobs.js';
import { jobJson, photoJson } from './serialize.js';

const AUTH_TIMEOUT_MS = 10000;
const PING_INTERVAL_MS = 30000;
const LAST_SEEN_WRITE_MS = 60000;
const MAX_PHOTO_BYTES = 400 * 1024;

function send(ws, message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 768 * 1024 });

  // Ping berkala untuk membuang koneksi mati (WiFi putus tanpa menutup socket)
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, PING_INTERVAL_MS);
  wss.on('close', () => clearInterval(interval));

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    ws.origin = (req.headers.origin || '').replace(/\/$/, '');
    ws.role = null;

    const authTimer = setTimeout(() => {
      if (!ws.role) ws.close(4001, 'auth timeout');
    }, AUTH_TIMEOUT_MS);

    ws.on('message', async (raw, isBinary) => {
      if (isBinary) return;
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: 'error', error: 'Pesan bukan JSON yang valid.' });
      }
      try {
        if (!ws.role) {
          if (msg.type === 'auth') await authUser(ws, msg);
          else if (msg.type === 'hello') await authDevice(ws, msg);
          else ws.close(4001, 'auth required');
          if (ws.role) clearTimeout(authTimer);
          return;
        }
        if (ws.role === 'device') await onDeviceMessage(ws, msg);
        else if (msg.type === 'ping') send(ws, { type: 'pong', t: Date.now() });
      } catch (err) {
        console.error('WS error:', err);
        send(ws, { type: 'error', error: 'Terjadi kesalahan di server.' });
      }
    });

    ws.on('close', async () => {
      clearTimeout(authTimer);
      if (ws.role === 'user') hub.removeUser(ws.userId, ws);
      if (ws.role === 'device') {
        const entry = hub.devices.get(ws.deviceId);
        if (entry && entry.ws === ws) {
          hub.devices.delete(ws.deviceId);
          hub.notifyUser(ws.ownerId, { type: 'device', deviceId: ws.deviceId, online: false });
          await failActiveJobOf(ws.deviceId, 'Alat terputus saat mengerjakan perintah.').catch(() => {});
          await query('UPDATE devices SET last_seen = now() WHERE id = $1', [ws.deviceId]).catch(() => {});
        }
      }
    });
  });

  return wss;
}

async function authUser(ws, msg) {
  if (!originAllowed(ws.origin)) {
    return ws.close(4003, 'origin not allowed');
  }
  const user = verifyUserToken(String(msg.token || ''));
  if (!user) return ws.close(4001, 'invalid token');
  ws.role = 'user';
  ws.userId = user.id;
  hub.addUser(user.id, ws);

  const { rows } = await query('SELECT id FROM devices WHERE owner_id = $1', [user.id]);
  const online = rows.map((r) => r.id).filter((id) => hub.isOnline(id));
  send(ws, { type: 'ready', online });
}

async function authDevice(ws, msg) {
  const deviceId = Number(msg.deviceId);
  if (!Number.isInteger(deviceId)) {
    send(ws, { type: 'error', error: 'ID alat tidak valid.' });
    return ws.close(4001, 'invalid device');
  }
  const { rows } = await query('SELECT * FROM devices WHERE id = $1', [deviceId]);
  const device = rows[0];
  if (!device || !deviceKeyMatches(String(msg.key || ''), device.device_key_hash)) {
    // Pesan ini dibaca firmware: alat berhenti mencoba terlalu sering dan menampilkan petunjuk
    send(ws, { type: 'error', code: 'auth', error: 'ID atau kunci alat salah.' });
    return ws.close(4001, 'invalid device key');
  }

  // Koneksi lama alat yang sama ditutup, yang baru dipakai
  const old = hub.devices.get(deviceId);
  if (old && old.ws !== ws) {
    old.ws.removeAllListeners('close');
    old.ws.close(4000, 'replaced');
  }

  ws.role = 'device';
  ws.deviceId = deviceId;
  ws.ownerId = device.owner_id;
  ws.lastSeenWrite = Date.now();
  hub.devices.set(deviceId, { ws, ownerId: device.owner_id });

  await query('UPDATE devices SET last_seen = now(), firmware = $2 WHERE id = $1', [
    deviceId,
    String(msg.firmware || '').slice(0, 40),
  ]);

  // Alat yang restart di tengah perintah tidak bisa melanjutkannya
  await failActiveJobOf(deviceId, 'Alat tersambung ulang di tengah perintah.').catch(() => {});

  send(ws, { type: 'welcome', deviceId, checkCode: device.check_code });
  hub.notifyUser(device.owner_id, { type: 'device', deviceId, online: true });
}

async function onDeviceMessage(ws, msg) {
  const { deviceId, ownerId } = ws;

  if (Date.now() - ws.lastSeenWrite > LAST_SEEN_WRITE_MS) {
    ws.lastSeenWrite = Date.now();
    query('UPDATE devices SET last_seen = now() WHERE id = $1', [deviceId]).catch(() => {});
  }

  switch (msg.type) {
    case 'heartbeat': {
      hub.notifyUser(ownerId, { type: 'device', deviceId, online: true, rssi: msg.rssi ?? null });
      return send(ws, { type: 'heartbeat_ack' });
    }

    case 'progress': {
      const job = await updateProgress(deviceId, msg.jobId, msg.stage, msg.index);
      if (job) hub.notifyUser(ownerId, { type: 'job', job: jobJson(job) });
      return;
    }

    case 'photo': {
      const image = Buffer.from(String(msg.image || ''), 'base64');
      if (image.length < 100 || image.length > MAX_PHOTO_BYTES) {
        return send(ws, { type: 'error', error: 'Ukuran foto tidak valid.' });
      }
      const stage = ['before', 'after', 'check'].includes(msg.stage) ? msg.stage : 'check';
      const jobId = msg.jobId != null && activeJobFor(deviceId, msg.jobId) ? Number(msg.jobId) : null;

      const { rows } = await query(
        `INSERT INTO photos (device_id, job_id, stage, image) VALUES ($1, $2, $3, $4) RETURNING *`,
        [deviceId, jobId, stage, image]
      );
      await query(
        `DELETE FROM photos WHERE device_id = $1 AND id NOT IN (
           SELECT id FROM photos WHERE device_id = $1 ORDER BY id DESC LIMIT $2)`,
        [deviceId, config.photosPerDevice]
      );
      hub.notifyUser(ownerId, { type: 'photo', photo: photoJson(rows[0]) });

      // Angka kWh opsional, kalau nanti alat atau OCR bisa membacanya
      const kwh = Number(msg.kwh);
      if (msg.kwh != null && Number.isFinite(kwh) && kwh >= 0) {
        await recordKwh(deviceId, ownerId, jobId, stage, kwh);
      }
      return;
    }

    case 'result': {
      if (!activeJobFor(deviceId, msg.jobId)) return;
      if (msg.ok) await completeJob(Number(msg.jobId));
      else await failJob(Number(msg.jobId), String(msg.error || '').slice(0, 200) || null);
      return;
    }

    default:
      return send(ws, { type: 'error', error: `Jenis pesan tidak dikenal: ${msg.type}` });
  }
}

export async function recordKwh(deviceId, ownerId, jobId, stage, kwh) {
  if (jobId) {
    const column = stage === 'after' ? 'kwh_after' : 'kwh_before';
    const { rows } = await query(`UPDATE jobs SET ${column} = $2 WHERE id = $1 RETURNING *`, [jobId, kwh]);
    if (rows[0]) hub.notifyUser(ownerId, { type: 'job', job: jobJson(rows[0]) });
  }
  const { rows } = await query(
    `UPDATE devices SET last_kwh = $2, last_kwh_at = now() WHERE id = $1 RETURNING low_kwh_threshold`,
    [deviceId, kwh]
  );
  const threshold = rows[0]?.low_kwh_threshold;
  hub.notifyUser(ownerId, { type: 'kwh', deviceId, kwh, low: threshold != null && kwh < threshold });
}
