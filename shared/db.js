// Koneksi SQLite (satu database bersama untuk gateway, Service Nilai, dan Service Transkrip).
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('mahasiswa', 'dosen', 'admin')),
    nim TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS devices (
    user_id TEXT NOT NULL REFERENCES users(id),
    device_id TEXT NOT NULL,
    PRIMARY KEY (user_id, device_id)
  );

  CREATE TABLE IF NOT EXISTS kelas (
    id TEXT PRIMARY KEY,
    kode TEXT UNIQUE NOT NULL,
    nama TEXT NOT NULL,
    dosen_id TEXT NOT NULL REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS enrollment (
    kelas_id TEXT NOT NULL REFERENCES kelas(id),
    mahasiswa_id TEXT NOT NULL REFERENCES users(id),
    PRIMARY KEY (kelas_id, mahasiswa_id)
  );

  CREATE TABLE IF NOT EXISTS nilai (
    id TEXT PRIMARY KEY,
    kelas_id TEXT NOT NULL REFERENCES kelas(id),
    mahasiswa_id TEXT NOT NULL REFERENCES users(id),
    nilai_angka REAL,
    nilai_huruf TEXT,
    final INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT,
    UNIQUE (kelas_id, mahasiswa_id)
  );

  CREATE TABLE IF NOT EXISTS transkrip (
    nim TEXT NOT NULL,
    kode_mk TEXT NOT NULL,
    nama_mk TEXT NOT NULL,
    nilai_angka REAL NOT NULL,
    nilai_huruf TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (nim, kode_mk)
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    waktu TEXT NOT NULL,
    subjek_tipe TEXT NOT NULL,
    subjek TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    device TEXT,
    hasil TEXT NOT NULL,
    alasan TEXT NOT NULL
  );
`);

module.exports = db;
