# Design system RINTIK

Bahasa visual yang sama dengan deck dan video RINTIK: biru langit, tenang, bersih, profesional tapi ramah. Bukan halaman marketing: tanpa gradien dekoratif berlebih, tanpa glassmorphism, tanpa ikon emoji, tanpa angka besar yang tidak berdasar. Maskot dipakai sebagai penanda merek dan penyerta, tidak pernah menutupi data.

Sumber kode: token merek dan chrome bersama ada di `assets/css/rintik-brand.css` (dimuat terakhir di semua halaman). Beranda dan Pemeriksaan memakai `assets/css/style.css`; Prediksi dan Hasil memakai `assets/css/prediction-flow.css` (`.flow-page`); Dashboard dan Pengaturan memakai `assets/css/dashboard.css`. Ketiga file halaman memetakan variabel lamanya (`--flow-*`, `--green`, dst.) ke token di bawah.

## Tokens

| Token | Nilai | Pemakaian |
|---|---|---|
| `--r-blue` | #1269E2 | Tombol utama, garis estimasi RINTIK, tautan aktif |
| `--r-blue-700` | #0F55B8 | Teks tautan dan label di latar terang (kontras AA) |
| `--r-blue-500` | #3484F4 | Cincin fokus |
| `--r-blue-400` / `-300` | #7CB2FF / #A0CEFF | Garis wordmark, maskot, aksen lembut |
| `--r-blue-100` / `-50` | #D9E6FF / #EEF5FF | Nav aktif, kartu terpilih, latar info |
| `--r-bg` | #F5FAFD | Latar halaman |
| `--r-surface` / `-2` | #FFFFFF / #F8FAFE | Kartu, panel |
| `--r-line` / `-strong` | #DCE7F3 / #C3D4E8 | Garis kartu, input |
| `--r-navy` | #131E30 | Judul, footer Beranda |
| `--r-ink-2` / `--r-muted` | #3B4A5E / #5A6B80 | Teks isi / teks sekunder |
| `--r-rose` / `-700` / `-50` | #D8547A / #BD284D / #FBEAF0 | Masalah, alarm, Dugaan malfungsi, error |
| `--r-teal` / `-700` / `-50` | #2F9AA6 / #1B6F77 / #E3F5F7 | Nilai akhir, Sehat, recovery `estimated`, status terhubung |
| `--r-amber` / `-700` / `-50` | #E89A2C / #7E5212 / #FDF0DC | Waspada, label simulasi dan ilustrasi, catatan batas |

Makna warna tetap: biru = RINTIK, rose = masalah, teal = nilai akhir dan sehat, amber = waspada atau simulasi, abu biru (#6B7C92) = bacaan sensor netral. Grafik SVG yang digambar JS memakai warna lama; `rintik-brand.css` memetakan atribut `stroke`/`fill` itu ke palet ini tanpa mengubah JS.

## Type

- Judul: Quicksand 600 sampai 700 (Google Fonts), `letter-spacing` -0,01 sampai -0,025em, `text-wrap: balance`.
- Isi dan UI: Inter 400 sampai 600. Isi 15 sampai 18 px, ukuran terkecil 12 px (label), angka metrik `tabular-nums`.
- H1 Beranda clamp(34px, 3,6vw, 50px); H1 halaman kerja clamp(28px, 4vw, 52px); H2 bagian 28 sampai 40 px.
- Label kecil berhuruf kapital (`.flow-step`, `.section-kicker`) hanya untuk konteks data (tanggal, simulasi, workflow), bukan hiasan.

## Layout

- Kontainer 1240 px, gutter 24 px (16 px di bawah 640 px). Tidak ada scroll horizontal di 360 px.
- Header: logo maskot + wordmark kiri, enam tautan di tengah (Beranda, Prediksi, Hasil, Dashboard, Pemeriksaan, Pengaturan), status koneksi kanan pada halaman kerja. Di bawah 960 px menjadi tombol menu 44 px.
- Beranda: hero (wordmark besar, pesan inti, CTA, ilustrasi sensor vs RINTIK), dua peran, pipeline 5 langkah, daftar masuk ke halaman kerja, batas klaim, footer navy.
- Halaman kerja: judul kiri + status kanan, kartu putih radius 20 sampai 24 px, footer tipis dengan pernyataan prototipe.

## Components

Header (`.navbar`, `.brand`, `.nav-links`, `.nav-runtime`/`.service-state`, `.mobile-menu`) · Footer (`.site-footer` Beranda, `.site-foot` halaman kerja) · Tombol pil (`.btn`/`.button`, primer biru, sekunder putih bergaris, min 44 px) · Tag (`.tag-amber` ilustrasi, `.tag-rose`, `.tag-teal`) · Label simulasi bergaris amber (`.flow-sim-label`, `.simulation-label`) · Kartu (`.card`, `.flow-card`) · Alert (rose untuk error, biru untuk info) · Empty state (ikon dalam kotak biru muda, judul, satu kalimat, satu tombol) · Pipeline (`.pipeline`, titik dan garis, node akhir teal) · Skala status (Sehat, Waspada, Dugaan malfungsi, Data kurang).

## Motion

Satu momen: garis ilustrasi di hero digambar (1,6 detik, ease-out), area macet muncul setelahnya, maskot naik pelan. Interaksi lain hanya transisi warna 150 ms dan geser panah 3 px. Semua animasi mati pada `prefers-reduced-motion: reduce`.

## Accessibility

Kontras teks AA (teks sekunder #5A6B80 di putih 5,3:1). Fokus terlihat 3 px #3484F4. Target sentuh minimal 44 px (`pointer: coarse`). Skip link di setiap halaman. Logo `alt=""`, wordmark `alt="RINTIK"`.

## Copy rules

- Bahasa Indonesia sederhana, kalimat pendek, kata kerja jelas: "Coba Prediksi", "Periksa sensor", "Jalankan pemeriksaan".
- Tanpa em dash; desimal koma (87,2%); jam memakai titik (13.00).
- Pakai "perkebunan pintar", jangan "greenhouse". Jangan "real-time" atau "streaming". Jangan klaim akurasi lapangan.
- "Estimasi" bukan "pengukuran". Nilai pengganti selalu "estimated". Data contoh selalu "ilustrasi" atau "simulasi".
- Error menyebut masalah dan langkah pemulihan, dan menegaskan tidak ada hasil pengganti yang dibuat.
