# RINTIK (repo deploy Vercel)

Situs statis + Vercel Functions. Stub deterministik dulu, model asli belakangan.

## Deploy

1. Push folder ini sebagai repo Git baru, lalu di Vercel pilih Import.
2. ENV: `MODEL_MODE=stub` (default). `MODEL_API_URL` kosongkan dulu.
3. Deploy. Uji: buka `/predict.html`, pakai Gunakan Contoh Data, klik Buat Prediksi, cek `/hasil.html` dan Unduh CSV.

## Struktur

`index.html, predict.html, hasil.html, periksa.html, assets/, api/predict.js, api/predict/stub.js, api/predict/remote.js, api/monitor.js, api/health.js, lib/, vercel.json`

## Ganti ke model asli nanti

Lihat `MODEL_TODO.md`. Isi `MODEL_API_URL` + `MODEL_MODE=remote`, tidak perlu ubah UI.

## Halaman Pemeriksaan (`periksa.html`)

- Frontend memanggil `POST /api/monitor` (`api/monitor.js`), yang meneruskan ke `MODEL_API_URL + '/monitor'` (timeout 50 detik, `maxDuration` 60 di `vercel.json`).
- **Tanpa fallback stub.** Jika `MODEL_API_URL` kosong, backend mati, timeout, atau jawaban tidak lengkap, API mengembalikan 503/502 dengan pesan jelas. `MODEL_MODE` tidak memengaruhi endpoint ini.
- Data statis di `assets/data/` dibangun ulang dengan `python3 scripts/build_monitor_assets.py [train.csv]` (lihat `assets/data/README.md`).
- Uji handler: `node scripts/monitor_smoke.js` (fetch di-mock, tanpa jaringan).
- Uji tampilan lokal tanpa backend: `python3 -m http.server 8765`, buka `periksa.html?mock=1&demo=rusak&autorun=1`. `?mock=1` memakai `assets/data/mock_monitor_response.json` (tebakan tiruan, bukan model) dan tidak pernah aktif tanpa query itu. `window.RINTIK_MONITOR_URL` bisa diisi untuk menunjuk backend lain.
