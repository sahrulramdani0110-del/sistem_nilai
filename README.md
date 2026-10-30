# Sistem Nilai – Zero Trust Security

Tugas Praktikum Individu · Keamanan Informasi (KP70065004) · Informatika Universitas Siliwangi

Implementasi prinsip **zero trust** (*never trust, always verify; least privilege; assume breach*) di level aplikasi.
API Gateway berperan sebagai **Policy Enforcement Point (PEP)** yang terpisah dari service, sesuai NIST SP 800-207.

---

## 1. Prasyarat

- Node.js **18 atau lebih baru** (disarankan 20 LTS / 22)
- npm (ikut terpasang bersama Node.js)
- Postman (opsional, untuk pengujian manual) atau curl

## 2. Cara Menjalankan

```bash
npm install          # pasang dependensi
npm run seed         # buat database SQLite + data awal (ulangi kapan pun ingin reset)
npm start            # jalankan gateway (3000), Service Nilai (3001), Service Transkrip (3002)
```

Setelah itu API dapat diakses di `http://localhost:3000`. Untuk menghentikan, tekan `Ctrl+C`.

> Catatan: jalankan `npm run seed` **saat service tidak sedang berjalan**, karena seed menghapus database lama.

### Menjalankan service secara terpisah (opsional)
```bash
npm run gateway      # terminal 1
npm run nilai        # terminal 2
npm run transkrip    # terminal 3
```

## 3. Konfigurasi (environment variable, opsional)

| Variabel | Default | Keterangan |
|---|---|---|
| `JAM_MULAI` | `07:00` | Awal jam akses perubahan & finalisasi nilai |
| `JAM_SELESAI` | `21:00` | Akhir jam akses (inklusif) |
| `JWT_SECRET` | `ganti-jwt-secret-dev` | Kunci penandatanganan JWT |
| `GATEWAY_SECRET` | `ganti-gateway-secret-dev` | Nilai header `X-Gateway-Secret` |
| `SERVICE_NILAI_SECRET` | `secret-service-nilai-dev` | Secret client `service-nilai` |
| `DB_PATH` | `data/sistem_nilai.db` | Lokasi database SQLite |

Contoh menjalankan dengan jam akses khusus (untuk demo):
```bash
JAM_MULAI=00:00 JAM_SELESAI=23:59 npm start      # Linux/macOS
set JAM_MULAI=00:00 && set JAM_SELESAI=23:59 && npm start   # Windows CMD
```

## 4. Akun & Device ID Data Awal

Setiap user memiliki **tepat 1 device terdaftar**. Kirim device ID pada header `X-Device-ID`.

| Username | Password | Nama | Role | NIM | Device ID |
|---|---|---|---|---|---|
| `admin` | `admin123` | Administrator Akademik | admin | – | `DEV-ADM-001` |
| `dosen1` | `dosen123` | Dr. Budi Santoso | dosen | – | `DEV-DSN-001` |
| `dosen2` | `dosen123` | Dr. Sari Lestari | dosen | – | `DEV-DSN-002` |
| `mhs1` | `mhs123` | Ani Rahayu | mahasiswa | 2110001 | `DEV-MHS-001` |
| `mhs2` | `mhs123` | Budi Pratama | mahasiswa | 2110002 | `DEV-MHS-002` |
| `mhs3` | `mhs123` | Citra Dewi | mahasiswa | 2110003 | `DEV-MHS-003` |

**Data kelas (seed):**

| Kode | Mata kuliah | Dosen pengampu | Mahasiswa terdaftar |
|---|---|---|---|
| IF301 (`KLS-1`) | Keamanan Informasi | dosen1 | mhs1, mhs2 |
| IF302 (`KLS-2`) | Pemrograman Web | dosen2 | mhs2, mhs3 |

**Record nilai awal** (kosong, harus diisi dosen): `N-001` (mhs1 IF301), `N-002` (mhs2 IF301), `N-003` (mhs2 IF302), `N-004` (mhs3 IF302).

