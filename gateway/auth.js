// Endpoint /auth/* yang ditangani gateway (bagian Policy Engine / Policy Administrator):
// login, refresh, logout, dan token service.
const express = require('express');
const config = require('../shared/config');
const db = require('../shared/db');
const { verifyPassword, sha256, randomToken, safeEqual } = require('../shared/crypto');
const { signAccessToken, signServiceToken } = require('../shared/tokens');
const { catatAkses } = require('./audit');

const router = express.Router();

const cariUser = db.prepare('SELECT * FROM users WHERE username = ?');
const cariUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const deviceTerdaftar = db.prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?');
const simpanRefresh = db.prepare(
  'INSERT INTO refresh_tokens (token_hash, user_id, expires_at, revoked) VALUES (?, ?, ?, 0)'
);
const cariRefresh = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?');
const cabutRefresh = db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?');

// Refresh token valid = ada, belum dicabut, dan belum kedaluwarsa
function refreshValid(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const row = cariRefresh.get(sha256(token));
  if (!row || row.revoked || row.expires_at < Date.now()) return null;
  return row;
}

// POST /auth/login — kredensial valid DAN device terdaftar
router.post('/login', (req, res) => {
  const endpoint = 'POST /auth/login';
  const { username, password } = req.body || {};
  const device = req.get('X-Device-ID');
  const user = typeof username === 'string' ? cariUser.get(username) : undefined;

  if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
    catatAkses({ subjek: { tipe: 'anonim', id: username || '-' }, endpoint, device,
      hasil: 'deny', alasan: 'Username atau password tidak valid' });
    return res.status(401).json({ error: 'Akses ditolak', alasan: 'Username atau password tidak valid' });
  }

  if (!device || !deviceTerdaftar.get(user.id, device)) {
    catatAkses({ subjek: { tipe: 'user', id: user.id }, endpoint, device,
      hasil: 'deny', alasan: 'Device tidak terdaftar untuk user ini' });
    return res.status(403).json({ error: 'Akses ditolak', alasan: 'Device tidak terdaftar untuk user ini' });
  }

  const refreshToken = randomToken();
  simpanRefresh.run(sha256(refreshToken), user.id, Date.now() + config.REFRESH_TOKEN_TTL_MS);
  catatAkses({ subjek: { tipe: 'user', id: user.id }, endpoint, device,
    hasil: 'allow', alasan: 'Kredensial valid dan device terdaftar' });

  res.json({
    access_token: signAccessToken(user),
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 600,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, nim: user.nim },
  });
});

// POST /auth/refresh — terbitkan access token baru dari refresh token yang masih valid
router.post('/refresh', (req, res) => {
  const endpoint = 'POST /auth/refresh';
  const token = (req.body || {}).refresh_token;
  const row = refreshValid(token);
  if (!row) {
    catatAkses({ subjek: { tipe: 'anonim', id: '-' }, endpoint, hasil: 'deny',
      alasan: 'Refresh token tidak valid, sudah dicabut, atau kedaluwarsa' });
    return res.status(401).json({ error: 'Akses ditolak', alasan: 'Refresh token tidak valid, sudah dicabut, atau kedaluwarsa' });
  }
  const user = cariUserById.get(row.user_id);
  catatAkses({ subjek: { tipe: 'user', id: user.id }, endpoint, hasil: 'allow',
    alasan: 'Refresh token valid dan belum dicabut' });
  res.json({ access_token: signAccessToken(user), token_type: 'Bearer', expires_in: 600 });
});

// POST /auth/logout — mencabut refresh token
router.post('/logout', (req, res) => {
  const endpoint = 'POST /auth/logout';
  const token = (req.body || {}).refresh_token;
  const row = refreshValid(token);
  if (!row) {
    catatAkses({ subjek: { tipe: 'anonim', id: '-' }, endpoint, hasil: 'deny',
      alasan: 'Refresh token tidak valid atau sudah dicabut' });
    return res.status(401).json({ error: 'Akses ditolak', alasan: 'Refresh token tidak valid atau sudah dicabut' });
  }
  cabutRefresh.run(sha256(token));
  catatAkses({ subjek: { tipe: 'user', id: row.user_id }, endpoint, hasil: 'allow',
    alasan: 'Refresh token dicabut (logout)' });
  res.json({ message: 'Logout berhasil; refresh token telah dicabut' });
});

// POST /auth/service — client ID & secret Service Nilai -> token service (5 menit)
router.post('/service', (req, res) => {
  const endpoint = 'POST /auth/service';
  const { client_id, client_secret } = req.body || {};
  const secretBenar = Object.prototype.hasOwnProperty.call(config.SERVICE_CLIENTS, client_id)
    ? config.SERVICE_CLIENTS[client_id]
    : null;

  if (!secretBenar || !safeEqual(client_secret, secretBenar)) {
    catatAkses({ subjek: { tipe: 'anonim', id: String(client_id || '-') }, endpoint,
      hasil: 'deny', alasan: 'Client ID atau secret service tidak valid' });
    return res.status(401).json({ error: 'Akses ditolak', alasan: 'Client ID atau secret service tidak valid' });
  }

  catatAkses({ subjek: { tipe: 'service', id: client_id }, endpoint, hasil: 'allow',
    alasan: 'Client ID dan secret valid' });
  res.json({ access_token: signServiceToken(client_id), token_type: 'Bearer', expires_in: 300 });
});

module.exports = router;
