

## Perbaikan 3 Masalah: Royalti Tidak Muncul, Bug Hapus Artis, dan Fitur Rilis untuk Artis

### Masalah 1: Ringkasan Royalti tidak muncul di `/dashboard/royalty-summary` dan `/dashboard/analytics`

**Root cause**: Kedua halaman masih menggunakan `fetchAllRoyalties()` yang mengambil semua 21rb+ baris secara sekuensial. Fungsi ini berjalan via RLS, dan untuk role non-admin (label/whitelabel/artist), query akan difilter oleh RLS policies yang mungkin memblokir akses atau sangat lambat. Selain itu, halaman ini tidak pernah dimigrasi ke RPC hooks seperti Dashboard.

**Solusi**: Migrasi `RoyaltySummary.tsx` dan `Analytics.tsx` untuk menggunakan React Query hooks (`useRoyaltyStats`, `useRoyaltyMonthlySummary`, `useRoyaltyPlatformSummary`) untuk KPI dan chart. Untuk data detail (breakdown per track/artist/label), tetap gunakan `fetchAllRoyalties` tapi sebagai background load, bukan blocking.

Namun ada masalah lebih fundamental: **RPC functions saat ini tidak memfilter berdasarkan role**. Fungsi `get_royalty_stats()` dll menggunakan `SECURITY DEFINER` dan query semua data tanpa filter. Untuk non-admin users, ini akan menampilkan data semua orang.

**Solusi lengkap**:
1. Buat versi RPC yang menerima parameter filter (artist_name, label_name) agar bisa digunakan per-role
2. Atau: buat RPC baru yang secara otomatis filter berdasarkan `auth.uid()` dan role user
3. Update `RoyaltySummary.tsx` dan `Analytics.tsx` untuk menggunakan hooks tersebut

### Masalah 2: Artis yang dihapus masih muncul di form releases

**Root cause**: Ketika whitelabel menghapus artis via `DeleteArtistDialog`, edge function `remove-artist-from-label` hanya mengosongkan `parent_label_id` di tabel `profiles`. **Tabel `artists` tidak disentuh sama sekali**. Form releases (`ReleaseFormDialog.tsx` line 294-298) mengambil data artis dari tabel `artists` berdasarkan `label_id`, bukan dari `profiles`.

Jadi flow-nya:
1. Tambah artis → insert ke `profiles` + `artists` table
2. Hapus artis → hanya update `profiles.parent_label_id = null`
3. Form releases → query `artists` table → artis masih ada

**Solusi**: Update edge function `remove-artist-from-label` untuk juga menghapus record dari tabel `artists` ketika artis dikeluarkan dari label.

Tambahan: Implementasi validasi penghapusan - cek apakah artis memiliki releases aktif/pending sebelum mengizinkan penghapusan.

### Masalah 3: Samakan fitur releases untuk role artis

**Saat ini**: Artis menggunakan `ArtistReleaseFormDialog` yang merupakan versi sederhana/beta. Label/Whitelabel menggunakan `ReleaseFormDialog` yang lebih lengkap (multi-track artists, contributors, media upload, ISRC, dll).

**Solusi**: Alihkan artis untuk menggunakan `ReleaseFormDialog` yang sama dengan label/whitelabel, dengan penyesuaian:
1. Di `Releases.tsx`, ubah `handleAddRelease` agar artis juga membuka `ReleaseFormDialog` (bukan `ArtistReleaseFormDialog`)
2. Di `ReleaseFormDialog`, tambahkan logika untuk artis: auto-set `label_id` ke `parent_label_id` artis, auto-set `artist_name` ke nama artis
3. Update RLS policy pada tabel `releases` agar artis bisa INSERT releases (saat ini hanya SELECT)
4. Update RLS policy pada tabel `tracks` agar artis bisa INSERT/UPDATE tracks

### Detail Implementasi

**Database migration:**
- Tambah RLS policy: artis bisa INSERT releases dengan `label_id = parent_label_id` dan `artist_name = full_name`
- Tambah RLS policy: artis bisa UPDATE releases mereka yang statusnya `pending`
- Tambah RLS policy: artis bisa INSERT tracks untuk release mereka
- Tambah RLS policy: artis bisa UPDATE tracks untuk release mereka yang statusnya `pending`

**Edge function diubah:**
- `supabase/functions/remove-artist-from-label/index.ts` — tambah: cek releases aktif/pending, hapus dari tabel `artists`

**File frontend diubah:**
1. `src/pages/RoyaltySummary.tsx` — migrasi ke RPC hooks, fallback fetchAllRoyalties untuk detail
2. `src/pages/Analytics.tsx` — migrasi ke RPC hooks, fallback fetchAllRoyalties untuk comparison
3. `src/pages/Releases.tsx` — artis menggunakan `ReleaseFormDialog`, bukan `ArtistReleaseFormDialog`
4. `src/components/releases/ReleaseFormDialog.tsx` — tambah logika khusus artis (auto-set label_id, artist_name, hide admin-only fields)
5. `supabase/functions/remove-artist-from-label/index.ts` — tambah validasi releases + hapus dari tabel artists

