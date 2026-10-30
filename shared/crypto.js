// Utilitas kriptografi: hashing password (scrypt), SHA-256, dan perbandingan aman.
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const uji = crypto.scryptSync(password, salt, 64);
  const asli = Buffer.from(hash, 'hex');
  return asli.length === uji.length && crypto.timingSafeEqual(asli, uji);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(48).toString('hex');
}

// Perbandingan string dengan waktu konstan (mencegah timing attack)
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { hashPassword, verifyPassword, sha256, randomToken, safeEqual };
