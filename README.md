# Tokenin

Sistem isi token listrik jarak jauh: ESP32-CAM menekan keypad meteran dengan 12 solenoid,
dikendalikan dari dashboard web lewat internet.

| Bagian | Teknologi | Deploy |
| --- | --- | --- |
| `frontend/` | React 18 + Vite | Vercel |
| `backend/` | Node.js, Express, WebSocket (`ws`) | Render |
| Database | PostgreSQL | Neon |

```
tokenin/
├── render.yaml              blueprint Render (opsional)
├── backend/
│   ├── db/schema.sql        tabel users, devices, jobs, photos (dibuat otomatis saat server start)
│   ├── scripts/
│   │   ├── create-user.js   membuat akun login
│   │   └── simulate-device.js  alat palsu untuk uji tanpa ESP32-CAM
│   └── src/                 API REST + server WebSocket
└── frontend/
    ├── vercel.json          supaya refresh di /meteran/1 tidak 404
    └── src/                 halaman login, dashboard, detail, tambah meteran
```

## Urutan deploy

Urutannya penting karena tiap layanan butuh alamat layanan sebelumnya.

### 1. Upload ke GitHub

Buat repo baru (boleh private), lalu push seluruh folder `tokenin`. File `.env` sudah diabaikan oleh `.gitignore`.

### 2. Neon (database)

1. Buat project baru di Neon, pilih region terdekat (Singapore).
2. Di halaman project, buka **Connect**, aktifkan **Connection pooling**, lalu salin connection string-nya.
   Bentuknya `postgresql://...-pooler...neon.tech/neondb?sslmode=require`.
3. Tabel tidak perlu dibuat manual. Backend menjalankan `db/schema.sql` setiap kali start.

### 3. Render (backend)

1. **New > Web Service**, hubungkan repo GitHub tadi.
2. Isi pengaturan:

   | Pengaturan | Nilai |
   | --- | --- |
   | Root Directory | `backend` |
   | Runtime | Node |
   | Build Command | `npm ci` |
   | Start Command | `npm start` |
   | Health Check Path | `/healthz` |
   | Instance Type | Free |

3. Tambahkan Environment Variables:

   | Key | Isi |
   | --- | --- |
   | `DATABASE_URL` | connection string Neon dari langkah 2 |
   | `JWT_SECRET` | string acak minimal 32 karakter (klik Generate) |
   | `CORS_ORIGIN` | kosongkan dulu, diisi setelah langkah 5 |
   | `NODE_VERSION` | `22` |

4. Deploy. Setelah status **Live**, buka `https://NAMA-SERVICE.onrender.com/healthz`. Harus muncul `{"ok":true,...}`.

Alternatif: pakai **New > Blueprint** dan pilih repo ini, Render membaca `render.yaml` di root.

### 4. Buat akun login

Paket gratis Render tidak punya Shell, jadi akun dibuat dari laptop dengan database Neon yang sama:

```bash
cd backend
npm install
cp .env.example .env        # isi DATABASE_URL dengan string Neon, JWT_SECRET bebas
npm run create-user -- emailkamu@contoh.com kataSandiMinimal8 "Nama Kamu"
```

Perintah yang sama dengan email yang sama dipakai untuk mengganti kata sandi.

### 5. Vercel (frontend)

1. **Add New > Project**, pilih repo yang sama.
2. Root Directory: `frontend`. Framework Preset: Vite (terdeteksi otomatis).
3. Environment Variable: `VITE_API_URL` = `https://NAMA-SERVICE.onrender.com` (tanpa `/` di akhir).
4. Deploy, lalu catat domainnya, misalnya `https://tokenin.vercel.app`.

`VITE_API_URL` dibaca saat build. Kalau nanti diubah, lakukan **Redeploy**.

### 6. Hubungkan frontend ke backend

Kembali ke Render, isi `CORS_ORIGIN` dengan domain Vercel, misalnya `https://tokenin.vercel.app`.
Untuk beberapa domain, pisahkan dengan koma. Simpan, Render akan deploy ulang otomatis.

### 7. Uji tanpa alat

