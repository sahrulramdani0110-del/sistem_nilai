// API GATEWAY = Policy Enforcement Point (PEP).
// Satu-satunya pintu masuk. Setiap request diperiksa Policy Engine (policy.js),
// keputusannya dicatat ke audit log, lalu request diteruskan ke service dengan
// header X-Gateway-Secret.
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('../shared/config');
const db = require('../shared/db');
const authRouter = require('./auth');
const { evaluate } = require('./policy');
const { catatAkses } = require('./audit');

const app = express();

// /auth/* ditangani gateway sendiri (body JSON hanya di-parse di sini,
// agar body request yang diteruskan ke service tetap utuh)
app.use('/auth', express.json(), authRouter);

// PEP: semua endpoint lain wajib lolos keputusan Policy Engine
app.use((req, res, next) => {
  const keputusan = evaluate({
    method: req.method,
    path: req.path,
    query: req.query,
    authorization: req.get('Authorization'),
    deviceId: req.get('X-Device-ID'),
  });

  catatAkses({
    subjek: keputusan.subject,
    endpoint: `${req.method} ${req.path}`,
    device: req.get('X-Device-ID'),
    hasil: keputusan.allow ? 'allow' : 'deny',
    alasan: keputusan.reason,
  });

  if (!keputusan.allow) {
    return res.status(keputusan.status).json({ error: 'Akses ditolak', alasan: keputusan.reason });
  }
  req.keputusan = keputusan;
  next();
});

// Tambahkan rahasia gateway pada setiap request yang diteruskan ke service
function tambahGatewaySecret(proxyReq) {
  proxyReq.setHeader('X-Gateway-Secret', config.GATEWAY_SECRET);
}
function gagalTeruskan(err, req, res) {
  res.status(502).json({ error: 'Bad Gateway', alasan: `Service tujuan tidak dapat dihubungi (${err.code || err.message})` });
}

const keNilai = createProxyMiddleware({
  target: config.NILAI_URL,
  changeOrigin: true,
  onProxyReq: tambahGatewaySecret,
  onError: gagalTeruskan,
});
const keTranskrip = createProxyMiddleware({
  target: config.TRANSKRIP_URL,
  changeOrigin: true,
  onProxyReq: tambahGatewaySecret,
  onError: gagalTeruskan,
});

app.use((req, res, next) => {
  switch (req.keputusan.target) {
    case 'nilai': return keNilai(req, res, next);
    case 'transkrip': return keTranskrip(req, res, next);
    default: return next();
  }
});

// GET /audit — hanya admin (ditangani gateway)
const bacaAudit = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?');
app.get('/audit', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  res.json(bacaAudit.all(limit));
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: 'Permintaan tidak valid', alasan: err.message });
});

app.listen(config.GATEWAY_PORT, () => {
  console.log(`[GATEWAY] API Gateway (PEP) berjalan di http://localhost:${config.GATEWAY_PORT}`);
});
