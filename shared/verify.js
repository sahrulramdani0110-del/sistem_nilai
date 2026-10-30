// Verifikasi di sisi SERVICE (dijalankan ulang meski gateway sudah memeriksa).
// Urutan: (1) gateway secret, (2) signature & masa berlaku token, (3) role per endpoint.
const config = require('./config');
const { safeEqual } = require('./crypto');
const { verifyToken } = require('./tokens');

// (1) Tolak request yang tidak lewat gateway, meskipun membawa token valid
function requireGateway(req, res, next) {
  if (!safeEqual(req.get('X-Gateway-Secret'), config.GATEWAY_SECRET)) {
    return res.status(403).json({
      error: 'Akses ditolak',
      alasan: 'Request tidak melalui API gateway (X-Gateway-Secret tidak valid/hilang)',
    });
  }
  next();
}

// (2) Verifikasi ulang access token atau token service yang diteruskan gateway
function requireToken(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Tidak terautentikasi', alasan: 'Access token tidak ada' });
  }
  try {
    const claims = verifyToken(token);
    req.auth = { sub: claims.sub, role: claims.role };
    next();
  } catch (err) {
    const alasan = err.name === 'TokenExpiredError' ? 'Token sudah kedaluwarsa' : 'Token tidak valid';
    res.status(401).json({ error: 'Tidak terautentikasi', alasan });
  }
}

// (3) Pembatasan role di level endpoint service
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({
        error: 'Akses ditolak',
        alasan: `Role '${req.auth.role}' tidak diizinkan`,
      });
    }
    next();
  };
}

module.exports = { requireGateway, requireToken, requireRole };
