// SERVICE NILAI (port 3001): resource data nilai & kelas.
// Saat finalisasi, memanggil Service Transkrip MELALUI gateway dengan token service.
const express = require('express');
const config = require('../../shared/config');
const db = require('../../shared/db');
const { requireGateway, requireToken, requireRole } = require('../../shared/verify');
const { toHuruf } = require('../../shared/grades');

const app = express();
app.use(express.json());
app.use(requireGateway);   // (1) harus lewat gateway
app.use(requireToken);     // (2) token valid (user atau service)

const daftarNilai = db.prepare(`
  SELECT n.id, n.kelas_id, k.kode AS kode_kelas, k.nama AS nama_kelas,
         n.mahasiswa_id, u.nim, u.name AS nama_mahasiswa,
         n.nilai_angka, n.nilai_huruf, n.final
  FROM nilai n
  JOIN kelas k ON k.id = n.kelas_id
  JOIN users u ON u.id = n.mahasiswa_id
  WHERE ((? = 'dosen' AND k.dosen_id = ?) OR (? = 'mahasiswa' AND n.mahasiswa_id = ?))
    AND (? IS NULL OR n.kelas_id = ?)
  ORDER BY k.kode, u.nim`);

const cariNilai = db.prepare(`
  SELECT n.id, n.final, k.dosen_id
  FROM nilai n JOIN kelas k ON k.id = n.kelas_id
  WHERE n.id = ?`);
const updateNilai = db.prepare('UPDATE nilai SET nilai_angka = ?, nilai_huruf = ?, updated_at = ? WHERE id = ?');

const cariKelas = db.prepare('SELECT id, kode, nama, dosen_id FROM kelas WHERE id = ?');
const nilaiKelas = db.prepare(`
  SELECT n.id, n.nilai_angka, n.nilai_huruf, n.final, u.nim
  FROM nilai n JOIN users u ON u.id = n.mahasiswa_id
  WHERE n.kelas_id = ?`);
const setFinal = db.prepare('UPDATE nilai SET final = ?, updated_at = ? WHERE kelas_id = ?');

// GET /nilai?kelas_id=  — mahasiswa: nilai miliknya; dosen: nilai kelas yang diampu
app.get('/nilai', requireRole('mahasiswa', 'dosen'), (req, res) => {
  const kelasId = typeof req.query.kelas_id === 'string' ? req.query.kelas_id : null;
  const { role, sub } = req.auth;
  res.json(daftarNilai.all(role, sub, role, sub, kelasId, kelasId));
});

// PUT /nilai/:id — dosen mengisi nilai angka (selama belum final)
app.put('/nilai/:id', requireRole('dosen'), (req, res) => {
  const raw = (req.body || {}).nilai_angka;
  const angka = typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(angka) || angka < 0 || angka > 100) {
    return res.status(400).json({ error: 'Validasi gagal', alasan: 'nilai_angka harus angka 0–100' });
  }

  const nilai = cariNilai.get(req.params.id);
  if (!nilai) return res.status(404).json({ error: 'Tidak ditemukan', alasan: 'Nilai tidak ditemukan' });
  if (nilai.dosen_id !== req.auth.sub) {
    return res.status(403).json({ error: 'Akses ditolak', alasan: 'Kelas pada nilai ini tidak diampu oleh dosen ini' });
  }
  if (nilai.final) return res.status(409).json({ error: 'Konflik', alasan: 'Nilai sudah final' });

  const huruf = toHuruf(angka);
  const now = new Date().toISOString();
  updateNilai.run(angka, huruf, now, req.params.id);
  res.json({ id: req.params.id, nilai_angka: angka, nilai_huruf: huruf, final: 0, updated_at: now });
});

// Ambil token service dari gateway (POST /auth/service)
async function ambilTokenService() {
  const resp = await fetch(`${config.GATEWAY_URL}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.SERVICE_NILAI_CLIENT_ID,
      client_secret: config.SERVICE_CLIENTS[config.SERVICE_NILAI_CLIENT_ID],
    }),
  });
  if (!resp.ok) throw new Error(`Gagal memperoleh token service (HTTP ${resp.status})`);
  return (await resp.json()).access_token;
}

// POST /kelas/:id/finalisasi — kunci nilai kelas lalu sinkron ke transkrip
app.post('/kelas/:id/finalisasi', requireRole('dosen'), async (req, res) => {
  const kelas = cariKelas.get(req.params.id);
  if (!kelas) return res.status(404).json({ error: 'Tidak ditemukan', alasan: 'Kelas tidak ditemukan' });
  if (kelas.dosen_id !== req.auth.sub) {
    return res.status(403).json({ error: 'Akses ditolak', alasan: 'Kelas tersebut tidak diampu oleh dosen ini' });
  }

  const rows = nilaiKelas.all(kelas.id);
  if (rows.length === 0) return res.status(400).json({ error: 'Validasi gagal', alasan: 'Kelas belum memiliki data nilai' });
  if (rows.every((r) => r.final)) return res.status(409).json({ error: 'Konflik', alasan: 'Kelas sudah difinalisasi' });
  if (rows.some((r) => r.nilai_angka === null)) {
    return res.status(400).json({ error: 'Validasi gagal', alasan: 'Masih ada mahasiswa yang nilainya belum diisi' });
  }

  setFinal.run(1, new Date().toISOString(), kelas.id);
  try {
    const token = await ambilTokenService();
    const resp = await fetch(`${config.GATEWAY_URL}/transkrip/sinkron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        kelas_id: kelas.id,
        kode_mk: kelas.kode,
        nama_mk: kelas.nama,
        items: rows.map((r) => ({ nim: r.nim, nilai_angka: r.nilai_angka, nilai_huruf: r.nilai_huruf })),
      }),
    });
    if (!resp.ok) throw new Error(`Service Transkrip membalas HTTP ${resp.status}`);
  } catch (err) {
    // Jika sinkron gagal, finalisasi dibatalkan agar dosen bisa mengulang
    setFinal.run(0, new Date().toISOString(), kelas.id);
    return res.status(502).json({ error: 'Bad Gateway', alasan: `Sinkron transkrip gagal; finalisasi dibatalkan. ${err.message}` });
  }

  res.json({
    message: 'Nilai difinalisasi dan disinkronkan ke Service Transkrip',
    kelas: kelas.kode,
    jumlah_mahasiswa: rows.length,
  });
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: 'Permintaan tidak valid', alasan: err.message });
});

app.listen(config.NILAI_PORT, () => {
  console.log(`[NILAI] Service Nilai berjalan di http://localhost:${config.NILAI_PORT}`);
});
