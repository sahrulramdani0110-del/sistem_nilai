// Konfigurasi terpusat. Semua nilai bisa di-override lewat environment variable.
const path = require('path');

module.exports = {
  // Port & alamat
  GATEWAY_PORT: Number(process.env.GATEWAY_PORT || 3000),
  NILAI_PORT: Number(process.env.NILAI_PORT || 3001),
  TRANSKRIP_PORT: Number(process.env.TRANSKRIP_PORT || 3002),
  GATEWAY_URL: process.env.GATEWAY_URL || 'http://localhost:3000',
  NILAI_URL: process.env.NILAI_URL || 'http://localhost:3001',
  TRANSKRIP_URL: process.env.TRANSKRIP_URL || 'http://localhost:3002',

  // Rahasia (WAJIB diganti untuk produksi)
  JWT_SECRET: process.env.JWT_SECRET || 'ganti-jwt-secret-dev',
  GATEWAY_SECRET: process.env.GATEWAY_SECRET || 'ganti-gateway-secret-dev',

  // Masa berlaku token (sesuai spesifikasi 4.1)
  ACCESS_TOKEN_TTL: '10m',
  SERVICE_TOKEN_TTL: '5m',
  REFRESH_TOKEN_TTL_MS: 24 * 60 * 60 * 1000, // 1 hari

  // Client service yang boleh meminta token service (POST /auth/service)
  SERVICE_NILAI_CLIENT_ID: 'service-nilai',
  SERVICE_CLIENTS: {
    'service-nilai': process.env.SERVICE_NILAI_SECRET || 'secret-service-nilai-dev',
  },

  // Jam akses perubahan & finalisasi nilai (format HH:MM, batas inklusif)
  JAM_MULAI: process.env.JAM_MULAI || '07:00',
  JAM_SELESAI: process.env.JAM_SELESAI || '21:00',

  // Lokasi database SQLite bersama
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'sistem_nilai.db'),
};
