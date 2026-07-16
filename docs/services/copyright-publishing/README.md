# Copyright / Publishing Service

Folder ini menjadi pusat dokumentasi dan implementasi service Hak Cipta / Publishing Soundpub.

## Aturan Penting

- Semua update terkait service Hak Cipta/Publishing disimpan di folder ini.
- Database Soundpub memakai schema `soundpub`.
- Jangan mengubah schema selain `soundpub` kecuali ada instruksi eksplisit.
- Referensi ke `auth.users` boleh dipakai untuk FK/auth, tetapi jangan mengubah schema `auth`.
- Credential, password, token, dan secret tidak boleh disimpan di repo.

## File Utama

- `FEATURE_PLAN.md` — rancangan produk dan teknis service.
- `TODO.md` — progress/tahapan kerja service.
- `deployment-notes.md` — catatan deploy migration dan lingkungan database.

## Migration Terkait

- `../../../supabase/migrations/20260717090000_copyright_publishing_registration.sql`

## Keputusan MVP

- Pendaftaran wajib login.
- User bisa simpan draft.
- Draft kontrak PDF boleh diunduh sebelum bayar dengan watermark.
- Submit final membutuhkan pembayaran `Rp100.000`.
- Biaya `Rp100.000` sudah termasuk 1 e-Meterai untuk MVP.
- E-Meterai MVP manual/semi-manual oleh admin; API disiapkan untuk fase lanjut.
- Fase awal memakai model 1 akun = 1 `composer_code`.
- Matching royalti wajib berbasis `composer_code`.
