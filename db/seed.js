// Membuat ulang database dan mengisi data awal:
// 1 admin, 2 dosen, 3 mahasiswa, 2 kelas (dosen berbeda), 1 device per user.
// Jalankan: npm run seed   (hentikan service dahulu sebelum seed)
const fs = require('fs');
const config = require('../shared/config');

for (const file of [config.DB_PATH, `${config.DB_PATH}-wal`, `${config.DB_PATH}-shm`]) {
  if (fs.existsSync(file)) fs.rmSync(file);
}

const db = require('../shared/db');
const { hashPassword } = require('../shared/crypto');

// id, username, password, nama, role, nim, device_id
const users = [
  ['admin-1', 'admin', 'admin123', 'Administrator Akademik', 'admin', null, 'DEV-ADM-001'],
  ['dosen-1', 'dosen1', 'dosen123', 'Dr. Budi Santoso', 'dosen', null, 'DEV-DSN-001'],
  ['dosen-2', 'dosen2', 'dosen123', 'Dr. Sari Lestari', 'dosen', null, 'DEV-DSN-002'],
  ['mhs-1', 'mhs1', 'mhs123', 'Ani Rahayu', 'mahasiswa', '2110001', 'DEV-MHS-001'],
  ['mhs-2', 'mhs2', 'mhs123', 'Budi Pratama', 'mahasiswa', '2110002', 'DEV-MHS-002'],
  ['mhs-3', 'mhs3', 'mhs123', 'Citra Dewi', 'mahasiswa', '2110003', 'DEV-MHS-003'],
];
// id, kode, nama, dosen_id
const kelas = [
  ['KLS-1', 'IF301', 'Keamanan Informasi', 'dosen-1'],
  ['KLS-2', 'IF302', 'Pemrograman Web', 'dosen-2'],
];
// kelas_id, mahasiswa_id
const enrollment = [['KLS-1', 'mhs-1'], ['KLS-1', 'mhs-2'], ['KLS-2', 'mhs-2'], ['KLS-2', 'mhs-3']];
// id nilai, kelas_id, mahasiswa_id (nilai awal kosong: harus diisi dosen)
const nilai = [
  ['N-001', 'KLS-1', 'mhs-1'],
  ['N-002', 'KLS-1', 'mhs-2'],
  ['N-003', 'KLS-2', 'mhs-2'],
  ['N-004', 'KLS-2', 'mhs-3'],
];

db.transaction(() => {
  for (const [id, username, password, name, role, nim, device] of users) {
    db.prepare('INSERT INTO users (id, username, password_hash, name, role, nim) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, username, hashPassword(password), name, role, nim);
    db.prepare('INSERT INTO devices (user_id, device_id) VALUES (?, ?)').run(id, device);
  }
  for (const k of kelas) db.prepare('INSERT INTO kelas (id, kode, nama, dosen_id) VALUES (?, ?, ?, ?)').run(...k);
  for (const e of enrollment) db.prepare('INSERT INTO enrollment (kelas_id, mahasiswa_id) VALUES (?, ?)').run(...e);
  for (const [id, kelasId, mhsId] of nilai) {
    db.prepare('INSERT INTO nilai (id, kelas_id, mahasiswa_id, nilai_angka, nilai_huruf, final) VALUES (?, ?, ?, NULL, NULL, 0)')
      .run(id, kelasId, mhsId);
  }
})();

console.log('\nDatabase berhasil di-seed di:', config.DB_PATH);
console.log('\n=== DAFTAR AKUN & DEVICE ID ===');
console.table(users.map(([, username, password, name, role, nim, device]) => ({
  username, password, nama: name, role, nim: nim || '-', device_id: device,
})));
console.log('Client service: service-nilai / ' + config.SERVICE_CLIENTS['service-nilai']);
