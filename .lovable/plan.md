

## Plan: Fix "0 Record" Bug + Whitelabel Royalty Not Updating

### Investigasi & Temuan

**Bug 1: "(0 record)" di dialog hapus**

Semua record di tabel `royalty_uploads` menunjukkan `inserted_records = 0` dan `status = 'processing'`, meskipun data royalti SUDAH berhasil masuk (contoh: upload "LAPORAN MARET - FIX.csv" punya 603 royalti di database). Artinya edge function `process-royalty-upload` berhasil insert data, tapi GAGAL atau TIDAK SEMPAT menjalankan step terakhir:
```
await supabaseAdmin.from('royalty_uploads').update({ status: 'completed', inserted_records: inserted })
```
Kemungkinan besar: step update saldo yang berjalan per-label/artis memakan waktu terlalu lama sehingga function timeout sebelum sempat update upload record.

**Bug 2: Whitelabel balance tidak terupdate**

Ditemukan **name mismatch**: di CSV, label_name = `KADITRUDIT`, tapi di profiles, full_name = `KADIRUDIT`. Karena balance update menggunakan exact match `eq('full_name', name)`, saldo tidak pernah terupdate untuk label ini.

### Solusi

#### 1. Fix `process-royalty-upload` Edge Function
- **Pindahkan update `royalty_uploads` ke SEBELUM balance update** — agar `inserted_records` dan `status` terupdate bahkan jika balance update timeout
- Ubah status flow: `processing` → `inserted` (data masuk) → `completed` (saldo terupdate)
- Tambahkan error handling per-balance update agar satu failure tidak menghentikan seluruh proses

#### 2. Fix UI Display di `UploadRoyalty.tsx`
- Jika `inserted_records = 0` tapi `total_records > 0`, tampilkan `total_records` sebagai fallback di dialog hapus
- Ini menangani data historis yang sudah terlanjur `inserted_records = 0`

#### 3. Fix Name Matching (Case-Insensitive + Trim)
- Di `process-royalty-upload`, gunakan case-insensitive matching (`.ilike()` atau normalisasi) saat mencari profile by label name
- Ini mencegah mismatch akibat typo huruf kecil/besar atau spasi ekstra

### File yang Diedit

| File | Perubahan |
|------|-----------|
| `supabase/functions/process-royalty-upload/index.ts` | Fix: update upload record lebih awal, case-insensitive name matching |
| `src/pages/UploadRoyalty.tsx` | Fix: fallback display saat `inserted_records = 0` |