Client service (untuk Service Nilai): `service-nilai` / `secret-service-nilai-dev`.

## 5. Arsitektur & Pemetaan Kebutuhan

```
Client ──► API Gateway :3000 (PEP + Policy Engine + Audit Log)
              │  allow → X-Gateway-Secret + diteruskan
      ┌───────┴────────┐
 Service Nilai     Service Transkrip
    :3001               :3002
      └── finalisasi memanggil /transkrip/sinkron LEWAT gateway (token service)
```

| Kebutuhan (bagian 4) | Lokasi kode |
|---|---|
| 4.1 Access token JWT 10 menit (sub, role) | `shared/tokens.js` (`signAccessToken`, `expiresIn: '10m'`) |
| 4.1 Refresh token 1 hari, disimpan di DB, dicabut saat logout | `gateway/auth.js` (`/refresh`, `/logout`), tabel `refresh_tokens` di `shared/db.js` |
| 4.1 Token service 5 menit dari `POST /auth/service` | `gateway/auth.js` (`/service`), `services/nilai/index.js` (`ambilTokenService`) |
| 4.1 Gateway secret, service menolak tanpa header | `shared/verify.js` (`requireGateway`), `gateway/index.js` (`onProxyReq`) |
| 4.1 Verifikasi ulang token di service | `shared/verify.js` (`requireToken`) |
| 4.2 Kebijakan akses per endpoint (Tabel 3) | `gateway/policy.js` (array `RULES`) |
| 4.2 Kebijakan berbasis kepemilikan data (baca DB) | `gateway/policy.js` (`cekLihatNilai`, `cekUbahNilai`, `cekFinalisasi`, `cekLihatTranskrip`) |
| 4.3 Device terdaftar (`X-Device-ID`) | `gateway/policy.js` (langkah 3), `gateway/auth.js` (login) |
| 4.3 Jam akses dapat dikonfigurasi | `gateway/policy.js` (`dalamJamAkses`), `shared/config.js` |
| 4.4 Audit log: waktu, subjek, endpoint, device, hasil, alasan | `gateway/audit.js`, tabel `audit_log`, `GET /audit` |
| Policy Engine mengembalikan allow/deny + alasan | `gateway/policy.js` (`evaluate`) |

Urutan keputusan Policy Engine: **autentikasi token → role (least privilege) → device terdaftar → jam akses → kepemilikan data**.

## 6. Daftar Endpoint

Semua endpoint diakses melalui gateway `http://localhost:3000`.

| Method & path | Ditangani | Diizinkan | Kondisi |
|---|---|---|---|
| `POST /auth/login` | Gateway | Semua user | Kredensial valid + header `X-Device-ID` terdaftar |
| `POST /auth/refresh` | Gateway | Semua user | Refresh token valid & belum dicabut |
| `POST /auth/logout` | Gateway | Semua user | Mencabut refresh token |
| `POST /auth/service` | Gateway | Service Nilai | `client_id` & `client_secret` valid |
| `GET /nilai?kelas_id=` | Nilai | Mahasiswa, dosen | Mahasiswa: nilai sendiri. Dosen: kelas yang diampu |
| `PUT /nilai/:id` | Nilai | Dosen | Kelas diampu, nilai belum final, dalam jam akses. Body: `{"nilai_angka": 0–100}` |
| `POST /kelas/:id/finalisasi` | Nilai | Dosen | Kelas diampu, dalam jam akses. Lalu sinkron ke transkrip |
| `GET /transkrip/:nim` | Transkrip | Mahasiswa, admin | Mahasiswa: NIM sendiri. Admin: semua |
| `POST /transkrip/sinkron` | Transkrip | Service Nilai | Hanya token service |
| `GET /audit?limit=` | Gateway | Admin | Melihat audit log |

Contoh alur cepat dengan curl:
```bash
# 1. Login (wajib X-Device-ID)
curl -X POST localhost:3000/auth/login -H "Content-Type: application/json" \
  -H "X-Device-ID: DEV-DSN-001" -d '{"username":"dosen1","password":"dosen123"}'

# 2. Pakai access token
curl localhost:3000/nilai -H "Authorization: Bearer <access_token>" -H "X-Device-ID: DEV-DSN-001"
```

