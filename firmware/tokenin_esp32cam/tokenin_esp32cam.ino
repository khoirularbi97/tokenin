/*
  TOKENIN - firmware ESP32-CAM AI Thinker
  ---------------------------------------
  Menerima perintah dari server Tokenin lewat WebSocket, menekan keypad meteran
  listrik dengan 12 solenoid (lewat MCP23017), memotret layar meteran, lalu
  melaporkan hasilnya.

  Library (Library Manager Arduino IDE):
    - WebSockets   oleh Markus Sattler (Links2004)   versi 2.7 ke atas
    - WiFiManager  oleh tzapu                         versi 2.0.17 ke atas
    - ArduinoJson  oleh Benoit Blanchon               versi 7

  Board: "AI Thinker ESP32-CAM" (paket esp32 oleh Espressif, versi 3.x)
  Partition Scheme: "Minimal SPIFFS (1.9MB APP with OTA/128KB SPIFFS)"
  Pengaturan alat: config.h. Wiring: lihat docs/wiring.svg.
*/

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <esp_task_wdt.h>

#include "config.h"
#include "certs.h"
#include "solenoid.h"
#include "camera.h"
#include "portal.h"

// ===================== Status koneksi =====================
WebSocketsClient ws;
Settings cfg;
String checkCode;              // kode cek sisa kWh, dikirim server bersama tiap perintah
bool wsOpen = false;           // koneksi WebSocket terbuka
bool authed = false;           // server sudah menerima ID dan kunci alat
bool welcomedThisSocket = false;
uint8_t authFails = 0;         // berapa kali berturut-turut ditolak server
bool authRejected = false;     // server mengirim error ID/kunci salah
unsigned long lastHeartbeat = 0;
unsigned long lastServerOk = 0;
unsigned long wifiLostAt = 0;
bool otaRunning = false;

// ===================== Mesin perintah =====================
// Setiap perintah dari server diubah menjadi daftar langkah yang dijalankan satu per satu
// tanpa delay(), supaya koneksi WebSocket tetap hidup selama solenoid bekerja.
enum StepKind : uint8_t { STEP_PRESS, STEP_WAIT, STEP_PHOTO, STEP_PROGRESS, STEP_RESULT };

struct Step {
  StepKind kind;
  char key;           // STEP_PRESS: tombol yang ditekan
  int8_t report;      // STEP_PRESS/PROGRESS: nomor progres yang dilaporkan, -1 = tidak dilaporkan
  const char *stage;  // STEP_PRESS/PROGRESS: "checking"/"pressing"; STEP_PHOTO: "before"/"after"/"check"
  uint16_t ms;        // STEP_WAIT: lama menunggu
};

static const uint8_t MAX_STEPS = 72;

struct Job {
  bool active = false;
  bool local = false;   // perintah dari Serial (uji coba), tidak dilaporkan ke server
  long id = 0;
  Step steps[MAX_STEPS];
  uint8_t count = 0;
  uint8_t pos = 0;
  uint8_t phase = 0;    // untuk STEP_PRESS: 0 belum, 1 sedang menekan, 2 jeda setelah lepas
  unsigned long phaseAt = 0;
} job;

static bool addStep(Step s) {
  if (job.count >= MAX_STEPS) return false;
  job.steps[job.count++] = s;
  return true;
}
static void addPress(char key, int8_t report, const char *stage) {
  addStep({STEP_PRESS, key, report, stage, 0});
}
static void addWait(uint16_t ms) {
  addStep({STEP_WAIT, 0, -1, nullptr, ms});
}
static void addPhoto(const char *stage) {
  addStep({STEP_PHOTO, 0, -1, stage, 0});
}
static void addProgress(const char *stage, int8_t index) {
  addStep({STEP_PROGRESS, 0, index, stage, 0});
}

// ===================== Kirim pesan =====================
static void sendJson(const char *json) {
  if (wsOpen) ws.sendTXT(json);
}

static void sendProgress(const char *stage, int index) {
  if (job.local) {
    Serial.printf("[uji] %s %d\n", stage, index);
    return;
  }
  char buf[96];
  snprintf(buf, sizeof(buf), "{\"type\":\"progress\",\"jobId\":%ld,\"stage\":\"%s\",\"index\":%d}", job.id, stage,
           index);
  sendJson(buf);
}

static void sendResult(long jobId, bool ok, const char *error) {
  char buf[200];
  if (ok) {
    snprintf(buf, sizeof(buf), "{\"type\":\"result\",\"jobId\":%ld,\"ok\":true}", jobId);
  } else {
    JsonDocument doc;  // dipakai supaya teks error ter-escape dengan benar
    doc["type"] = "result";
    doc["jobId"] = jobId;
    doc["ok"] = false;
    doc["error"] = error;
    serializeJson(doc, buf, sizeof(buf));
  }
  sendJson(buf);
}

