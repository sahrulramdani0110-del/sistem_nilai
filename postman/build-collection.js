// Membuat koleksi & environment Postman (v2.1) secara otomatis.
// Jalankan: npm run postman:build
const fs = require('fs');
const path = require('path');

const U = (p) => `{{baseUrl}}${p}`;

// ---------- helper ----------
function assert(nama, kode) {
  return `pm.test(${JSON.stringify(nama)}, function () {\n  ${kode}\n});`;
}

function tes({ status, simpan = {}, cek = [] }) {
  const baris = [];
  if (status) baris.push(`pm.test("Status ${status}", function () { pm.response.to.have.status(${status}); });`);
  for (const [variabel, field] of Object.entries(simpan)) {
    baris.push(`pm.environment.set("${variabel}", pm.response.json().${field});`);
  }
  baris.push(...cek);
  return baris.join('\n');
}

function req(nama, o = {}) {
  const header = [];
  if (o.body !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
  if (o.auth) header.push({ key: 'Authorization', value: o.auth });
  else if (o.token) header.push({ key: 'Authorization', value: `Bearer {{${o.token}}}` });
  if (o.device) header.push({ key: 'X-Device-ID', value: o.device });
  if (o.gatewaySecret) header.push({ key: 'X-Gateway-Secret', value: '{{gatewaySecret}}' });
  const request = { method: o.method || 'GET', header, url: o.url };
  if (o.body !== undefined) {
    request.body = { mode: 'raw', raw: JSON.stringify(o.body, null, 2), options: { raw: { language: 'json' } } };
  }
  return {
    name: nama,
    request,
    event: o.test ? [{ listen: 'test', script: { type: 'text/javascript', exec: o.test.split('\n') } }] : [],
  };
}

const login = (nama, username, password, device, simpan, status = 200) =>
  req(nama, {
    method: 'POST', url: U('/auth/login'), device,
    body: { username, password },
    test: tes({ status, simpan }),
  });

const DEV = {
  admin: '{{deviceAdmin}}', dosen1: '{{deviceDosen1}}', dosen2: '{{deviceDosen2}}',
  mhs1: '{{deviceMhs1}}', mhs2: '{{deviceMhs2}}', mhs3: '{{deviceMhs3}}',
};

// ---------- folder ----------
const folders = [
  { name: '1. Login semua role (menerbitkan token)', item: [
    login('Login admin', 'admin', 'admin123', DEV.admin, { tokenAdmin: 'access_token' }),
    login('Login dosen1 (pengampu IF301)', 'dosen1', 'dosen123', DEV.dosen1, { tokenDosen1: 'access_token' }),
    login('Login dosen2 (pengampu IF302)', 'dosen2', 'dosen123', DEV.dosen2, { tokenDosen2: 'access_token' }),
    login('Login mhs1', 'mhs1', 'mhs123', DEV.mhs1, { tokenMhs1: 'access_token', refreshMhs1: 'refresh_token' }),
    login('Login mhs2', 'mhs2', 'mhs123', DEV.mhs2, { tokenMhs2: 'access_token' }),
    login('Login mhs3', 'mhs3', 'mhs123', DEV.mhs3, { tokenMhs3: 'access_token', refreshMhs3: 'refresh_token' }),
  ]},

  { name: '2. Autentikasi & verifikasi konteks (4.1 & 4.3)', item: [
    login('Login password salah -> 401', 'dosen1', 'salah', DEV.dosen1, {}, 401),
    login('Login dengan device milik user lain -> 403', 'dosen1', 'dosen123', DEV.mhs1, {}, 403),
    req('Login tanpa header X-Device-ID -> 403', {
      method: 'POST', url: U('/auth/login'), body: { username: 'mhs1', password: 'mhs123' },
      test: tes({ status: 403 }),
    }),
    req('Request tanpa token -> 401', {
      url: U('/nilai'), test: tes({ status: 401 }),
    }),
    req('Token dimodifikasi (signature rusak) -> 401', {
      url: U('/nilai'), auth: 'Bearer {{tokenMhs1}}rusak', device: DEV.mhs1, test: tes({ status: 401 }),
    }),
    req('Token valid tanpa X-Device-ID -> 403', {
      url: U('/nilai'), token: 'tokenMhs1', test: tes({ status: 403 }),
    }),
    req('Token valid dengan device milik user lain -> 403', {
      url: U('/nilai'), token: 'tokenMhs1', device: DEV.mhs2, test: tes({ status: 403 }),
    }),
    req('Refresh token valid -> access token baru (200)', {
      method: 'POST', url: U('/auth/refresh'), body: { refresh_token: '{{refreshMhs1}}' },
      test: tes({ status: 200, cek: [assert('Mengembalikan access_token', 'pm.expect(pm.response.json().access_token).to.be.a("string");')] }),
    }),
    req('Logout mhs3 (cabut refresh token) -> 200', {
      method: 'POST', url: U('/auth/logout'), body: { refresh_token: '{{refreshMhs3}}' },
      test: tes({ status: 200 }),
    }),
    req('Refresh setelah logout -> 401', {
      method: 'POST', url: U('/auth/refresh'), body: { refresh_token: '{{refreshMhs3}}' },
      test: tes({ status: 401 }),
    }),
    req('Login service dengan secret salah -> 401', {
      method: 'POST', url: U('/auth/service'),
      body: { client_id: 'service-nilai', client_secret: 'salah' }, test: tes({ status: 401 }),
    }),
    req('Login service (token 5 menit, role service) -> 200', {
      method: 'POST', url: U('/auth/service'),
      body: { client_id: 'service-nilai', client_secret: '{{serviceSecret}}' },
      test: tes({ status: 200, simpan: { tokenService: 'access_token' } }),
    }),
  ]},

  { name: '3. Least privilege & kepemilikan data: nilai (Tabel 3)', item: [
    req('Mahasiswa GET /nilai -> hanya nilai miliknya', {
      url: U('/nilai'), token: 'tokenMhs1', device: DEV.mhs1,
      test: tes({ status: 200, cek: [assert('Hanya 1 baris milik NIM 2110001',
        'const r = pm.response.json(); pm.expect(r.length).to.eql(1); pm.expect(r[0].nim).to.eql("2110001");')] }),
    }),
    req('Dosen1 GET /nilai?kelas_id=KLS-1 (kelas diampu) -> 200', {
      url: U('/nilai?kelas_id=KLS-1'), token: 'tokenDosen1', device: DEV.dosen1,
      test: tes({ status: 200, cek: [assert('Dua mahasiswa di IF301',
        'const r = pm.response.json(); pm.expect(r.length).to.eql(2); r.forEach(x => pm.expect(x.kode_kelas).to.eql("IF301"));')] }),
    }),
    req('Dosen1 GET /nilai?kelas_id=KLS-2 (bukan diampu) -> 403', {
      url: U('/nilai?kelas_id=KLS-2'), token: 'tokenDosen1', device: DEV.dosen1, test: tes({ status: 403 }),
    }),
    req('Dosen1 GET /nilai tanpa filter -> hanya kelas diampu', {
      url: U('/nilai'), token: 'tokenDosen1', device: DEV.dosen1,
      test: tes({ status: 200, cek: [assert('Semua baris berasal dari IF301',
        'const r = pm.response.json(); pm.expect(r.length).to.eql(2); r.forEach(x => pm.expect(x.kode_kelas).to.eql("IF301"));')] }),
    }),
    req('Admin GET /nilai -> 403 (role tidak diizinkan)', {
      url: U('/nilai'), token: 'tokenAdmin', device: DEV.admin, test: tes({ status: 403 }),
    }),
    req('Token service GET /nilai -> 403', {
      url: U('/nilai'), token: 'tokenService', test: tes({ status: 403 }),
    }),
    req('Mahasiswa PUT /nilai/N-001 -> 403', {
      method: 'PUT', url: U('/nilai/N-001'), token: 'tokenMhs1', device: DEV.mhs1,
      body: { nilai_angka: 90 }, test: tes({ status: 403 }),
    }),
    req('Dosen2 PUT /nilai/N-001 (kelas milik dosen1) -> 403', {
      method: 'PUT', url: U('/nilai/N-001'), token: 'tokenDosen2', device: DEV.dosen2,
      body: { nilai_angka: 90 }, test: tes({ status: 403 }),
    }),
    req('Dosen1 PUT /nilai/N-003 (kelas IF302 milik dosen2) -> 403', {
      method: 'PUT', url: U('/nilai/N-003'), token: 'tokenDosen1', device: DEV.dosen1,
      body: { nilai_angka: 90 }, test: tes({ status: 403 }),
    }),
    req('Dosen1 PUT /nilai/N-999 (tidak ada) -> 404', {
      method: 'PUT', url: U('/nilai/N-999'), token: 'tokenDosen1', device: DEV.dosen1,
      body: { nilai_angka: 90 }, test: tes({ status: 404 }),
    }),
    req('Dosen1 PUT nilai 101 (validasi) -> 400', {
      method: 'PUT', url: U('/nilai/N-001'), token: 'tokenDosen1', device: DEV.dosen1,
      body: { nilai_angka: 101 }, test: tes({ status: 400 }),
    }),
    req('Dosen1 PUT /nilai/N-001 = 88 -> 200, huruf A', {
      method: 'PUT', url: U('/nilai/N-001'), token: 'tokenDosen1', device: DEV.dosen1,
      body: { nilai_angka: 88 },
      test: tes({ status: 200, cek: [assert('Nilai huruf = A', 'pm.expect(pm.response.json().nilai_huruf).to.eql("A");')] }),
    }),
    req('Dosen1 PUT /nilai/N-002 = 72 -> 200, huruf B', {
      method: 'PUT', url: U('/nilai/N-002'), token: 'tokenDosen1', device: DEV.dosen1,
      body: { nilai_angka: 72 },
      test: tes({ status: 200, cek: [assert('Nilai huruf = B', 'pm.expect(pm.response.json().nilai_huruf).to.eql("B");')] }),
    }),
    req('Dosen2 PUT /nilai/N-003 = 80 -> 200', {
      method: 'PUT', url: U('/nilai/N-003'), token: 'tokenDosen2', device: DEV.dosen2,
      body: { nilai_angka: 80 }, test: tes({ status: 200 }),
    }),
    req('Dosen2 PUT /nilai/N-004 = 90 -> 200', {
      method: 'PUT', url: U('/nilai/N-004'), token: 'tokenDosen2', device: DEV.dosen2,
      body: { nilai_angka: 90 }, test: tes({ status: 200 }),
    }),
  ]},

  { name: '4. Finalisasi & sinkron ke transkrip (4.2)', item: [
    req('Mahasiswa finalisasi KLS-1 -> 403', {
      method: 'POST', url: U('/kelas/KLS-1/finalisasi'), token: 'tokenMhs1', device: DEV.mhs1, test: tes({ status: 403 }),
    }),
    req('Dosen2 finalisasi KLS-1 (bukan pengampu) -> 403', {
      method: 'POST', url: U('/kelas/KLS-1/finalisasi'), token: 'tokenDosen2', device: DEV.dosen2, test: tes({ status: 403 }),
    }),
    req('Token user ditolak di POST /transkrip/sinkron -> 403', {
      method: 'POST', url: U('/transkrip/sinkron'), token: 'tokenDosen1', device: DEV.dosen1,
      body: { kode_mk: 'IF301', nama_mk: 'x', items: [{ nim: '2110001', nilai_angka: 100, nilai_huruf: 'A' }] },
      test: tes({ status: 403 }),
    }),
    req('Dosen1 finalisasi KLS-1 -> 200 & sinkron ke transkrip', {
      method: 'POST', url: U('/kelas/KLS-1/finalisasi'), token: 'tokenDosen1', device: DEV.dosen1,
      test: tes({ status: 200, cek: [assert('Dua mahasiswa difinalisasi',
        'pm.expect(pm.response.json().jumlah_mahasiswa).to.eql(2);')] }),
    }),
    req('Finalisasi KLS-1 kedua kali -> 409', {
      method: 'POST', url: U('/kelas/KLS-1/finalisasi'), token: 'tokenDosen1', device: DEV.dosen1, test: tes({ status: 409 }),
    }),
    req('Ubah nilai setelah final -> 403', {
      method: 'PUT', url: U('/nilai/N-001'), token: 'tokenDosen1', device: DEV.dosen1,
      body: { nilai_angka: 70 },
      test: tes({ status: 403, cek: [assert('Alasan menyebut final', 'pm.expect(pm.response.json().alasan).to.include("final");')] }),
    }),
    req('Dosen2 finalisasi KLS-2 -> 200', {
      method: 'POST', url: U('/kelas/KLS-2/finalisasi'), token: 'tokenDosen2', device: DEV.dosen2,
      test: tes({ status: 200 }),
    }),
  ]},

  { name: '5. Transkrip (mahasiswa hanya NIM sendiri, admin semua)', item: [
    req('Mahasiswa mhs1 GET transkrip NIM sendiri -> 200', {
      url: U('/transkrip/2110001'), token: 'tokenMhs1', device: DEV.mhs1,
      test: tes({ status: 200, cek: [assert('Berisi IF301 dengan huruf A',
        'const t = pm.response.json().transkrip; pm.expect(t.length).to.eql(1); pm.expect(t[0].kode_mk).to.eql("IF301"); pm.expect(t[0].nilai_huruf).to.eql("A");')] }),
    }),
    req('Mahasiswa mhs1 GET transkrip NIM lain -> 403', {
      url: U('/transkrip/2110002'), token: 'tokenMhs1', device: DEV.mhs1, test: tes({ status: 403 }),
    }),
    req('Admin GET transkrip mhs2 -> 200 (dua mata kuliah)', {
      url: U('/transkrip/2110002'), token: 'tokenAdmin', device: DEV.admin,
      test: tes({ status: 200, cek: [assert('Dua baris transkrip',
        'pm.expect(pm.response.json().transkrip.length).to.eql(2);')] }),
    }),
    req('Admin GET transkrip mhs3 -> 200 (hasil sinkron KLS-2)', {
      url: U('/transkrip/2110003'), token: 'tokenAdmin', device: DEV.admin,
      test: tes({ status: 200, cek: [assert('IF302 huruf A (nilai 90)',
        'const t = pm.response.json().transkrip; pm.expect(t[0].kode_mk).to.eql("IF302"); pm.expect(t[0].nilai_huruf).to.eql("A");')] }),
    }),
    req('Dosen1 GET transkrip mahasiswa -> 403', {
      url: U('/transkrip/2110001'), token: 'tokenDosen1', device: DEV.dosen1, test: tes({ status: 403 }),
    }),
    req('Token service GET transkrip -> 403', {
      url: U('/transkrip/2110001'), token: 'tokenService', test: tes({ status: 403 }),
    }),
  ]},

  { name: '6. Service tidak bisa diakses langsung (X-Gateway-Secret, 4.1)', item: [
    req('Akses langsung Service Nilai tanpa gateway secret (token valid) -> 403', {
      url: '{{nilaiUrl}}/nilai', token: 'tokenDosen1', test: tes({ status: 403 }),
    }),
    req('Akses langsung Service Transkrip tanpa gateway secret (token admin) -> 403', {
      url: '{{transkripUrl}}/transkrip/2110001', token: 'tokenAdmin', test: tes({ status: 403 }),
    }),
    req('Gateway secret benar tetapi tanpa token -> 401', {
      url: '{{nilaiUrl}}/nilai', gatewaySecret: true, test: tes({ status: 401 }),
    }),
    req('Gateway secret + token valid -> 200 (hanya jalur gateway yang lolos)', {
      url: '{{nilaiUrl}}/nilai', token: 'tokenDosen1', gatewaySecret: true,
      test: tes({ status: 200 }),
    }),
  ]},

  { name: '7. Audit log (4.4)', item: [
    req('Admin GET /audit -> 200 berisi allow & deny', {
      url: U('/audit?limit=500'), token: 'tokenAdmin', device: DEV.admin,
      test: tes({ status: 200, cek: [
        assert('Ada catatan allow dan deny', 'const r = pm.response.json(); pm.expect(r.some(x => x.hasil === "allow")).to.be.true; pm.expect(r.some(x => x.hasil === "deny")).to.be.true;'),
        assert('Setiap catatan punya field wajib', 'const r = pm.response.json(); pm.expect(r[0]).to.have.all.keys("id","waktu","subjek_tipe","subjek","endpoint","device","hasil","alasan");'),
      ] }),
    }),
    req('Dosen1 GET /audit -> 403', {
      url: U('/audit'), token: 'tokenDosen1', device: DEV.dosen1, test: tes({ status: 403 }),
    }),
  ]},
];

const collection = {
  info: {
    _postman_id: '6f1c2a7e-0000-4000-8000-zerotrust0001',
    name: 'Zero Trust – Sistem Nilai',
    description: 'Pengujian kontrol akses Zero Trust. Jalankan setelah `npm run seed` dan start semua service. Lihat README untuk catatan jam akses.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: folders,
};

// Koleksi terpisah: uji jam akses (jalankan dengan JAM_MULAI/JAM_SELESAI di luar jam sekarang)
const jamAkses = {
  info: {
    _postman_id: '6f1c2a7e-0000-4000-8000-zerotrust0002',
    name: 'Zero Trust – Uji Jam Akses',
    description: 'Jalankan gateway dengan JAM_MULAI/JAM_SELESAI yang TIDAK mencakup jam saat ini, lalu jalankan koleksi ini.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [{ name: 'Jam akses (4.3)', item: [
    login('Login dosen1', 'dosen1', 'dosen123', DEV.dosen1, { tokenDosen1: 'access_token' }),
    req('Perubahan nilai di luar jam akses -> 403', {
      method: 'PUT', url: U('/nilai/N-001'), token: 'tokenDosen1', device: DEV.dosen1,
      body: { nilai_angka: 80 }, test: tes({ status: 403, cek: [assert('Alasan menyebut jam akses', 'pm.expect(pm.response.json().alasan).to.include("jam akses");')] }),
    }),
    req('Finalisasi di luar jam akses -> 403', {
      method: 'POST', url: U('/kelas/KLS-1/finalisasi'), token: 'tokenDosen1', device: DEV.dosen1,
      test: tes({ status: 403, cek: [assert('Alasan menyebut jam akses', 'pm.expect(pm.response.json().alasan).to.include("jam akses");')] }),
    }),
    req('Baca nilai di luar jam akses tetap -> 200', {
      url: U('/nilai'), token: 'tokenDosen1', device: DEV.dosen1, test: tes({ status: 200 }),
    }),
  ]}],
};