## 7. Pengujian dengan Postman

Folder `postman/` berisi:

- `Zero-Trust-Sistem-Nilai.postman_collection.json` – 52 request, 65 assertion (login, autentikasi, least privilege, finalisasi & sinkron, transkrip, gateway secret, audit)
- `Zero-Trust-Sistem-Nilai.postman_environment.json` – variabel environment (baseUrl, device ID, secret)
- `Zero-Trust-Jam-Akses.postman_collection.json` – uji jam akses (dijalankan terpisah, lihat di bawah)
- `build-collection.js` – generator koleksi (`npm run postman:build`)

### Langkah
1. Jalankan `npm run seed`, lalu `npm start` (dengan jam akses penuh, lihat catatan di bawah).
2. Di Postman: **Import** ketiga file JSON di atas.
3. Pilih environment **Zero Trust – Lokal**, lalu **Run collection** (urutan folder 1 → 7 harus dipertahankan).
4. Agar hasil konsisten, jalankan ulang dari awal dengan `npm run seed` (dan restart service) sebelum setiap run, karena finalisasi mengubah data.

Atau via terminal (memerlukan Newman, sudah termasuk devDependency):
```bash
npm test
```

### Catatan jam akses (penting)
Perubahan dan finalisasi nilai hanya boleh pukul **07.00–21.00**. Jika pengujian dilakukan di luar jam tersebut, jalankan dengan jam akses penuh:
```bash
JAM_MULAI=00:00 JAM_SELESAI=23:59 npm start
```
Untuk menguji bahwa jam akses benar-benar menolak, jalankan gateway dengan jendela yang **tidak** mencakup jam sekarang (contoh `JAM_MULAI=00:00 JAM_SELESAI=00:01`), lalu jalankan `Zero-Trust-Jam-Akses.postman_collection.json`.

### Hasil yang diharapkan
Koleksi utama: **52 request, 65 assertion, 0 gagal.** Koleksi jam akses: **4 request, 6 assertion, 0 gagal** (dengan jendela jam sempit).

## 8. Struktur Proyek

```
sistem-nilai/
├── gateway/
│   ├── index.js        # PEP: pintu masuk, pemeriksaan tiap request, proxy
│   ├── policy.js       # Policy Engine: aturan Tabel 3 & keputusan allow/deny
│   ├── auth.js         # /auth/login, /refresh, /logout, /service
│   └── audit.js        # pencatatan audit log
├── services/
│   ├── nilai/index.js      # Service Nilai (port 3001)
│   └── transkrip/index.js  # Service Transkrip (port 3002)
├── shared/
│   ├── config.js       # konfigurasi terpusat
│   ├── db.js           # skema SQLite
│   ├── tokens.js       # JWT sign/verify
│   ├── verify.js       # verifikasi di service (gateway secret, token, role)
│   ├── crypto.js       # hashing password, SHA-256, perbandingan aman
│   └── grades.js       # konversi angka → huruf
├── db/seed.js          # data awal
├── scripts/start-all.js
├── postman/            # koleksi, environment, generator
├── DEMO_SCRIPT.md      # panduan video demo
└── README.md
```

## 9. Catatan Keamanan & Keterbatasan

- Gateway dan service berbagi **JWT_SECRET** dan **GATEWAY_SECRET** (HS256). Pada lingkungan produksi sebaiknya memakai algoritma asimetris (RS256/ES256) dan TLS/mTLS antar-service.
- Semua secret pada contoh berada di konfigurasi default untuk kebutuhan praktikum. Ganti sebelum digunakan di tempat lain.
- Service hanya dimaksudkan berjalan di localhost; keamanan utama tetap berasal dari pemeriksaan gateway secret dan token.
- Password disimpan dengan hash `scrypt`, refresh token disimpan dalam bentuk SHA-256 hash.
