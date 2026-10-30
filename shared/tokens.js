// Penerbitan dan verifikasi JWT (HS256).
const jwt = require('jsonwebtoken');
const config = require('./config');

// Access token user: minimal berisi sub dan role, berlaku 10 menit
function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.ACCESS_TOKEN_TTL,
  });
}

// Token service: role 'service', berlaku 5 menit
function signServiceToken(clientId) {
  return jwt.sign({ sub: clientId, role: 'service' }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.SERVICE_TOKEN_TTL,
  });
}

// Melempar error jika signature salah, format rusak, atau sudah kedaluwarsa
function verifyToken(token) {
  return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
}

module.exports = { signAccessToken, signServiceToken, verifyToken };
