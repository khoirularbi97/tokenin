# Firmware ESP32-CAM Tokenin

Program untuk ESP32-CAM AI Thinker yang menerima perintah dari server Tokenin, menekan keypad meteran
lewat 12 solenoid, memotret layar meteran, lalu melaporkan hasilnya ke dashboard.

```
firmware/
├── docs/wiring.html            skema rangkaian (buka di browser)
└── tokenin_esp32cam/
    ├── tokenin_esp32cam.ino    program utama: koneksi, perintah, LED, perintah Serial
    ├── config.h                semua pengaturan yang boleh diubah
    ├── certs.h                 sertifikat root untuk koneksi aman ke server
    ├── solenoid.h              penggerak 12 solenoid lewat MCP23017
    ├── camera.h                kamera dan pengiriman foto
    └── portal.h                portal WiFi dan penyimpanan pengaturan
```

## 1. Siapkan Arduino IDE

1. **File > Preferences > Additional boards manager URLs**, tambahkan:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
2. **Tools > Board > Boards Manager**, pasang **esp32 oleh Espressif Systems** versi 3.x.
3. **Sketch > Include Library > Manage Libraries**, pasang:

   | Library | Pembuat | Versi |
   | --- | --- | --- |
   | WebSockets | Markus Sattler (Links2004) | 2.7 ke atas |
   | WiFiManager | tzapu | 2.0.17 ke atas |
   | ArduinoJson | Benoit Blanchon | 7.x |

4. Buka `tokenin_esp32cam/tokenin_esp32cam.ino`, lalu atur menu **Tools**:

   | Menu | Pilihan |
   | --- | --- |
   | Board | AI Thinker ESP32-CAM |
   | Partition Scheme | Minimal SPIFFS (1.9MB APP with OTA/128KB SPIFFS) |
   | Port | port USB board ESP32-CAM-MB |

   Partition Scheme wajib diganti dari bawaannya (Huge APP), karena update lewat WiFi butuh ruang OTA.

## 2. Upload pertama

1. Pasang ESP32-CAM di board ESP32-CAM-MB, sambungkan USB ke laptop.
2. Klik Upload. Kalau muncul "Failed to connect", tahan tombol IO0 di board MB, tekan RST sebentar,
   lepas IO0, lalu ulangi upload.
3. Buka **Serial Monitor**, 115200 baud, akhiran **Newline**.

## 3. Isi WiFi, server, dan kunci alat

Di dashboard, buka **Tambah meteran**, isi data meteran, lalu catat **ID alat** dan **kunci alat**.
Kunci hanya ditampilkan sekali. Isi **Kode cek sisa kWh** dengan `#` untuk tombol Enter dan `*` untuk
tombol hapus, contoh `37#`.

Pilih salah satu cara:

**Lewat HP (disarankan)**

1. Nyalakan alat. Karena belum diatur, alat membuka WiFi **Tokenin-Setup-xxxx**, sandi `tokenin123`.
2. Sambungkan HP ke WiFi itu. Halaman pengaturan biasanya terbuka sendiri; kalau tidak, buka `192.168.4.1`.
3. Pilih **Configure WiFi**, pilih WiFi rumah, isi sandinya, lalu isi:
   - **Alamat server Tokenin**: alamat backend Render, contoh `https://tokenin-api.onrender.com`
   - **ID alat** dan **Kunci alat**: dari dashboard
4. Simpan. Alat tersambung, dan meteran di dashboard berubah menjadi Online.

**Lewat `config.h`**

Tempel blok **Salin konfigurasi** dari dashboard ke `config.h`, upload, lalu pilih WiFi lewat portal di atas.

Untuk membuka portal lagi (misalnya ganti WiFi atau kunci baru): tekan tombol **RST dua kali** dalam
5 detik, atau ketik `setup` di Serial Monitor.

## 4. Uji dan kalibrasi

Ketik perintah ini di Serial Monitor:

| Perintah | Fungsi |
| --- | --- |
| `info` | Status WiFi, server, MCP23017, kamera, dan memori |
| `tekan 5` | Menekan satu tombol (`0`-`9`, `*` hapus, `#` Enter) |
| `test` | Menekan semua tombol berurutan sesuai `KEYMAP` |
| `foto` | Mencoba memotret |
| `setup` | Membuka portal pengaturan |
| `lupakan` | Menghapus WiFi dan pengaturan, lalu restart |
| `restart` | Restart alat |

