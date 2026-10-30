// Audit log: setiap keputusan akses dicatat (waktu, subjek, endpoint, device, hasil, alasan).
const db = require('../shared/db');

const simpan = db.prepare(`
  INSERT INTO audit_log (waktu, subjek_tipe, subjek, endpoint, device, hasil, alasan)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function catatAkses({ subjek, endpoint, device, hasil, alasan }) {
  const tipe = subjek ? subjek.tipe : 'anonim';
  const id = subjek ? subjek.id : '-';
  simpan.run(new Date().toISOString(), tipe, id, endpoint, device || '-', hasil, alasan);
  console.log(`[AUDIT] ${hasil.toUpperCase()} | ${tipe}:${id} | ${endpoint} | device=${device || '-'} | ${alasan}`);
}

module.exports = { catatAkses };
