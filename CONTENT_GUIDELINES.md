# Pedoman Konten & UI/UX - SmartFarm Humidity

Catatan penting: file prompt/spesifikasi asli untuk proyek ini (mis. `PROMPT_DEPLOY_VERCEL_NSC2026.md`) sempat hilang akibat beberapa kali reset lingkungan sandbox selama pengerjaan, dan tidak dapat dipulihkan. Dokumen ini dibuat sebagai pengganti untuk mencatat aturan konten dan gaya UI yang telah disepakati, agar tidak hilang lagi pada pembangunan ulang di masa depan.

## 1. Audiens
Situs ini ditujukan untuk **pengguna umum/publik** (masyarakat awam), **bukan** untuk developer, juri kompetisi, atau audiens teknis. Semua salinan (copy) dan tampilan harus ramah untuk orang non-teknis.

Catatan gaya penulisan tambahan: **jangan gunakan framing/istilah "kebun", "petani", "lahan", atau "perkebunan"** di mana pun dalam salinan situs. Sebutkan konteksnya secara netral, misalnya "data sensor Anda" atau "kelembapan udara", tanpa mengaitkannya secara spesifik ke pertanian/perkebunan. Nama produk "SmartFarm Humidity" tetap dipertahankan karena berasal dari nama resmi di dokumen deployment awal, namun salinan/isi teks di dalam halaman tidak boleh menambahkan narasi kebun/pertanian di luar nama tersebut.

## 2. Konten yang TIDAK BOLEH ditampilkan di UI
Berikut daftar eksplisit hal-hal teknis/di balik layar yang harus disembunyikan dari tampilan publik:

- Indikator status implementasi backend: banner "Mode stub aktif", pill "Mode: STUB", badge "stub: true", "ID prediksi: stub-xxxx".
- Informasi versi/pipeline model: nama tahap pipeline (Stage 1/Stage 2), versi model, parameter/formula (mis. formula fisika Tetens es(T), EWM alpha), estimasi waktu proses internal.
- Metrik statistik/kompetisi: RMSE, skor referensi champion, standar deviasi, dan metrik evaluasi teknis lainnya.
- Nama kolom/variabel data mentah (raw sensor/schema): mis. `air_temperature`, `soil_ec_line1/2/3`, `gdd`, `ontario_units`, `env_id`, dsb. Semua label pada form harus memakai bahasa Indonesia yang mudah dipahami (mis. "Suhu Udara", "Konduktivitas Tanah (Jalur 1)").
- Perbandingan dengan ground truth / data uji internal.
- Daftar artifact/file model, roadmap pengembangan model asli, dan tautan/dokumentasi developer lainnya.
- Halaman "Tentang Model" (atau sejenis) yang membahas arsitektur/pipeline model tidak boleh ada di situs publik.
- Aksi yang bersifat developer-oriented, seperti "Salin JSON" mentah dari hasil prediksi.
- Referensi jumlah baris/kolom data internal secara spesifik (mis. "734 baris", "25 kolom") di dalam salinan produk; gunakan bahasa umum ("data Anda", "beberapa sensor") jika perlu.

Jika ada elemen lain yang bersifat teknis atau "di belakang layar" dan tidak disebutkan secara eksplisit di atas, defaultnya adalah: **jangan ditampilkan** ke pengguna akhir.

## 3. Gaya Penulisan
- **Dilarang menggunakan karakter em dash (kode Unicode U+2014)** di mana pun dalam salinan/teks situs (HTML, CSS komentar, JS string, dokumen). Gunakan koma, titik, titik dua, atau tanda hubung biasa (-) sebagai gantinya.
- En dash (–) dan middot (·) diperbolehkan digunakan secara wajar (mis. untuk memisahkan label singkat).
- Gunakan Bahasa Indonesia yang sederhana dan langsung, hindari jargon teknis/statistik.

## 4. Palet & Aset Visual
- Tema warna: biru langit pastel lembut (sky-50 s.d. sky-900, referensi utama `--sky-600 #1269E2`), dengan aksen steel/amber/violet/teal/rose sesuai kebutuhan badge.
- Logo: gunakan `assets/img/logo.png` (ikon droplet-persen dengan latar gradien bulat sudah menyatu di file gambar itu sendiri). Jangan membungkusnya lagi dengan kotak warna terpisah, cukup tampilkan `<img>` dengan border-radius kecil.
- Background hero:
  - Beranda (`index.html`, section `.hero`): `assets/img/hero-home-bg.png`.
  - Prediksi (`predict.html`, section `.page-hero-sm`): `assets/img/hero-predict-bg.png`.
  - Kedua gambar tersebut sangat terang, sehingga teks di atasnya harus berwarna gelap (slate-900/slate-700), bukan putih.
- CTA strip dan footer memakai warna solid (bukan gradien): CTA strip `--sky-600`, footer `--sky-900`.

## 5. Struktur Halaman Publik
Situs terdiri dari 3 halaman saja:
1. `index.html` - Beranda: hero, cara kerja (3 langkah non-teknis), contoh tren + KPI ringkas non-teknis, CTA, footer.
2. `predict.html` - Buat Prediksi: unggah CSV atau isi form manual (label ramah pengguna), tips pengisian, overlay loading dengan pesan generik.
3. `hasil.html` - Hasil Prediksi: KPI ringkas (rata-rata/terendah/tertinggi), ringkasan harian, grafik, tabel hasil (Waktu + Prediksi Kelembapan), unduh CSV.

Tidak ada halaman "Tentang Model" atau halaman developer-facing lainnya.

## 6. Catatan Lingkungan
Dokumen prompt asli proyek ini tidak tersedia lagi di lingkungan kerja karena reset sandbox berulang. Jika ingin memperbarui/rebuild situs ini di masa depan, gunakan dokumen ini sebagai acuan utama untuk aturan konten dan gaya, selain melihat langsung struktur `index.html`, `predict.html`, `hasil.html`, `assets/css/style.css`, dan `assets/js/app.js` yang sudah jadi.
