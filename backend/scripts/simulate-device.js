// Alat palsu untuk menguji sistem tanpa ESP32-CAM.
// Pemakaian: npm run simulate-device -- --url wss://API.onrender.com/ws --id 1 --key KUNCI_ALAT
// Angka kWh yang dikirim adalah angka acak untuk simulasi.
import WebSocket from 'ws';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const url = args.url || 'ws://localhost:3000/ws';
const deviceId = Number(args.id);
const key = args.key;
const pressMs = Number(args.press || 300);
if (!deviceId || !key) {
  console.log('Pemakaian: npm run simulate-device -- --url ws://localhost:3000/ws --id 1 --key KUNCI_ALAT');
  process.exit(1);
}

// Foto JPEG kecil bertuliskan SIMULASI
const PHOTO = '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';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let kwh = 8 + Math.round(Math.random() * 1000) / 100;
let ws;
let heartbeat;

function send(msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

async function runJob(msg) {
  const jobId = msg.jobId;
  try {
    if (msg.checkCode) {
      send({ type: 'progress', jobId, stage: 'checking', index: 0 });
      await sleep(1200);
      send({ type: 'photo', jobId, stage: msg.type === 'check' ? 'check' : 'before', image: PHOTO, kwh });
    }
    if (msg.type === 'topup') {
      for (let i = 1; i <= 21; i++) {
        await sleep(pressMs);
        send({ type: 'progress', jobId, stage: 'pressing', index: i });
      }
      await sleep(800);
      kwh = Math.round((kwh + 30 + Math.random() * 5) * 100) / 100;
      send({ type: 'photo', jobId, stage: 'after', image: PHOTO, kwh });
    }
    send({ type: 'result', jobId, ok: true });
    console.log(`Perintah #${jobId} selesai. kWh simulasi: ${kwh}`);
  } catch (err) {
    send({ type: 'result', jobId, ok: false, error: err.message });
  }
}

function connect() {
  ws = new WebSocket(url);
  ws.on('open', () => {
    send({ type: 'hello', deviceId, key, firmware: 'simulator-1.0' });
  });
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'welcome') {
      console.log(`Tersambung sebagai alat #${deviceId}. Kode cek: ${msg.checkCode || '(belum diatur)'}`);
      clearInterval(heartbeat);
      heartbeat = setInterval(() => send({ type: 'heartbeat', rssi: -50 - Math.round(Math.random() * 20) }), 60000);
    } else if (msg.type === 'topup' || msg.type === 'check') {
      console.log(`Menerima perintah ${msg.type} #${msg.jobId}`);
      runJob(msg);
    } else if (msg.type === 'error') {
      console.log('Server:', msg.error);
    }
  });
  ws.on('close', (code, reason) => {
    clearInterval(heartbeat);
    console.log(`Terputus (${code} ${reason}). Menyambung ulang dalam 3 detik...`);
    if (code === 4001) {
      console.log('ID atau kunci alat salah. Periksa kembali.');
      process.exit(1);
    }
    setTimeout(connect, 3000);
  });
  ws.on('error', (err) => console.log('Error:', err.message));
}

connect();