static void finishJob(bool ok, const char *error) {
  solenoid::allOff();
  if (job.local) {
    Serial.println(ok ? F("[uji] Selesai.") : F("[uji] Gagal."));
    if (!ok && error) Serial.println(error);
  } else {
    sendResult(job.id, ok, error);
    Serial.printf("[perintah] #%ld %s%s%s\n", job.id, ok ? "selesai" : "gagal", ok ? "" : ": ", ok ? "" : error);
  }
  job.active = false;
}

static void abortJob(const char *reason) {
  if (!job.active) return;
  solenoid::allOff();
  Serial.printf("[perintah] #%ld dibatalkan: %s\n", job.id, reason);
  job.active = false;
}

// ===================== Menyusun perintah =====================
static bool validCode(const String &code, String &why) {
  if (code.length() > 20) {
    why = "Kode cek terlalu panjang.";
    return false;
  }
  for (size_t i = 0; i < code.length(); i++) {
    if (!solenoid::isValidKey(code[i])) {
      why = String("Kode cek berisi karakter yang tidak ada di keypad: ") + code[i];
      return false;
    }
  }
  return true;
}

static void startJob(long id, bool local) {
  job = Job();
  job.active = true;
  job.local = local;
  job.id = id;
}

// Langkah cek sisa kWh: tekan kode cek, tunggu layar, potret
static void planCheck(const String &code, const char *photoStage) {
  addProgress("checking", 0);
  for (size_t i = 0; i < code.length(); i++) addPress(code[i], -1, "checking");
  addWait(CHECK_DISPLAY_MS);
  addPhoto(photoStage);
}

static void handleTopup(long jobId, const char *token, const char *code) {
  String t = token ? token : "";
  String c = code ? code : "";
  String why;
  if (t.length() != 20) return sendResult(jobId, false, "Token dari server tidak 20 digit.");
  for (size_t i = 0; i < t.length(); i++) {
    if (t[i] < '0' || t[i] > '9') return sendResult(jobId, false, "Token dari server berisi karakter bukan angka.");
  }
  if (!validCode(c, why)) return sendResult(jobId, false, why.c_str());

  startJob(jobId, false);
  if (c.length() > 0) planCheck(c, "before");
  for (int i = 0; i < 20; i++) addPress(t[i], i + 1, "pressing");
  addPress('#', 21, "pressing");  // Enter
  addWait(RESULT_DISPLAY_MS);
  addPhoto("after");
  addStep({STEP_RESULT, 0, -1, nullptr, 0});
  Serial.printf("[perintah] #%ld isi token %c%c%c%c **** **** **** %s\n", jobId, t[0], t[1], t[2], t[3],
                t.substring(16).c_str());
}

static void handleCheck(long jobId, const char *code) {
  String c = code ? code : "";
  String why;
  if (c.length() == 0) return sendResult(jobId, false, "Kode cek sisa kWh belum diatur di dashboard.");
  if (!validCode(c, why)) return sendResult(jobId, false, why.c_str());

  startJob(jobId, false);
  planCheck(c, "check");
  addStep({STEP_RESULT, 0, -1, nullptr, 0});
  Serial.printf("[perintah] #%ld cek sisa kWh dengan kode %s\n", jobId, c.c_str());
}

// ===================== Menjalankan langkah =====================
static void runJob() {
  if (!job.active) return;
  if (job.pos >= job.count) return finishJob(true, nullptr);

  Step &s = job.steps[job.pos];
  unsigned long now = millis();

  switch (s.kind) {
    case STEP_PRESS:
      if (job.phase == 0) {
        if (!solenoid::press(s.key)) return finishJob(false, "Solenoid tidak merespons. Cek kabel I2C dan daya MCP23017.");
        job.phase = 1;
        job.phaseAt = now;
      } else if (job.phase == 1 && now - job.phaseAt >= KEY_PRESS_MS) {
        if (!solenoid::release()) return finishJob(false, "Solenoid gagal dilepas. Cek kabel I2C MCP23017.");
        job.phase = 2;
        job.phaseAt = now;
        if (s.report >= 0) sendProgress(s.stage, s.report);
      } else if (job.phase == 2 && now - job.phaseAt >= KEY_GAP_MS) {
        job.phase = 0;
        job.pos++;
      }
      break;

    case STEP_WAIT:
      if (job.phase == 0) {
        job.phase = 1;
        job.phaseAt = now;
      } else if (now - job.phaseAt >= s.ms) {
        job.phase = 0;
        job.pos++;
      }
      break;

    case STEP_PHOTO: {
      job.pos++;
      if (job.local) {
        size_t len = 0;
        char *json = cam::captureJson(0, s.stage, &len);
        free(json);
        break;
      }
      size_t len = 0;
      char *json = cam::captureJson(job.id, s.stage, &len);
      if (json) {
        if (wsOpen) ws.sendTXT((uint8_t *)json, len);
        free(json);
      }
      // Foto gagal tidak membatalkan perintah: token tetap dimasukkan
      break;
    }

    case STEP_PROGRESS:
      sendProgress(s.stage, s.report);
      job.pos++;
      break;

    case STEP_RESULT:
      finishJob(true, nullptr);
      break;
  }
}

