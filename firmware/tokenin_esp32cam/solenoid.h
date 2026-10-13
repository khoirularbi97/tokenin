#pragma once
// Penggerak 12 solenoid lewat ekspander I2C MCP23017.
// Hanya satu solenoid yang boleh menyala dalam satu waktu.
#include <Arduino.h>
#include <Wire.h>
#include "config.h"

namespace solenoid {

// Register MCP23017 (mode bawaan BANK = 0)
static const uint8_t REG_IODIRA = 0x00;  // arah pin port A, lalu port B di alamat berikutnya
static const uint8_t REG_OLATA = 0x14;   // nilai output port A, lalu port B

static bool ready = false;
static int activePin = -1;        // output yang sedang menyala, -1 = semua mati
static unsigned long onSince = 0;

// Mengubah karakter tombol menjadi nomor output MCP23017 (0-11), -1 kalau tidak ada
static int pinFor(char key) {
  static const char map[] = KEYMAP;
  for (int i = 0; map[i] != '\0'; i++) {
    if (map[i] == key) return i;
  }
  return -1;
}

static bool isValidKey(char key) {
  return pinFor(key) >= 0;
}

// Menulis output port A dan B sekaligus
static bool writeOutputs(uint16_t bits) {
  Wire.beginTransmission(MCP23017_ADDR);
  Wire.write(REG_OLATA);
  Wire.write((uint8_t)(bits & 0xFF));
  Wire.write((uint8_t)(bits >> 8));
  return Wire.endTransmission() == 0;
}

// Reset keras MCP23017: semua pin kembali jadi input, resistor pull-down mematikan semua MOSFET
static void hardReset() {
  if (PIN_MCP_RESET < 0) return;
  digitalWrite(PIN_MCP_RESET, LOW);
  delayMicroseconds(50);
  digitalWrite(PIN_MCP_RESET, HIGH);
  delayMicroseconds(50);
}

static bool configure() {
  // Output diisi 0 dulu, baru pin dijadikan output, supaya tidak ada solenoid yang sempat menekan
  if (!writeOutputs(0)) return false;
  Wire.beginTransmission(MCP23017_ADDR);
  Wire.write(REG_IODIRA);
  Wire.write((uint8_t)0x00);  // GPA0-GPA7 output
  Wire.write((uint8_t)0xF0);  // GPB0-GPB3 output, GPB4-GPB7 input (tidak dipakai)
  return Wire.endTransmission() == 0;
}

static bool begin() {
  if (PIN_MCP_RESET >= 0) {
    pinMode(PIN_MCP_RESET, OUTPUT);
    hardReset();
  }
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 100000);
  ready = configure();
  activePin = -1;
  return ready;
}

// Mematikan semua solenoid. Kalau I2C gagal, MCP23017 di-reset sebagai pengaman terakhir.
static bool allOff() {
  activePin = -1;
  for (int attempt = 0; attempt < 3; attempt++) {
    if (writeOutputs(0)) return true;
    delay(2);
  }
  hardReset();
  ready = configure();
  return ready;
}

// Mulai menekan satu tombol. Panggil release() setelah KEY_PRESS_MS.
static bool press(char key) {
  int pin = pinFor(key);
  if (pin < 0 || !ready) return false;
  if (!writeOutputs((uint16_t)(1u << pin))) {
    allOff();
    return false;
  }
  activePin = pin;
  onSince = millis();
  return true;
}

static bool release() {
  return allOff();
}

// Dipanggil terus di loop(): solenoid yang menyala terlalu lama dipaksa mati
static void guard() {
  if (activePin >= 0 && millis() - onSince > KEY_MAX_ON_MS) {
    Serial.println(F("[solenoid] Pengaman aktif: solenoid menyala terlalu lama, dimatikan."));
    allOff();
  }
}

}  // namespace solenoid
