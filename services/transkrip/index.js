// SERVICE TRANSKRIP (port 3002): resource data transkrip mahasiswa.
const express = require('express');
const config = require('../../shared/config');
const db = require('../../shared/db');
const { requireGateway, requireToken, requireRole } = require('../../shared/verify');

const app = express();
app.use(express.json());
app.use(requireGateway);
app.use(requireToken);

const cariNim = db.prepare('SELECT nim FROM users WHERE id = ?');
const transkripNim = db.prepare(
  'SELECT kode_mk, nama_mk, nilai_angka, nilai_huruf, updated_at FROM transkrip WHERE nim = ? ORDER BY kode_mk'
);
const simpanTranskrip = db.prepare(`
  INSERT INTO transkrip (nim, kode_mk, nama_mk, nilai_angka, nilai_huruf, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(nim, kode_mk) DO UPDATE SET
    nama_mk = excluded.nama_mk,
    nilai_angka = excluded.nilai_angka,
    nilai_huruf = excluded.nilai_huruf,
    updated_at = excluded.updated_at`);

// GET /transkrip/:nim — mahasiswa: hanya NIM sendiri; admin: semua NIM
app.get('/transkrip/:nim', requireRole('mahasiswa', 'admin'), (req, res) => {
  if (req.auth.role === 'mahasiswa') {
    const me = cariNim.get(req.auth.sub);
    if (!me || me.nim !== req.params.nim) {
      return res.status(403).json({ error: 'Akses ditolak', alasan: 'Mahasiswa hanya boleh melihat transkrip NIM sendiri' });
    }
  }
  res.json({ nim: req.params.nim, transkrip: transkripNim.all(req.params.nim) });
});

// POST /transkrip/sinkron — hanya token service (dari Service Nilai)
app.post('/transkrip/sinkron', requireRole('service'), (req, res) => {
  const { kelas_id, kode_mk, nama_mk, items } = req.body || {};
  if (!kode_mk || !nama_mk || !Array.isArray(items) || !items.every((i) => i && typeof i.nim === 'string')) {
    return res.status(400).json({ error: 'Validasi gagal', alasan: 'Payload sinkron tidak lengkap' });
  }

  const now = new Date().toISOString();
  db.transaction((daftar) => {
    for (const it of daftar) {
      simpanTranskrip.run(it.nim, kode_mk, nama_mk, it.nilai_angka, it.nilai_huruf, now);
    }
  })(items);

  res.json({ message: 'Sinkron transkrip berhasil', kelas_id: kelas_id || null, kode_mk, jumlah: items.length });
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: 'Permintaan tidak valid', alasan: err.message });
});

app.listen(config.TRANSKRIP_PORT, () => {
  console.log(`[TRANSKRIP] Service Transkrip berjalan di http://localhost:${config.TRANSKRIP_PORT}`);
});