// ===================== Pesan dari server =====================
static void handleMessage(uint8_t *payload, size_t length) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[server] Pesan tidak bisa dibaca: %s\n", err.c_str());
    return;
  }
  const char *type = doc["type"] | "";

  if (strcmp(type, "welcome") == 0) {
    authed = true;
    welcomedThisSocket = true;
    authFails = 0;
    authRejected = false;
    lastServerOk = millis();
    checkCode = (const char *)(doc["checkCode"] | "");
    ws.setReconnectInterval(RECONNECT_MS);
    Serial.printf("[server] Tersambung sebagai alat #%ld. Kode cek: %s\n", cfg.deviceId,
                  checkCode.length() ? checkCode.c_str() : "(belum diatur)");
    return;
  }

  if (strcmp(type, "topup") == 0 || strcmp(type, "check") == 0) {
    long jobId = doc["jobId"] | 0L;
    if (job.active) {
      Serial.printf("[server] Perintah #%ld diabaikan: alat sedang bekerja.\n", jobId);
      return;
    }
    if (doc["checkCode"].is<const char *>()) checkCode = doc["checkCode"].as<const char *>();
    if (strcmp(type, "topup") == 0) handleTopup(jobId, doc["token"] | "", checkCode.c_str());
    else handleCheck(jobId, checkCode.c_str());
    return;
  }

  if (strcmp(type, "config") == 0) {
    checkCode = (const char *)(doc["checkCode"] | "");
    Serial.printf("[server] Kode cek diperbarui: %s\n", checkCode.c_str());
    return;
  }

  if (strcmp(type, "error") == 0) {
    const char *code = doc["code"] | "";
    Serial.printf("[server] Error: %s\n", (const char *)(doc["error"] | "tanpa keterangan"));
    if (strcmp(code, "auth") == 0) authRejected = true;
    return;
  }

  if (strcmp(type, "heartbeat_ack") == 0) {
    lastServerOk = millis();
    return;
  }
}

static void onWsEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      wsOpen = true;
      welcomedThisSocket = false;
      Serial.println(F("[server] Koneksi terbuka, mengirim identitas alat..."));
      JsonDocument hello;
      hello["type"] = "hello";
      hello["deviceId"] = cfg.deviceId;
      hello["key"] = cfg.key;
      hello["firmware"] = FIRMWARE_VERSION;
      String out;
      serializeJson(hello, out);
      ws.sendTXT(out);
      break;
    }
    case WStype_DISCONNECTED:
      if (wsOpen) Serial.println(F("[server] Koneksi terputus."));
      if (wsOpen && !welcomedThisSocket) {
        // Koneksi terbuka lalu langsung ditutup tanpa "welcome": ID/kunci kemungkinan ditolak
        authFails++;
      }
      if (authRejected || authFails >= 3) {
        Serial.println(F("[server] ID atau kunci alat ditolak. Periksa di dashboard, lalu isi ulang lewat portal"));
        Serial.println(F("         (tekan tombol RST dua kali) atau ketik \"setup\" di Serial Monitor."));
        ws.setReconnectInterval(AUTH_FAIL_BACKOFF_MS);
      }
      wsOpen = false;
      authed = false;
      abortJob("koneksi ke server terputus");
      break;
    case WStype_TEXT:
      handleMessage(payload, length);
      break;
    case WStype_ERROR:
      Serial.println(F("[server] Error koneksi WebSocket."));
      break;
    default:
      break;
  }
}

