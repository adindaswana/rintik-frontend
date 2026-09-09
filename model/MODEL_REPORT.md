# Laporan Audit Model Final -> Artifact Standalone

Sumber kebenaran: `FINALIZATION_IPYNB_HBD.ipynb` (112 cell, 35 code cell) + `HBD_AirHumidity_Final_Model.pth` (142,37 MB).
Hasil: `HBD_AirHumidity_Final_Model_standalone.pth` (135,79 MB) + `inference_standalone.py`.
Tidak ada retraining, tidak ada ubahan recipe/hyperparameter, tidak ada komponen baru.

## 1. Cara model final bekerja (persis notebook)

Input runtime: `train.csv` (2.933 baris, ada `air_humidity`), `test.csv` (734 baris, tanpa target),
`sample_submission.csv` (schema + urutan datetime). `SEED=42`, thread OMP/MKL=1.

1. **Feature engineering (cell 64):** `full = concat(train, test)` terurut waktu. `es` = Magnus
   `0.6108*exp(17.27*T/(T+237.3))`. Agregat harian per `day` (`_dm/_dsd/_dmin/_dmax`) + deviasi untuk
   11 kolom DRIV; `phys_ratio = es(Tmean)/es(T)`; Fourier `sh1-10/ch1-10` (slot 48/hari);
   `dT/des/dT2/dTdes`; lag dalam-hari 1,2,3,6,12 untuk `dT/des/soil_humidity_line2_dev/co2_dev`.
   Tabel harian `dtf` = 51 fitur DFEAT (7 DAG + 44 agregat) + `doy` = 52 kolom.
   Fitur stage 2: S2 (65) = deviasi + fisika + slot + Fourier + lag + `phys_dev_l*`;
   S2B (78) = S2 + DAG + 6 agregat harian.
2. **Stage 1 (cell 67):** Ridge(alpha=6) di atas StandardScaler + LGBM
   (250 pohon, lr 0.035, leaves 8, lambda 8) + XGB (depth 2, eta 0.04, 200 ronde),
   blend 0.40/0.35/0.25, shrinkage `0.85*p + 0.15*mean(10 hari train terakhir)`,
   lalu carry AR(1): `level[hari uji k] += 0.60 * r0 * 0.30^k`, dengan
   `r0 = mean(3 residual harian train terakhir)`. Broadcast ke baris 30 menit.
3. **Stage 2 (cell 73):** formulasi A (`y - mean harian`) dan B (`y - level stage1`),
   masing-masing XGB (depth 7, eta 0.025, 8 seed, 800 ronde) + LGBM
   (900 pohon, lr 0.02, leaves 52, 7 seed), blend `0.82*XGB + 0.18*LGBM`,
   gabungan `1.03 * (0.70*A + 0.30*B)`. Imputasi `fillna(0.0)`.
4. **Rekonstruksi (cell 82):** `clip(causal_ewm(level + deviasi, 0.72), 0, 100)`.
5. **Post-1 (cell 85):** `clip(tail_compression(v, 0.85, 0.20))` (kompresi ekor ke median).
6. **Post-2 (cell 88):** affine `-0.40` -> lead-lag center `0.275` -> rolling-median-7 `0.20`
   -> tail compression lagi -> `clip(0.20*ml3 + 0.80*ml4)`.
7. **Post-3 beam (cell 91):** amplitudo `1.02` dari median -> curvature `-0.10` ->
   rolling-median-7 `0.10` -> slot_blend `0.05` -> `clip(0.97*beam4 + 0.03*ewm(beam4, 0.95))`.
8. **Output (cell 106):** `datetime,air_humidity`, 4 desimal, 734 baris sejajar test.

## 2. Audit .pth asli: isi vs yang hilang

Terisi: ridge (coef 52, intercept, scaler mean/scale, features, alpha), LGBM `model_string`,
XGB `raw_model` (bytearray) untuk stage 1 + 8/7 model A + 8/7 model B, semua bobot blend,
DRIV/DAG/HARM/S2/S2B, smoothing alpha + clip, 12 parameter post-modelling. Diverifikasi:
urutan fitur .pth == urutan kolom `dtf` notebook; S2/S2B rakitan ulang == .pth.

Belum cukup untuk standalone (state turunan-train, bukan parameter):
`daily_median` (52, imputasi tabel harian), `last10_mean` (skalar shrinkage),
`carry_r0` (skalar carry-over). Tanpa ketiganya inference mandiri tidak bisa jalan.
Direct ensemble tidak ikut .pth (benar: hanya benchmark, bukan komponen final).

## 3. Desain artifact standalone (ditentukan dari audit)

`HBD_AirHumidity_Final_Model_standalone.pth` = seluruh key asli utuh + tambahan:
`inference_state` {`daily_median[52]`, `last10_mean=57.859...`, `carry_r0=4.268...`,
`day_context` (30 baris train 2023-08-29 00:00-14:30), info train},
`pipeline` (urutan 8 tahap, schema input/output, dependensi runtime),
`reproducibility` (seed, versi lib saat freeze, selisih vs notebook).
`artifact_version`: 1 -> 2. Model tidak disentuh; yang dibekukan hanya state.

Dua temuan yang ditangani tanpa mengubah model:
(a) Hari 2023-08-29 ada di train (00:00-14:30) dan test (15:00-23:30); agregat harian
dan lag dalam-hari notebook memakai gabungan keduanya. Konteks 30 baris dibekukan agar
mode test-only tetap bit-identik tanpa meminta train.csv.
(b) Mode exact (`--train train.csv`) tetap tersedia untuk audit bit-per-bit.

## 4. Verifikasi reproducibility (vs FINALIZATION_submission.csv, 734 baris)

| Mode | max abs diff | mean abs diff |
|---|---|---|
| Exact (+train.csv) | 0,001400 | 0,000046 |
| Test-only + konteks beku | 0,001400 | 0,000046 |
| Test-only tanpa konteks (ditolak) | 5,090200 | 0,075565 |

Residu 0,0014 = noise numerik versi lib (terutama LightGBM) + pembulatan 4 desimal pada
referensi; dampak RMSE ~1e-4. Bukan perubahan recipe. Schema output: `datetime,air_humidity`,
tanpa NaN/inf, seluruh nilai 0-100.

## 5. Dependensi

Freeze/audit: python 3.13.5, torch 2.13.0, numpy 2.4.4, pandas 3.0.2, xgboost 3.2.0,
lightgbm 4.7.0, scikit-learn 1.9.0.
Runtime inference: numpy, pandas, xgboost, lightgbm, torch (hanya `torch.load`).
Ridge dihitung manual via numpy (tanpa sklearn di inference).

## 6. Pakai untuk deployment

`python model/inference_standalone.py --test test.csv --out submission.csv`
Opsional audit: tambah `--train train.csv`. Backend deployment memanggil fungsi
`predict(test_path, out_path, pth_path, train_path=None)` dari file yang sama.
