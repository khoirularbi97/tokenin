#pragma once
// Pengaturan alat (server, ID, kunci) yang tersimpan di memori flash,
// dan portal WiFi untuk mengisinya dari HP tanpa upload ulang.
#include <Arduino.h>
#include <WiFi.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include "config.h"

struct Settings {
  String host;
  uint16_t port = 443;
  bool secure = true;
  long deviceId = 0;
  String key;

  bool complete() const {
    return host.length() > 0 && deviceId > 0 && key.length() > 0;
  }

  // Bentuk yang ditampilkan di portal, contoh https://tokenin-api.onrender.com
  String url() const {
    String u = secure ? "https://" : "http://";
    u += host;
    if (port != (secure ? 443 : 80)) u += ":" + String(port);
    return u;
  }
};

namespace portal {

static const char *NS = "tokenin";

// Menerima "https://host", "http://host:3000", atau "host" saja (dianggap https)
static bool parseServer(String input, Settings &out) {
  input.trim();
  if (input.length() == 0) return false;
  bool secure = true;
  if (input.startsWith("https://")) {
    input.remove(0, 8);
  } else if (input.startsWith("http://")) {
    secure = false;
    input.remove(0, 7);
  }
  while (input.endsWith("/")) input.remove(input.length() - 1);
  if (input.indexOf('/') >= 0 || input.indexOf(' ') >= 0) return false;  // tanpa /api, tanpa spasi

  uint16_t port = secure ? 443 : 80;
  int colon = input.indexOf(':');
  if (colon >= 0) {
    long p = input.substring(colon + 1).toInt();
    if (p <= 0 || p > 65535) return false;
    port = (uint16_t)p;
    input = input.substring(0, colon);
  }
  if (input.length() == 0) return false;
  out.host = input;
  out.port = port;
  out.secure = secure;
  return true;
}

static Settings load() {
  Settings s;
  s.host = TOKENIN_HOST;
  s.port = TOKENIN_PORT;
  s.secure = TOKENIN_SECURE;
  s.deviceId = TOKENIN_DEVICE_ID;
  s.key = TOKENIN_DEVICE_KEY;

  Preferences p;
  if (p.begin(NS, true)) {
    if (p.isKey("host")) {
      s.host = p.getString("host", s.host);
      s.port = p.getUShort("port", s.port);
      s.secure = p.getBool("secure", s.secure);
    }
    if (p.isKey("id")) s.deviceId = p.getLong("id", s.deviceId);
    if (p.isKey("key")) s.key = p.getString("key", s.key);
    p.end();
  }
  return s;
}

static void save(const Settings &s) {
  Preferences p;
  p.begin(NS, false);
  p.putString("host", s.host);
  p.putUShort("port", s.port);
  p.putBool("secure", s.secure);
  p.putLong("id", s.deviceId);
  p.putString("key", s.key);
  p.end();
}

static void forget() {
  Preferences p;
  p.begin(NS, false);
  p.clear();
  p.end();
  WiFiManager wm;
  wm.resetSettings();
}

// ---- Deteksi tekan RST dua kali (dalam 5 detik) untuk membuka portal ----
static bool resetFlagCleared = false;

static bool doubleResetDetected() {
  Preferences p;
  p.begin(NS, false);
  bool detected = p.getBool("rst2", false);
  p.putBool("rst2", true);
  p.end();
  return detected;
}

// Dipanggil di loop(): setelah 5 detik menyala normal, tanda reset dihapus
static void clearResetFlagAfter(unsigned long ms) {
  if (resetFlagCleared || millis() < ms) return;
  Preferences p;
  p.begin(NS, false);
  p.putBool("rst2", false);
  p.end();
  resetFlagCleared = true;
}

static String apName() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char name[24];
  snprintf(name, sizeof(name), "Tokenin-Setup-%02X%02X", mac[4], mac[5]);
  return String(name);
}

// Menyambung ke WiFi. Portal dibuka kalau dipaksa, WiFi belum diatur,
// atau WiFi tersimpan gagal tersambung. Mengembalikan true kalau WiFi tersambung.
static bool connect(Settings &s, bool force) {
  WiFi.mode(WIFI_STA);

  String idText = s.deviceId > 0 ? String(s.deviceId) : String("");
  String urlText = s.url();
  WiFiManagerParameter pServer("server", "Alamat server Tokenin", urlText.c_str(), 100);
  WiFiManagerParameter pId("devid", "ID alat", idText.c_str(), 10);
  WiFiManagerParameter pKey("devkey", "Kunci alat", s.key.c_str(), 64);

  WiFiManager wm;
  wm.setTitle("Tokenin");
  wm.setConfigPortalTimeout(PORTAL_TIMEOUT_S);
  wm.setConnectTimeout(30);
  wm.setConnectRetries(3);
  wm.setBreakAfterConfig(true);  // simpan isian walau WiFi belum tersambung
  wm.addParameter(&pServer);
  wm.addParameter(&pId);
  wm.addParameter(&pKey);
  std::vector<const char *> menu = {"wifi", "info", "exit"};
  wm.setMenu(menu);

  String ap = apName();
  bool needPortal = force || !s.complete();
  if (needPortal) {
    Serial.printf("[wifi] Portal pengaturan dibuka. Sambungkan HP ke WiFi \"%s\" (sandi %s)\n", ap.c_str(),
                  PORTAL_PASSWORD);
  }
  bool connected = needPortal ? wm.startConfigPortal(ap.c_str(), PORTAL_PASSWORD)
                              : wm.autoConnect(ap.c_str(), PORTAL_PASSWORD);

  // Simpan isian portal kalau valid dan berbeda
  Settings next = s;
  bool changed = false;
  Settings parsed = s;
  if (parseServer(String(pServer.getValue()), parsed)) {
    if (parsed.host != s.host || parsed.port != s.port || parsed.secure != s.secure) {
      next.host = parsed.host;
      next.port = parsed.port;
      next.secure = parsed.secure;
      changed = true;
    }
  } else if (strlen(pServer.getValue()) > 0) {
    Serial.println(F("[wifi] Alamat server tidak valid, isian lama tetap dipakai."));
  }
  long id = String(pId.getValue()).toInt();
  if (id > 0 && id != s.deviceId) {
    next.deviceId = id;
    changed = true;
  }
  String key = String(pKey.getValue());
  key.trim();
  if (key.length() > 0 && key != s.key) {
    next.key = key;
    changed = true;
  }
  if (changed) {
    save(next);
    s = next;
    Serial.println(F("[wifi] Pengaturan alat disimpan."));
  }
  return connected && WiFi.status() == WL_CONNECTED;
}

}  // namespace portal
