# MODEL_TODO (internal, bukan UI publik)

Dokumen lama tentang repack/pickle dan deployment tidak lagi berlaku. Sumber
kebenaran adalah checkpoint `.pth` original di workspace, sidecar terverifikasi,
dan backend `../rintik-backend`.

## Selesai sampai M3

- [x] Backend memuat checkpoint original setelah verifikasi SHA256.
- [x] Daily replay 16 tanggal, state temporal, P1→P2→P3, dan snapshot SQLite teruji.
- [x] Monitoring/recovery sintetis dipisahkan dalam namespace `/v1/demo`.
- [x] Shared API client fail closed; network/backend error tidak menghasilkan prediksi pengganti.
- [x] Stub hanya tersedia sebagai `MODEL_MODE=demo_stub` dan selalu berlabel simulasi.
- [x] Cross-repository HTTP replay seluruh 734 timestamp teruji lokal.

## Pekerjaan M4 atau lebih lanjut

- [ ] Hubungkan `lib/rintik-api.js` ke dashboard operator final.
- [ ] Implementasikan pemilih tanggal, grafik RH, incident workflow, dan technical details sesuai kontrak.
- [ ] Jalankan visual/accessibility QA dan uji clean-machine sebelum klaim siap demo.
- [ ] Tentukan deployment hanya setelah review terpisah; jangan unggah checkpoint atau melakukan deployment otomatis.