// ===================== Koneksi =====================
static void beginServer() {
  if (!cfg.complete()) {
    Serial.println(F("[server] ID alat, kunci, atau alamat server belum diisi. Buka portal: ketik \"setup\"."));
    return;
  }
  Serial.printf("[server] Menyambung ke %s (alat #%ld)\n", cfg.url().c_str(), cfg.deviceId);
  if (cfg.secure) {
#if VERIFY_TLS
    ws.beginSslWithCA(cfg.host.c_str(), cfg.port, "/ws", ROOT_CA, "");
#else
    ws.beginSSL(cfg.host.c_str(), cfg.port, "/ws", "", "");
#endif
  } else {
    ws.begin(cfg.host.c_str(), cfg.port, "/ws", "");
  }
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(RECONNECT_MS);
  ws.enableHeartbeat(15000, 5000, 2);  // putus terdeteksi dalam sekitar 25 detik
  lastServerOk = millis();
}

static void beginOta() {
  String host = "tokenin-" + String(cfg.deviceId);
  ArduinoOTA.setHostname(host.c_str());
  if (cfg.key.length()) ArduinoOTA.setPassword(cfg.key.c_str());  // sandi OTA = kunci alat
  ArduinoOTA.onStart([]() {
    otaRunning = true;
    abortJob("update firmware");
    solenoid::allOff();
    disableLoopWDT();
    Serial.println(F("[ota] Update firmware dimulai..."));
  });
  ArduinoOTA.onEnd([]() { Serial.println(F("[ota] Selesai, restart.")); });
  ArduinoOTA.onError([](ota_error_t e) {
    Serial.printf("[ota] Gagal (kode %u).\n", e);
    otaRunning = false;
    enableLoopWDT();
  });
  ArduinoOTA.begin();
  Serial.printf("[ota] Siap. Di Arduino IDE pilih port jaringan \"%s\".\n", host.c_str());
}

static void setupWatchdog() {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t wdt = {};
  wdt.timeout_ms = WATCHDOG_S * 1000;
  wdt.idle_core_mask = 0;
  wdt.trigger_panic = true;
  if (esp_task_wdt_reconfigure(&wdt) != ESP_OK) esp_task_wdt_init(&wdt);
#else
  esp_task_wdt_init(WATCHDOG_S, true);
#endif
  enableLoopWDT();
}

// Portal dibuka dari Serial atau tombol RST dua kali; alat restart setelahnya
static void openPortalAndRestart() {
  abortJob("membuka portal");
  solenoid::allOff();
  disableLoopWDT();
  ws.disconnect();
  portal::connect(cfg, true);
  ESP.restart();
}

// ===================== LED status =====================
// Kedip cepat: belum ada WiFi. Kedip lambat: menyambung ke server.
// Kedip dua kali: ID/kunci ditolak. Menyala: siap menerima perintah.
static void updateLed() {
  if (PIN_STATUS_LED < 0) return;
  unsigned long t = millis();
  bool on;
  if (WiFi.status() != WL_CONNECTED) on = (t / 150) % 2;
  else if (authRejected || authFails >= 3) on = (t % 1500) < 120 || ((t % 1500) > 300 && (t % 1500) < 420);
  else if (!authed) on = (t / 1000) % 2;
  else on = !job.active || (t / 80) % 2;  // berkedip cepat saat menekan tombol
  digitalWrite(PIN_STATUS_LED, on ? LOW : HIGH);
}

// ===================== Perintah Serial (uji coba) =====================
static void printHelp() {
  Serial.println(F("Perintah Serial Monitor (pilih \"Newline\", 115200 baud):"));
  Serial.println(F("  info        status alat"));
  Serial.println(F("  tekan 5     tekan satu tombol (0-9, * = hapus, # = Enter)"));
  Serial.println(F("  test        tekan semua tombol berurutan untuk mengecek solenoid"));
  Serial.println(F("  foto        coba ambil foto"));
  Serial.println(F("  setup       buka portal pengaturan WiFi dan server"));
  Serial.println(F("  lupakan     hapus WiFi dan pengaturan, lalu restart"));
  Serial.println(F("  restart     restart alat"));
}

