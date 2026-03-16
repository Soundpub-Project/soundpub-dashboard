

## Status Perbaikan (Updated: Maret 2026)

| Masalah | Status | Keterangan |
|---------|--------|------------|
| **1. Royalty Summary & Analytics tidak muncul** | ✅ Selesai | Migrasi ke RPC hooks |
| **2. Artis terhapus masih muncul di form releases** | ✅ Selesai | Edge function + hapus dari tabel artists |
| **3. Samakan fitur releases untuk role artis** | ❌ Belum | Artis masih pakai ArtistReleaseFormDialog beta |
| **AllRoyalties white screen** | ✅ Selesai | ErrorBoundary + null safety + SelectItem filter |

## TODO: Samakan fitur releases untuk role artis

Membutuhkan:
1. Update `Releases.tsx` agar artis membuka `ReleaseFormDialog`
2. Tambah logika auto-set `label_id` dan `artist_name` di `ReleaseFormDialog`
3. Tambah RLS policy untuk artis INSERT/UPDATE releases dan tracks
