# MODEL_TODO (internal, bukan UI publik)

Checklist saat model fix sudah ada. File ini boleh berisi detail teknis.

- [x] Model fix diterima: `model/HBD_AirHumidity_Final_Model_standalone.pth` (repack v2, recipe notebook utuh)
- [x] Konversi ke pickle `model/artifact_model.pkl` (tanpa torch), diff vs notebook 0,0014
- [x] Backend FastAPI siap: `../smartfarm-humidity-backend/` (`POST /predict`, `GET /health`), teruji lokal 734 baris
- [ ] Upload `artifact_model.pkl` ke host file (lihat `smartfarm-humidity-backend/README_DEPLOY.md`), dapatkan URL langsung
- [ ] Deploy backend ke Render Free (Docker), catat URL publik
- [ ] Isi ENV di Vercel: `MODEL_MODE=remote`, `MODEL_API_URL=https://...`
- [ ] Uji: upload `test.csv` asli, unduh CSV header `datetime,air_humidity`, 734 baris, clip 0-100
- [ ] Pemanasan via `status.html` sebelum demo (tidak ditautkan di navigasi)
- [ ] Hapus file ini dari navigasi publik (tetap di repo saja)
