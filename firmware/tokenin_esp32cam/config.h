#pragma once
// =====================================================================
//  PENGATURAN TOKENIN ESP32-CAM
//  Ubah file ini sesuai alat kamu, lalu upload ulang.
// =====================================================================

#define FIRMWARE_VERSION "1.0.0"

// ---------------------------------------------------------------------
// 1. Server dan identitas alat
//
// Cara termudah: biarkan seperti ini, upload, lalu isi lewat portal WiFi
// (HP tersambung ke WiFi "Tokenin-Setup-xxxx", lihat README).
//
// Atau tempel blok "Salin konfigurasi" dari dashboard ke sini.
// Isian dari portal selalu dipakai lebih dulu daripada isian di file ini.
// ---------------------------------------------------------------------
#define TOKENIN_DEVICE_ID  0
#define TOKENIN_DEVICE_KEY ""
#define TOKENIN_HOST       "tokenin-api.onrender.com"
#define TOKENIN_PORT       443
#define TOKENIN_SECURE     true

// Periksa sertifikat server (disarankan). Daftar sertifikat yang dipercaya
// ada di certs.h dan mencakup Let's Encrypt serta Google Trust Services,
// dua penerbit yang dipakai Render. Kalau Serial Monitor terus menampilkan
// "gagal tersambung ke server" padahal alamat, ID, dan kunci sudah benar,
// coba ubah ke 0 untuk memastikan masalahnya di sertifikat.
#define VERIFY_TLS 1

// ---------------------------------------------------------------------
// 2. Portal pengaturan WiFi
// ---------------------------------------------------------------------
#define PORTAL_PASSWORD   "tokenin123"  // minimal 8 karakter
#define PORTAL_TIMEOUT_S  300           // portal ditutup setelah 5 menit, lalu alat restart

// ---------------------------------------------------------------------
// 3. Pin. Sesuai wiring diagram, jangan diubah kecuali rangkaian berbeda.
// ---------------------------------------------------------------------
#define PIN_I2C_SDA      14   // ke SDA MCP23017
#define PIN_I2C_SCL      13   // ke SCL MCP23017
#define PIN_MCP_RESET    15   // ke RESET MCP23017. Isi -1 kalau RESET disambung langsung ke 3.3V
#define MCP23017_ADDR    0x20 // A0, A1, A2 ke GND
#define PIN_FLASH         4   // LED flash besar di depan board
#define PIN_STATUS_LED   33   // LED merah kecil di belakang board (menyala saat LOW)

// ---------------------------------------------------------------------
// 4. Urutan tombol pada output MCP23017
//    Huruf ke-1 = GPA0, ke-2 = GPA1, ... ke-8 = GPA7, ke-9 = GPB0 ... ke-12 = GPB3
//    '*' = tombol hapus (panah kiri), '#' = tombol Enter
// ---------------------------------------------------------------------
#define KEYMAP "12345678" "9*0#"

// ---------------------------------------------------------------------
// 5. Waktu penekanan (milidetik). Kalibrasi dengan perintah Serial "test".
// ---------------------------------------------------------------------
#define KEY_PRESS_MS       120   // lama solenoid menekan satu tombol
#define KEY_GAP_MS         250   // jeda sebelum tombol berikutnya
#define KEY_MAX_ON_MS      400   // pengaman: solenoid dipaksa mati kalau menyala lebih lama dari ini
#define CHECK_DISPLAY_MS  1500   // tunggu layar menampilkan sisa kWh setelah kode cek
#define RESULT_DISPLAY_MS 2500   // tunggu layar menampilkan hasil setelah token dimasukkan

// ---------------------------------------------------------------------
// 6. Kamera
// ---------------------------------------------------------------------
#define CAMERA_FRAME    FRAMESIZE_VGA  // 640x480. Pilihan lain: FRAMESIZE_SVGA (800x600), FRAMESIZE_QVGA (320x240)
#define CAMERA_QUALITY  12             // 10-63, makin kecil makin tajam dan makin besar ukurannya
#define CAMERA_VFLIP    0              // 1 kalau foto terbalik atas-bawah
#define CAMERA_HMIRROR  0              // 1 kalau foto terbalik kiri-kanan
#define USE_FLASH       0              // 1 kalau layar meteran gelap di foto
#define FLASH_WARMUP_MS 150            // jeda setelah flash menyala sebelum memotret

// ---------------------------------------------------------------------
// 7. Lain-lain
// ---------------------------------------------------------------------
#define HEARTBEAT_MS         60000UL   // kirim tanda hidup ke server (juga menjaga Render tidak tidur)
#define RECONNECT_MS          5000UL   // jeda sambung ulang ke server
#define AUTH_FAIL_BACKOFF_MS 60000UL   // jeda sambung ulang kalau ID/kunci ditolak
#define RESTART_NO_WIFI_MS  300000UL   // restart kalau WiFi putus 5 menit
#define RESTART_NO_SERVER_MS 900000UL  // restart kalau server tidak tersambung 15 menit
#define WATCHDOG_S              30     // restart otomatis kalau program macet
