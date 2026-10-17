# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Situs statis tanpa framework (HTML + CSS + vanilla JS), deploy di Vercel. Backend model frozen terpisah (lokal port 8140 atau Hugging Face Spaces, lihat `lib/rintik-config.js`). Fungsi `api/*.js` hanya proxy dan tidak pernah membuat jawaban cadangan.

## Users

Peran, bukan nama orang.

- **Juri NSC 2026 (Data Science).** Membuka situs di laptop saat presentasi atau penilaian, sekitar 3 sampai 5 menit. Tugas: memahami dalam satu layar apa yang dikerjakan RINTIK, melihat mekanismenya bekerja, dan menilai kejujuran klaim.
- **Pengelola perkebunan pintar.** Laptop di kantor lapangan. Tugas: tahu apakah sensor kelembapan masih bisa dipercaya dan kapan nilai pengganti dipakai.
- **Operator.** Laptop atau ponsel di dekat instalasi. Tugas: memproses batch harian, mengecek hasil per tanggal, dan menindaklanjuti tanda Waspada atau Dugaan malfungsi.

## Product Purpose

RINTIK (Regresi Intrahari dengan Navigasi Temporal untuk Identifikasi Kelembapan) memprediksi kelembapan udara (%RH) setiap 30 menit dari 23 sensor lain. Estimasi itu punya dua peran: memeriksa sensor kelembapan (bandingkan hari demi hari) dan menggantikannya sementara saat sensor hilang atau rusak, dengan label `estimated`. Keberhasilan: juri bisa mengulang kalimat "saat sensor kelembapan salah, RINTIK menangkapnya" setelah melihat Beranda.

## Positioning

Prediksi %RH dari 23 sensor lain untuk memeriksa dan menggantikan sementara sensor kelembapan. Bacaan kelembapan ditutup dari input model, jadi estimasinya menjadi pembanding yang independen. Model mengusulkan; manusia memeriksa perangkat.

## Operating Context

- Batch harian: 48 slot per 30 menit. Stage 1 menebak level harian, Stage 2 menebak deviasi 30 menit, lalu dijumlahkan, dihaluskan, dan dirapikan aturan tetap P1 sampai P3 menjadi nilai akhir.
- Dua alur Prediksi yang terpisah: Operasional Harian (simulasi 14 sampai 25 Oktober 2026) dan Demo Resmi (fixture kompetisi 29 Agustus sampai 13 September 2023).
- Juri melihat di laptop dengan proyektor atau layar terang; operator kadang memakai ponsel.

## Capabilities and Constraints

- Halaman: Beranda, Prediksi, Hasil, Dashboard, Pemeriksaan, Pengaturan, Status (internal, tidak di navigasi).
- Fail-closed: jika backend tidak menjawab, halaman menampilkan pesan error dan tidak pernah membuat hasil pengganti.
- Sensor kelembapan pada skenario prototipe adalah simulasi dan bukan ground truth akurasi.
- Ambang Pemeriksaan (rules `demo-v1`) belum dikalibrasi untuk lokasi lain.
- Bahasa UI: Indonesia. Kontrak id dan token dikunci oleh `scripts/*_contract.js`.

## Brand Commitments

- Maskot Rintik (tetes air berwajah, persen di perut) adalah logo. Wordmark "RINTIK" bergaris biru dengan maskot sebagai titik huruf i.
- Palet biru langit yang sama dengan deck dan video RINTIK.
- Setiap halaman membawa pernyataan "Prototipe · data kompetisi NSC 2026 + simulasi · bukan alat referensi".
- Label "simulasi", "estimated", dan "ilustrasi" selalu dipertahankan.

## Evidence on Hand

- Deck dan naskah video arsitektur di `PPT/deck_v3/` (sumber fakta Stage 1, Stage 2, P1 sampai P3).
- Aset maskot di `assets/img/mascot/`, logo di `assets/img/logo-rintik.svg`, wordmark di `assets/img/wordmark-rintik*.png`.
