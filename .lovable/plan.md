

## Status Perbaikan dari Plan Sebelumnya

Berdasarkan review kode saat ini:

| Masalah | Status | Keterangan |
|---------|--------|------------|
| **1. Royalty Summary & Analytics tidak muncul** | **Sudah selesai** | `RoyaltySummary.tsx` dan `Analytics.tsx` sudah menggunakan RPC hooks (`useRoyaltyStats`, `useRoyaltyMonthlySummary`, dll) |
| **2. Artis terhapus masih muncul di form releases** | **Sudah selesai** | Edge function `remove-artist-from-label` sudah menghapus dari tabel `artists` (line 132-143) dan validasi releases aktif (line 103-123) |
| **3. Samakan fitur releases untuk role artis** | **Belum dikerjakan** | `Releases.tsx` masih menggunakan `ArtistReleaseFormDialog` untuk artis (bukan `ReleaseFormDialog`) |
| **AllRoyalties white screen** | **Sudah selesai** | ErrorBoundary + null safety + SelectItem filter sudah diterapkan |

---

## Rencana: Update TODO.md dan File Migrasi

### 1. Update `TODO.md`

Tambahkan item baru ke bagian "Sudah Dikerjakan":
- AllRoyalties white screen fix (ErrorBoundary, null safety, SelectItem filter)
- RoyaltySummary migrasi ke RPC hooks
- Analytics migrasi ke RPC hooks
- Remove-artist-from-label: validasi releases + hapus dari tabel artists

Pindahkan "Samakan fitur releases untuk role artis" ke bagian "Belum Dikerjakan" karena belum diimplementasi.

### 2. Update File Migrasi (`public/exports/full-schema-v2.sql`)

- Update tanggal/versi header
- Tidak ada perubahan schema yang diperlukan dari perbaikan terakhir (perubahan hanya di frontend dan edge function)

### 3. Update `.lovable/plan.md`

- Tandai masalah 1 dan 2 sebagai selesai
- Masalah 3 tetap sebagai TODO

---

## Catatan: Masalah 3 Belum Dikerjakan

Fitur "Samakan releases form untuk artis" (agar artis menggunakan `ReleaseFormDialog` lengkap, bukan `ArtistReleaseFormDialog` beta) **belum diimplementasi**. Ini membutuhkan:
- Update `Releases.tsx` agar artis membuka `ReleaseFormDialog`
- Tambah logika auto-set `label_id` dan `artist_name` di `ReleaseFormDialog`
- Tambah RLS policy untuk artis INSERT/UPDATE releases dan tracks

Apakah ingin saya implementasi ini juga setelah update TODO dan migrasi?

