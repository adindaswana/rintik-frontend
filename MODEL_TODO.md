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

## Selesai secara fungsional pada M4

- [x] Hubungkan `lib/rintik-api.js` ke dashboard operator tanpa fallback prediksi.
- [x] Implementasikan pemilih tanggal, grafik RH, incident workflow, Sensor Explorer, export, dan technical details sesuai kontrak.
- [x] Jalankan accessibility-static, contract, dan real-HTTP integration QA.

## Bukti yang masih wajib sebelum status M4 PASS

- [x] Responsive visual QA 1440/1366/tablet 820/mobile 390 di situs produksi: tanpa scroll horizontal dan tanpa target sentuh < 24 px pada 7 halaman; navigasi Tab di setiap halaman memberi fokus yang terlihat (17 Okt 2026).
- [ ] Uji clean-machine Windows dan rekam demo sebelum klaim siap Grand Final.
- [x] Deployment diputuskan pemilik (17 Okt 2026): backend di Render (`rintik-backend.onrender.com`), checkpoint dan data resmi di repo Hugging Face privat dan diunduh saat start; checkpoint tetap diverifikasi SHA256. Mode `RINTIK_LOW_MEMORY=1` membuka checkpoint tanpa torch agar muat di 512 MB; isi identik dengan `torch.load`.