static void handleSerial() {
  static String line;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\r') continue;
    if (ch != '\n') {
      if (line.length() < 40) line += ch;
      continue;
    }
    String cmd = line;
    line = "";
    cmd.trim();
    if (cmd.length() == 0) continue;

    if (cmd == "info") {
      Serial.printf("Firmware %s | alat #%ld | server %s\n", FIRMWARE_VERSION, cfg.deviceId, cfg.url().c_str());
      Serial.printf("WiFi: %s (%s, sinyal %d dBm)\n", WiFi.status() == WL_CONNECTED ? "tersambung" : "putus",
                    WiFi.SSID().c_str(), WiFi.RSSI());
      Serial.printf("Server: %s | Solenoid: %s | Kamera: %s | PSRAM: %s\n",
                    authed ? "tersambung" : "belum", solenoid::ready ? "siap" : "TIDAK TERDETEKSI",
                    cam::ok ? "siap" : "GAGAL", psramFound() ? "ada" : "tidak ada");
      Serial.printf("Memori bebas: %u byte, PSRAM bebas: %u byte\n", (unsigned)ESP.getFreeHeap(),
                    (unsigned)ESP.getFreePsram());
    } else if (cmd.startsWith("tekan ")) {
      char key = cmd.length() > 6 ? cmd[6] : 0;
      if (job.active) Serial.println(F("Alat sedang bekerja."));
      else if (!solenoid::isValidKey(key)) Serial.println(F("Tombol tidak dikenal. Pakai 0-9, * atau #."));
      else {
        startJob(-1, true);
        addPress(key, -1, "pressing");
      }
    } else if (cmd == "test") {
      if (job.active) {
        Serial.println(F("Alat sedang bekerja."));
      } else {
        startJob(-1, true);
        static const char order[] = KEYMAP;
        for (int i = 0; order[i]; i++) addPress(order[i], i + 1, "test");
        Serial.println(F("[uji] Menekan semua tombol sesuai urutan KEYMAP..."));
      }
    } else if (cmd == "foto") {
      size_t len = 0;
      char *json = cam::captureJson(0, "check", &len);
      if (!json) Serial.println(F("Foto gagal."));
      free(json);
    } else if (cmd == "setup") {
      openPortalAndRestart();
    } else if (cmd == "lupakan") {
      solenoid::allOff();
      portal::forget();
      Serial.println(F("Pengaturan dihapus. Restart..."));
      delay(500);
      ESP.restart();
    } else if (cmd == "restart") {
      ESP.restart();
    } else {
      printHelp();
    }
  }
}

// ===================== setup & loop =====================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n\nTOKENIN ESP32-CAM firmware %s\n", FIRMWARE_VERSION);

  if (PIN_STATUS_LED >= 0) {
    pinMode(PIN_STATUS_LED, OUTPUT);
    digitalWrite(PIN_STATUS_LED, HIGH);
  }

  // Solenoid dimatikan paling awal
  if (solenoid::begin()) Serial.println(F("[solenoid] MCP23017 siap."));
  else Serial.println(F("[solenoid] MCP23017 TIDAK terdeteksi. Cek SDA=GPIO14, SCL=GPIO13, daya 3.3V, alamat 0x20."));

  if (cam::begin()) Serial.println(F("[kamera] Siap."));

  bool forcePortal = portal::doubleResetDetected();
  if (forcePortal) Serial.println(F("[wifi] Tombol RST ditekan dua kali: membuka portal pengaturan."));

  cfg = portal::load();
  WiFi.setHostname(("tokenin-" + String(cfg.deviceId)).c_str());
  if (!portal::connect(cfg, forcePortal)) {
    Serial.println(F("[wifi] Tidak tersambung. Restart dalam 3 detik..."));
    delay(3000);
    ESP.restart();
  }
  WiFi.setSleep(false);       // respons WebSocket lebih cepat
  WiFi.setAutoReconnect(true);
  Serial.printf("[wifi] Tersambung ke %s, IP %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());

  beginOta();
  beginServer();
  setupWatchdog();
  printHelp();
}

void loop() {
  ArduinoOTA.handle();
  if (otaRunning) return;

  ws.loop();
  solenoid::guard();
  runJob();
  handleSerial();
  updateLed();
  portal::clearResetFlagAfter(5000);

  unsigned long now = millis();

  // Tanda hidup ke server
  if (authed && now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    char buf[64];
    snprintf(buf, sizeof(buf), "{\"type\":\"heartbeat\",\"rssi\":%d}", (int)WiFi.RSSI());
    sendJson(buf);
  }
  if (authed) lastServerOk = now;

  // Pemulihan otomatis
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiLostAt == 0) {
      wifiLostAt = now;
      Serial.println(F("[wifi] Terputus, menyambung ulang..."));
      abortJob("WiFi terputus");
    } else if (now - wifiLostAt > RESTART_NO_WIFI_MS) {
      Serial.println(F("[wifi] Terputus terlalu lama, restart."));
      ESP.restart();
    }
  } else {
    wifiLostAt = 0;
    if (cfg.complete() && now - lastServerOk > RESTART_NO_SERVER_MS) {
      Serial.println(F("[server] Tidak tersambung terlalu lama, restart."));
      ESP.restart();
    }
  }
}
