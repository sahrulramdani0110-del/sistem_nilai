// POLICY ENGINE (PE) di dalam gateway.
// Mengembalikan keputusan allow/deny beserta alasan. Setiap keputusan mengikuti urutan:
//   1. Autentikasi token (signature & masa berlaku)
//   2. Least privilege: role harus termasuk daftar role pada rule (Tabel 3)
//   3. Verifikasi konteks: device terdaftar (khusus user)
//   4. Verifikasi konteks: jam akses (khusus perubahan & finalisasi nilai)
//   5. Kebijakan berbasis kepemilikan data (dibaca dari database)
const db = require('../shared/db');
const config = require('../shared/config');
const { verifyToken } = require('../shared/tokens');

const q = {
  kelasById: db.prepare('SELECT id, dosen_id FROM kelas WHERE id = ?'),
  nilaiById: db.prepare(`
    SELECT n.id, n.final, k.dosen_id
    FROM nilai n JOIN kelas k ON k.id = n.kelas_id
    WHERE n.id = ?`),
  deviceTerdaftar: db.prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?'),
  nimUser: db.prepare('SELECT nim FROM users WHERE id = ?'),
};

const ok = (reason) => ({ allow: true, status: 200, reason });
const tolak = (status, reason) => ({ allow: false, status, reason });

// ---------- Konteks waktu ----------
function menit(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function dalamJamAkses(now = new Date()) {
  const sekarang = now.getHours() * 60 + now.getMinutes();
  return sekarang >= menit(config.JAM_MULAI) && sekarang <= menit(config.JAM_SELESAI);
}

// ---------- Kebijakan berbasis kepemilikan data (Tabel 3) ----------
function cekLihatNilai({ query, subject }) {
  if (subject.role === 'dosen' && typeof query.kelas_id === 'string') {
    const kelas = q.kelasById.get(query.kelas_id);
    if (!kelas) return tolak(404, 'Kelas tidak ditemukan');
    if (kelas.dosen_id !== subject.id) return tolak(403, 'Kelas tersebut tidak diampu oleh dosen ini');
  }
  return ok('Role diizinkan; data dibatasi sesuai kepemilikan');
}

function cekUbahNilai({ params, subject }) {
  const nilai = q.nilaiById.get(params[0]);
  if (!nilai) return tolak(404, 'Nilai tidak ditemukan');
  if (nilai.dosen_id !== subject.id) return tolak(403, 'Kelas pada nilai ini tidak diampu oleh dosen ini');
  if (nilai.final) return tolak(403, 'Nilai sudah final dan tidak dapat diubah');
  return ok('Dosen pengampu kelas, nilai belum final');
}

function cekFinalisasi({ params, subject }) {
  const kelas = q.kelasById.get(params[0]);
  if (!kelas) return tolak(404, 'Kelas tidak ditemukan');
  if (kelas.dosen_id !== subject.id) return tolak(403, 'Kelas tersebut tidak diampu oleh dosen ini');
  return ok('Dosen pengampu kelas');
}

function cekLihatTranskrip({ params, subject }) {
  if (subject.role === 'admin') return ok('Admin dapat melihat transkrip seluruh mahasiswa');
  const me = q.nimUser.get(subject.id);
  if (!me || me.nim !== params[0]) {
    return tolak(403, 'Mahasiswa hanya boleh melihat transkrip NIM miliknya sendiri');
  }
  return ok('NIM milik mahasiswa');
}

// ---------- Tabel aturan (Tabel 3 + endpoint tambahan) ----------
const RULES = [
  { nama: 'GET /nilai', method: 'GET', pola: /^\/nilai$/, target: 'nilai',
    roles: ['mahasiswa', 'dosen'], cek: cekLihatNilai },
  { nama: 'PUT /nilai/:id', method: 'PUT', pola: /^\/nilai\/([^/]+)$/, target: 'nilai',
    roles: ['dosen'], jamAkses: true, cek: cekUbahNilai },
  { nama: 'POST /kelas/:id/finalisasi', method: 'POST', pola: /^\/kelas\/([^/]+)\/finalisasi$/,
    target: 'nilai', roles: ['dosen'], jamAkses: true, cek: cekFinalisasi },
  { nama: 'GET /transkrip/:nim', method: 'GET', pola: /^\/transkrip\/([^/]+)$/, target: 'transkrip',
    roles: ['mahasiswa', 'admin'], cek: cekLihatTranskrip },
  { nama: 'POST /transkrip/sinkron', method: 'POST', pola: /^\/transkrip\/sinkron$/,
    target: 'transkrip', roles: ['service'] },
  { nama: 'GET /audit', method: 'GET', pola: /^\/audit$/, target: 'local', roles: ['admin'] },
];

function evaluate({ method, path, query, authorization, deviceId }) {
  const rule = RULES.find((r) => r.method === method && r.pola.test(path));
  if (!rule) return { ...tolak(404, 'Endpoint tidak dikenal'), subject: null };

  const params = path.match(rule.pola).slice(1);

  // 1. Autentikasi token
  const token = authorization && authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) return { ...tolak(401, 'Header Authorization: Bearer tidak ada'), subject: null };

  let claims;
  try {
    claims = verifyToken(token);
  } catch (err) {
    const alasan = err.name === 'TokenExpiredError' ? 'Access token sudah kedaluwarsa' : 'Access token tidak valid';
    return { ...tolak(401, alasan), subject: null };
  }

  const subject = {
    tipe: claims.role === 'service' ? 'service' : 'user',
    id: claims.sub,
    role: claims.role,
  };
  const deny = (status, reason) => ({ ...tolak(status, reason), subject });

  // 2. Least privilege berdasarkan role
  if (!rule.roles.includes(claims.role)) {
    return deny(403, `Role '${claims.role}' tidak diizinkan mengakses ${rule.nama}`);
  }

  // 3. Device terdaftar (untuk user; panggilan service tidak memakai device)
  if (subject.tipe === 'user') {
    if (!deviceId) return deny(403, 'Header X-Device-ID tidak ada');
    if (!q.deviceTerdaftar.get(subject.id, deviceId)) {
      return deny(403, 'Device tidak terdaftar untuk user ini');
    }
  }

  // 4. Jam akses
  if (rule.jamAkses && !dalamJamAkses()) {
    return deny(403, `Di luar jam akses (${config.JAM_MULAI}–${config.JAM_SELESAI})`);
  }

  // 5. Kepemilikan data
  const hasil = rule.cek ? rule.cek({ params, query, subject }) : ok('Role diizinkan');
  return { ...hasil, subject, target: rule.target };
}

module.exports = { evaluate, dalamJamAkses };
