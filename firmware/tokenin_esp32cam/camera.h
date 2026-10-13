#pragma once
// Kamera OV2640 di ESP32-CAM AI Thinker: memotret layar meteran
// dan menyusun pesan JSON berisi foto base64 untuk dikirim ke server.
#include <Arduino.h>
#include "esp_camera.h"
#include "mbedtls/base64.h"
#include "config.h"

namespace cam {

static bool ok = false;

static bool begin() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  // Pin kamera AI Thinker (tetap, tidak bisa diubah)
  c.pin_d0 = 5;
  c.pin_d1 = 18;
  c.pin_d2 = 19;
  c.pin_d3 = 21;
  c.pin_d4 = 36;
  c.pin_d5 = 39;
  c.pin_d6 = 34;
  c.pin_d7 = 35;
  c.pin_xclk = 0;
  c.pin_pclk = 22;
  c.pin_vsync = 25;
  c.pin_href = 23;
  c.pin_sccb_sda = 26;
  c.pin_sccb_scl = 27;
  c.pin_pwdn = 32;
  c.pin_reset = -1;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    c.frame_size = CAMERA_FRAME;
    c.jpeg_quality = CAMERA_QUALITY;
    c.fb_count = 2;
    c.fb_location = CAMERA_FB_IN_PSRAM;
    c.grab_mode = CAMERA_GRAB_LATEST;  // selalu ambil gambar terbaru
  } else {
    // Tanpa PSRAM memori sangat terbatas: resolusi diturunkan
    Serial.println(F("[kamera] PSRAM tidak terdeteksi. Foto diturunkan ke 320x240."));
    c.frame_size = FRAMESIZE_QVGA;
    c.jpeg_quality = 15;
    c.fb_count = 1;
    c.fb_location = CAMERA_FB_IN_DRAM;
    c.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  }

  esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) {
    Serial.printf("[kamera] Gagal start (kode 0x%x). Cek kabel pita kamera dan daya 5V.\n", err);
    ok = false;
    return false;
  }

  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    s->set_vflip(s, CAMERA_VFLIP);
    s->set_hmirror(s, CAMERA_HMIRROR);
  }

  if (PIN_FLASH >= 0) {
    pinMode(PIN_FLASH, OUTPUT);
    digitalWrite(PIN_FLASH, LOW);
  }
  ok = true;
  return true;
}

// Mengambil satu frame yang segar (frame lama di buffer dibuang dulu)
static camera_fb_t *grabFresh() {
  if (USE_FLASH && PIN_FLASH >= 0) {
    digitalWrite(PIN_FLASH, HIGH);
    delay(FLASH_WARMUP_MS);
  }
  camera_fb_t *fb = esp_camera_fb_get();
  if (fb) {
    esp_camera_fb_return(fb);
    fb = esp_camera_fb_get();
  }
  if (USE_FLASH && PIN_FLASH >= 0) digitalWrite(PIN_FLASH, LOW);
  return fb;
}

static void *allocBig(size_t size) {
  if (psramFound()) return ps_malloc(size);
  return malloc(size);
}

// Memotret lalu menyusun JSON {"type":"photo","jobId":..,"stage":"..","image":"<base64>"}.
// JSON disusun manual supaya foto tidak tersalin berkali-kali di memori.
// Hasilnya harus di-free() oleh pemanggil. Mengembalikan nullptr kalau gagal.
static char *captureJson(long jobId, const char *stage, size_t *outLen) {
  if (!ok) return nullptr;
  camera_fb_t *fb = grabFresh();
  if (!fb) {
    Serial.println(F("[kamera] Gagal mengambil gambar."));
    return nullptr;
  }

  char prefix[96];
  int prefixLen = snprintf(prefix, sizeof(prefix),
                           "{\"type\":\"photo\",\"jobId\":%ld,\"stage\":\"%s\",\"image\":\"", jobId, stage);
  static const char suffix[] = "\"}";
  size_t b64Len = 4 * ((fb->len + 2) / 3);
  size_t total = prefixLen + b64Len + sizeof(suffix) - 1;

  char *buf = (char *)allocBig(total + 1);
  if (!buf) {
    Serial.printf("[kamera] Memori tidak cukup untuk foto %u byte.\n", (unsigned)fb->len);
    esp_camera_fb_return(fb);
    return nullptr;
  }

  memcpy(buf, prefix, prefixLen);
  size_t written = 0;
  int rc = mbedtls_base64_encode((unsigned char *)buf + prefixLen, b64Len + 1, &written, fb->buf, fb->len);
  size_t jpegLen = fb->len;
  esp_camera_fb_return(fb);  // buffer kamera dikembalikan secepatnya
  if (rc != 0 || written != b64Len) {
    Serial.println(F("[kamera] Gagal mengubah foto ke base64."));
    free(buf);
    return nullptr;
  }
  memcpy(buf + prefixLen + b64Len, suffix, sizeof(suffix));  // termasuk '\0'

  Serial.printf("[kamera] Foto %s: %u byte JPEG, %u byte terkirim.\n", stage, (unsigned)jpegLen, (unsigned)total);
  *outLen = total;
  return buf;
}

}  // namespace cam