Yang biasanya perlu disetel di `config.h` setelah alat terpasang di meteran:

- `KEY_PRESS_MS`: naikkan kalau ada tombol yang tidak terdaftar di layar meteran.
- `KEY_GAP_MS`: naikkan kalau meteran melewatkan digit saat token dimasukkan.
- `KEYMAP`: ubah kalau kabel solenoid terpasang di tombol yang berbeda.
- `CHECK_DISPLAY_MS`, `RESULT_DISPLAY_MS`: lama menunggu layar sebelum memotret.
- `CAMERA_VFLIP`, `CAMERA_HMIRROR`, `USE_FLASH`: kalau foto terbalik atau gelap.

## 5. LED merah di belakang board

| Pola | Arti |
| --- | --- |
| Kedip cepat | Belum tersambung ke WiFi, atau portal sedang terbuka |
| Kedip lambat | WiFi tersambung, sedang menyambung ke server |
| Kedip dua kali | ID atau kunci alat ditolak server |
| Menyala | Siap menerima perintah |
| Kedip sangat cepat | Sedang menekan tombol |

## 6. Update lewat WiFi (OTA)

Setelah alat terpasang, board MB tidak perlu disambung lagi. Selama laptop di WiFi yang sama:

1. Di Arduino IDE, **Tools > Port**, pilih port jaringan **tokenin-ID**.
2. Upload seperti biasa. Kata sandi OTA adalah **kunci alat**.

## Cara kerja perintah

**Isi token** dari dashboard:
1. Kalau kode cek diisi: tekan kode cek, tunggu layar, foto `before`.
2. Tekan 20 digit token, lapor progres setiap digit, lalu tekan Enter.
3. Tunggu layar menampilkan hasil, foto `after`, lapor selesai.

**Cek sisa kWh**: tekan kode cek, tunggu layar, foto `check`, lapor selesai.

Kalau koneksi ke server putus di tengah perintah, alat langsung berhenti menekan dan server menandai
perintah gagal. Token tidak pernah disimpan di alat, dan di log hanya tampil versi tersamar.

## Pengaman bawaan

- Hanya satu solenoid yang bisa menyala, dan dimatikan paksa setelah `KEY_MAX_ON_MS` (400 ms).
- Saat start, semua output MCP23017 diisi 0 sebelum dijadikan output.
- Kalau perintah mati tidak terkirim lewat I2C, MCP23017 di-reset lewat IO15 sehingga semua solenoid mati.
- Watchdog me-restart alat kalau program macet 30 detik.
- Alat restart sendiri kalau WiFi putus 5 menit atau server tidak tersambung 15 menit.
- Koneksi ke server memeriksa sertifikat (`VERIFY_TLS 1`), jadi kunci alat tidak bisa disadap.

## Masalah umum

| Gejala di Serial Monitor | Penyebab dan solusi |
| --- | --- |
| `MCP23017 TIDAK terdeteksi` | Cek SDA ke IO14, SCL ke IO13, VDD ke 3V3, A0-A2 ke GND, dan pull-up 4,7 kΩ |
| `[kamera] Gagal start` | Kabel pita kamera longgar, atau daya 5 V kurang kuat. Token tetap bisa dimasukkan tanpa foto |
| `Brownout detector was triggered` | Daya turun saat WiFi atau solenoid aktif. Pakai adaptor 2 A, kapasitor 470-1000 µF di 5 V |
| `ID atau kunci alat ditolak` | Kunci salah atau sudah diganti. Ambil kunci baru di detail meteran, isi lewat portal |
| Terus `Koneksi terputus` tanpa pesan lain | Cek alamat server. Kalau alamat benar, coba `VERIFY_TLS 0` untuk memastikan bukan masalah sertifikat |
| `PSRAM tidak terdeteksi` | Board tanpa PSRAM; foto turun ke 320x240. Pastikan Board yang dipilih AI Thinker ESP32-CAM |
