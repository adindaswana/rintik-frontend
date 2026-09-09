# RINTIK (repo deploy Vercel)

Situs statis + Vercel Functions. Stub deterministik dulu, model asli belakangan.

## Deploy

1. Push folder ini sebagai repo Git baru, lalu di Vercel pilih Import.
2. ENV: `MODEL_MODE=stub` (default). `MODEL_API_URL` kosongkan dulu.
3. Deploy. Uji: buka `/predict.html`, pakai Gunakan Contoh Data, klik Buat Prediksi, cek `/hasil.html` dan Unduh CSV.

## Struktur

`index.html, predict.html, hasil.html, assets/, api/predict.js, api/predict/stub.js, api/predict/remote.js, api/health.js, lib/, public/example.csv, vercel.json`

## Ganti ke model asli nanti

Lihat `MODEL_TODO.md`. Isi `MODEL_API_URL` + `MODEL_MODE=remote`, tidak perlu ubah UI.
