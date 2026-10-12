-- Skema Tokenin. Aman dijalankan berulang: server menjalankannya otomatis saat start.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  id                SERIAL PRIMARY KEY,
  owner_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  meter_number      TEXT NOT NULL DEFAULT '',
  meter_brand       TEXT NOT NULL DEFAULT '',
  power_va          INTEGER,
  check_code        TEXT NOT NULL DEFAULT '',
  device_key_hash   TEXT NOT NULL,
  low_kwh_threshold NUMERIC(10,2) NOT NULL DEFAULT 10,
  last_kwh          NUMERIC(10,2),
  last_kwh_at       TIMESTAMPTZ,
  last_seen         TIMESTAMPTZ,
  firmware          TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devices_owner_idx ON devices(owner_id);

-- Satu baris per perintah: isi token (topup) atau cek sisa kWh (check).
-- Token asli TIDAK disimpan, hanya versi tersamar.
CREATE TABLE IF NOT EXISTS jobs (
  id           SERIAL PRIMARY KEY,
  device_id    INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('topup', 'check')),
  token_masked TEXT,
  status       TEXT NOT NULL CHECK (status IN ('queued', 'checking', 'pressing', 'done', 'failed')),
  progress     INTEGER NOT NULL DEFAULT 0,
  kwh_before   NUMERIC(10,2),
  kwh_after    NUMERIC(10,2),
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jobs_device_idx ON jobs(device_id, id DESC);

-- Foto layar meteran dari ESP32-CAM. Server hanya menyimpan 20 foto terakhir per alat.
CREATE TABLE IF NOT EXISTS photos (
  id         SERIAL PRIMARY KEY,
  device_id  INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  job_id     INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  stage      TEXT NOT NULL DEFAULT 'check',
  image      BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photos_device_idx ON photos(device_id, id DESC);