1. Buka domain Vercel, masuk, lalu **Tambah meteran**. Isi kode cek sisa kWh dengan angka apa saja.
2. Salin ID dan kunci alat yang muncul (kunci hanya tampil sekali).
3. Dari laptop, jalankan alat palsu:

   ```bash
   cd backend
   npm run simulate-device -- --url wss://NAMA-SERVICE.onrender.com/ws --id 1 --key KUNCI_ALAT
   ```

4. Meteran berubah jadi Online. Coba isi token 20 digit dan Cek sekarang. Angka kWh dari simulator adalah angka acak.

## Menjalankan di laptop

Butuh Node.js 20 atau lebih baru, dan database (Neon atau PostgreSQL lokal).

```bash
# terminal 1
cd backend && npm install && cp .env.example .env   # isi DATABASE_URL, JWT_SECRET
npm run create-user -- kamu@contoh.com kataSandi123 "Nama"
npm run dev                                          # http://localhost:3000

# terminal 2
cd frontend && npm install
echo "VITE_API_URL=http://localhost:3000" > .env.local
npm run dev                                          # http://localhost:5173
```

Pastikan `CORS_ORIGIN` di `backend/.env` memuat `http://localhost:5173`.

## Protokol alat (untuk firmware ESP32-CAM)

Alat menyambung ke `wss://NAMA-SERVICE.onrender.com/ws` (port 443) dan bertukar pesan JSON teks.

**Alat ke server**

| Pesan | Kapan |
| --- | --- |
| `{"type":"hello","deviceId":1,"key":"...","firmware":"1.0.0"}` | Pertama kali tersambung, maksimal 10 detik |
| `{"type":"heartbeat","rssi":-60}` | Tiap 60 detik. Ini juga menjaga Render free tidak tidur |
| `{"type":"progress","jobId":5,"stage":"checking","index":0}` | Mulai menekan kode cek |
| `{"type":"progress","jobId":5,"stage":"pressing","index":3}` | Setelah tiap tombol: `index` = jumlah yang sudah ditekan, 1-20 digit, 21 = Enter |
| `{"type":"photo","jobId":5,"stage":"before","image":"<base64 JPEG>"}` | Foto layar. `stage`: `before`, `after`, atau `check`. Boleh tambah `"kwh":12.5` kalau angka bisa dibaca |
| `{"type":"result","jobId":5,"ok":true}` | Perintah selesai. Kalau gagal: `"ok":false,"error":"alasan"` |

**Server ke alat**

| Pesan | Arti |
| --- | --- |
| `{"type":"welcome","deviceId":1,"checkCode":"37"}` | Login alat berhasil |
| `{"type":"topup","jobId":5,"token":"12345678901234567890","checkCode":"37"}` | Isi token. Kalau `checkCode` tidak kosong, cek sisa dan foto dulu (`before`), lalu tekan 20 digit + Enter, lalu foto `after` |
| `{"type":"check","jobId":6,"checkCode":"37"}` | Tekan kode cek, foto layar (`check`), lalu kirim `result` |
| `{"type":"config","checkCode":"37"}` | Kode cek diubah dari dashboard |

Server menutup koneksi dengan kode `4001` kalau ID atau kunci salah. Perintah yang tidak dilaporkan selesai
dalam 2 menit, atau alat terputus di tengah jalan, otomatis ditandai gagal.

Foto: JPEG maksimal 400 KB sebelum base64. Resolusi VGA dengan kualitas 12-15 sudah cukup.

## Catatan penting

- **Render free tidur** setelah 15 menit tanpa trafik. Heartbeat alat menjaganya tetap hidup.
  Tanpa alat yang online, akses pertama ke dashboard bisa butuh sampai satu menit.
- **Render free bisa restart kapan saja.** Alat dan dashboard menyambung ulang otomatis, tapi perintah yang
  sedang berjalan saat restart ditandai gagal.
- **Token asli tidak disimpan.** Database hanya menyimpan versi tersamar (`1234 •••• •••• •••• 7890`).
- **Foto** disimpan di Neon, 20 foto terakhir per meteran.
- **Angka kWh** belum dibaca otomatis dari foto. Isi manual di halaman detail, atau kirim field `kwh`
  dari alat kalau nanti ada OCR.
- **Notifikasi kWh menipis** muncul di browser selama dashboard terbuka. Notifikasi saat browser tertutup
  butuh Web Push atau bot Telegram, belum termasuk paket ini.
- **Login** memakai JWT yang disimpan di browser dan berlaku 7 hari.
