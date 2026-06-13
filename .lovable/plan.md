# Fix: Auto Clip gagal memuat audio (HTTP 400)

## Penyebab
Bucket `track-audio` bersifat **private**. Saat `AudioClipCutterDialog` dibuka untuk track yang sudah ada di DB, `audio_url` yang tersimpan adalah URL publik (`/storage/v1/object/public/track-audio/...`) — entah karena diupload sebelum kode signed-URL ada, atau karena pernah jatuh ke fallback `getPublicUrl`. `fetch()` ke URL publik bucket privat mengembalikan 400, sehingga decode audio gagal.

Signed URL juga punya kedaluwarsa (1 tahun di kode upload), jadi URL lama bisa expired walaupun benar formatnya.

## Solusi
Sebelum fetch audio di dalam cutter, **resolve ulang URL** menjadi signed URL yang fresh bila URL menunjuk ke object di bucket `track-audio`. Logikanya tidak menyentuh data DB — hanya konversi runtime sebelum decode.

### Detail teknis

1. Tambah helper baru `resolveTrackAudioUrl(url: string): Promise<string>` di `src/lib/audioClipper.ts`:
   - Deteksi pola `/storage/v1/object/(public|sign)/track-audio/<path>` dari URL apa pun (public maupun signed yang sudah expired) dengan regex.
   - Ambil `<path>` (strip query string seperti `?token=...`).
   - Panggil `supabase.storage.from('track-audio').createSignedUrl(path, 60 * 60)` untuk URL 1 jam.
   - Jika regex tidak cocok (bukan URL track-audio, mis. blob/data URL saat baru di-upload), kembalikan URL aslinya.
   - Jika `createSignedUrl` gagal, lempar error dengan pesan jelas ("Gagal mengakses file audio").

2. Update `AudioClipCutterDialog.tsx` (effect di sekitar baris 51): sebelum memanggil `decodeAudioFromUrl(audioUrl)`, panggil `resolveTrackAudioUrl(audioUrl)` terlebih dahulu, lalu decode hasilnya. Tag pesan error sudah memakai bahasa Indonesia ("Gagal memuat audio") — tetap dipertahankan.

3. Tidak ada perubahan skema, RLS, atau bucket policy. Tidak ada perubahan ke `MediaUploadSection` — file baru tetap di-upload sebagai signed URL seperti sekarang.

## Yang TIDAK diubah
- Bucket `track-audio` tetap **private** (sesuai postur keamanan saat ini).
- Data `tracks.audio_url` yang sudah ada di DB tidak ditulis ulang — resolver bekerja on-the-fly. (Migrasi data opsional bisa dibahas terpisah jika ingin men-standardkan semua URL lama menjadi storage-path-only.)

## File yang akan disentuh
- `src/lib/audioClipper.ts` — tambah helper `resolveTrackAudioUrl`.
- `src/components/releases/AudioClipCutterDialog.tsx` — pakai helper sebelum decode.
