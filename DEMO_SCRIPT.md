# Panduan Video Demo (6–9 menit)

Tujuan: menunjukkan bagian kode yang menangani setiap kebutuhan bagian 4, sambil mendemokan perilakunya.

## Persiapan
```bash
npm run seed
JAM_MULAI=00:00 JAM_SELESAI=23:59 npm start   # agar demo tidak terganggu jam akses
```
Buka Postman (koleksi sudah diimpor) dan siapkan terminal yang menampilkan log `[AUDIT]`.

## Susunan demo

| Waktu | Bagian | Yang ditunjukkan | Kode yang dibuka |
|---|---|---|---|
| 0:00–0:40 | Pengantar | Arsitektur: gateway sebagai PEP, dua service, satu database, audit | README §5, diagram |
| 0:40–2:00 | 4.1 Autentikasi | Login → JWT 10 menit (decode di jwt.io atau tampilkan `sub`, `role`). Refresh token, logout mencabut token, refresh gagal setelahnya. Token service via `POST /auth/service`. | `shared/tokens.js`, `gateway/auth.js` |
| 2:00–2:40 | 4.1 Gateway secret & verifikasi ulang | Akses langsung ke `:3001` ditolak. Token dimodifikasi ditolak di service. | `shared/verify.js`, `gateway/index.js` (`onProxyReq`) |
| 2:40–3:40 | 4.3 Device | Login dengan device milik user lain ditolak. Request tanpa `X-Device-ID` ditolak. | `gateway/auth.js`, `gateway/policy.js` (langkah 3) |
| 3:40–4:50 | 4.2 Least privilege | Mahasiswa hanya melihat nilai sendiri. Dosen2 ditolak mengubah nilai kelas dosen1. Admin ditolak di `/nilai`. | `gateway/policy.js` (`RULES`, `cekLihatNilai`, `cekUbahNilai`) |
| 4:50–5:40 | 4.2 Finalisasi & sinkron | Finalisasi kelas → nilai masuk transkrip. Finalisasi ulang → 409. Ubah nilai setelah final → 403. Token user ditolak di `/transkrip/sinkron`. | `services/nilai/index.js` (`/kelas/:id/finalisasi`), `services/transkrip/index.js` |
| 5:40–6:10 | 4.2 Transkrip | Mahasiswa melihat NIM sendiri, ditolak NIM lain. Admin melihat semua. | `services/transkrip/index.js`, `cekLihatTranskrip` |
| 6:10–6:50 | 4.3 Jam akses | Tunjukkan konfigurasi `JAM_MULAI/JAM_SELESAI` dan bahwa baca nilai tetap bisa di luar jam. (Opsional: restart dengan jendela sempit untuk menunjukkan 403.) | `gateway/policy.js` (`dalamJamAkses`), `shared/config.js` |
| 6:50–7:30 | 4.4 Audit log | `GET /audit` sebagai admin, tunjukkan `allow` dan `deny` dengan alasan. Tunjukkan log `[AUDIT]` di terminal. | `gateway/audit.js`, `gateway/index.js` |
| 7:30–8:00 | Penutup | Jalankan `npm test` (Newman): 52 request, 65 assertion lolos. | `postman/` |

## Tips
- Saat membuka kode, tunjukkan baris spesifiknya (misalnya `const token = ...`, `if (!rule.roles.includes(...))`) dan jelaskan alasannya, bukan hanya membacakan.
- Untuk setiap penolakan, tunjukkan field `alasan` pada respons dan baris `[AUDIT] DENY` yang sesuai di terminal.
- Jika waktu terbatas, prioritaskan 4.1 dan 4.2 karena paling banyak bobot logikanya.
