

## Perubahan Sistem Pembagian Royalti

### Aturan Baru (Berlaku untuk SEMUA label, tanpa pengecualian)
- **70% → Artis**
- **21% → Label**  
- **9% → Admin**

Tidak ada lagi pengecekan "Soundpub Music" atau perlakuan khusus. Semua label diperlakukan sama.

### Lokasi yang Perlu Diubah

**1. Edge Function `process-royalty-upload/index.ts`** (logika utama saat upload)
- Hapus variabel `isSoundpub` dan semua logika conditional
- Ganti dengan: `adminShare = revenue * 0.09`, `labelShare = revenue * 0.21`, `artistShare = revenue * 0.70`

**2. Database RPC Functions** (migration baru untuk update 3 fungsi)
- `get_royalty_label_breakdown` — hapus CASE WHEN soundpub, ganti dengan flat `* 0.70 / * 0.21 / * 0.09`
- `get_royalty_artist_breakdown` — sama, hapus `is_soundpub` column, flat split
- `get_royalty_track_breakdown` — sama, hapus `is_soundpub` column, flat split

**3. `src/pages/UploadRoyalty.tsx`** (preview revenue split saat upload)
- Hapus logika `isSoundpubLabel` conditional
- Semua label: `artistShare = revenue * 0.70`, `labelShare = revenue * 0.21`, `adminShare = revenue * 0.09`
- Update teks deskripsi dari "Soundpub Music: 70/30 | Label lain: 49/21/30" → "Semua label: 70% Artist, 21% Label, 9% Admin"

**4. `src/pages/RoyaltySummary.tsx`** (teks UI)
- Update CardDescription dari split lama ke "Sistem Share: 70% Artist, 21% Label, 9% Admin"
- Hapus badge "Soundpub" pada label breakdown

### File yang Diubah
| File | Perubahan |
|------|-----------|
| `supabase/functions/process-royalty-upload/index.ts` | Logika split baru |
| `supabase/migrations/new_migration.sql` | Update 3 RPC functions |
| `src/pages/UploadRoyalty.tsx` | Preview split + teks |
| `src/pages/RoyaltySummary.tsx` | Teks deskripsi + hapus badge |

### Catatan Penting
- Perubahan ini **hanya berlaku untuk data baru** (upload baru). Data royalti yang sudah ada di database tidak terpengaruh karena balance sudah dihitung saat upload.
- Jika ingin menghitung ulang balance untuk data lama dengan aturan baru, itu perlu proses terpisah.