const environment = {
  id: 'zt-env-0001',
  name: 'Zero Trust – Lokal',
  _postman_variable_scope: 'environment',
  values: [
    ['baseUrl', 'http://localhost:3000'],
    ['nilaiUrl', 'http://localhost:3001'],
    ['transkripUrl', 'http://localhost:3002'],
    ['gatewaySecret', 'ganti-gateway-secret-dev'],
    ['serviceSecret', 'secret-service-nilai-dev'],
    ['deviceAdmin', 'DEV-ADM-001'],
    ['deviceDosen1', 'DEV-DSN-001'],
    ['deviceDosen2', 'DEV-DSN-002'],
    ['deviceMhs1', 'DEV-MHS-001'],
    ['deviceMhs2', 'DEV-MHS-002'],
    ['deviceMhs3', 'DEV-MHS-003'],
  ].map(([key, value]) => ({ key, value, enabled: true })),
};

const dir = __dirname;
fs.writeFileSync(path.join(dir, 'Zero-Trust-Sistem-Nilai.postman_collection.json'), JSON.stringify(collection, null, 2));
fs.writeFileSync(path.join(dir, 'Zero-Trust-Jam-Akses.postman_collection.json'), JSON.stringify(jamAkses, null, 2));
fs.writeFileSync(path.join(dir, 'Zero-Trust-Sistem-Nilai.postman_environment.json'), JSON.stringify(environment, null, 2));
console.log('Koleksi Postman berhasil dibuat di folder postman/');
