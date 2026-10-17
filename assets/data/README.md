# assets/data

Dibangun ulang oleh `scripts/build_monitor_assets.py`. Jangan disunting manual.

`demo_*.csv` dan `mock_monitor_response.json` berisi potongan data latih lomba, jadi tidak ikut di-commit (lihat `.gitignore`) dan tidak di-host di situs publik. Tombol contoh di `periksa.html` hanya muncul bila file ini ada (salinan lokal). Saat demo, unggah file dari laptop.

| File | Isi |
|---|---|
| `train_stats.json` | Statistik 22 kolom sensor dari `train.csv` (mean, sd, p1, p5, p50, p95, p99, missing_rate). Kolom kumulatif (`gdd`, `water_volume_line1..3`) punya `daily_increment`: median harian dikurangi median hari sebelumnya. `env_id` dan `env_battery` dikecualikan. |
| `demo_sehat.csv` | 702 baris, 2023-08-15 00:00 s.d. 2023-08-29 14:30, semua kolom train termasuk `air_humidity`, teks apa adanya (sel kosong tetap kosong). Data latih, jadi in-sample. |
| `demo_rusak.csv` | Sama dengan `demo_sehat.csv`, hanya `air_humidity` yang diubah (lihat di bawah). |
| `mock_monitor_response.json` | Jawaban tiruan `POST /monitor` untuk `demo_rusak.csv`. Hanya untuk uji lokal lewat `periksa.html?mock=1`. Tebakan `p3`/`inti` di sini adalah bacaan asli yang dihaluskan, BUKAN keluaran model. |

## Kerusakan pada `demo_rusak.csv`

1. Mulai hari ke-8 (2023-08-22) sampai akhir: `air_humidity` dikurangi 20 poin, lalu dibatasi ke 0 sampai 100. Meniru sensor yang bergeser (drift/offset).
2. Hari ke-12 (2023-08-26): seluruh `air_humidity` hari itu diganti satu nilai konstan 32.41, yaitu rata-rata hari itu setelah dikurangi 20. Meniru sensor macet (flatline).

Hari ke-1 sampai ke-7 identik dengan `demo_sehat.csv`.
