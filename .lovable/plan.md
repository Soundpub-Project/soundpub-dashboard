# Plan: Gmail Connector, Google Drive Backup, & Penamaan File Storage

Tiga perubahan terpisah yang akan dikerjakan dalam satu batch.

---

## 1. Migrasi Notifikasi Email: Resend → Gmail Connector

**Saat ini:** `supabase/functions/send-royalty-notification/index.ts` pakai `RESEND_API_KEY` + `resend@4.0.0`.

**Rencana:**

- Hubungkan **Gmail connector** (`google_mail`) lewat tool `standard_connectors--connect`. Connector ini mengirim email DARI akun Gmail milik kamu (admin/owner workspace), bukan dari user-end.
- Refactor edge function `send-royalty-notification` agar:
  - Hapus dependency Resend.
  - Pakai Gmail API via gateway: `https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send`.
  - Build pesan RFC 2822 (To, Subject, HTML body) → base64url encode → kirim sebagai `{ raw }`.
  - Header: `Authorization: Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${GOOGLE_MAIL_API_KEY}`.
  - Scope yang dibutuhkan: `gmail.send`.
- Edge function lain yang kirim email (kalau ada — akan saya scan ulang) ikut dimigrasi dengan helper kecil (`sendGmail(to, subject, html)`).
- `RESEND_API_KEY` dibiarkan di secrets (tidak dihapus, jaga-jaga rollback) tapi tidak dipakai lagi.

**Catatan:** Karena pakai Gmail pribadi/akun yang di-connect, ada batas kirim Gmail (~500 email/hari untuk akun gratis, 2000/hari untuk Workspace). Cocok untuk volume notifikasi internal admin, tidak cocok untuk blast ke ribuan user.

---

## 2. Backup Harian Storage → Google Drive

**Tujuan:** Setiap hari, semua file di bucket Supabase Storage di-mirror ke folder Google Drive.

**Rencana:**

- Hubungkan **Google Drive connector** (`google_drive`) — file akan ditaruh di Drive milik akun yang di-connect.
- Buat edge function baru `backup-storage-to-drive`:
  - List semua bucket: `track-audio`, `track-video`, `audio-clips`, `release-covers`, `label-logos`, `avatars`, `iccn-gallery`, `klikus-biolink`.
  - Untuk tiap file, generate signed URL (private bucket) atau public URL, download blob.
  - Upload ke Google Drive via gateway: `POST https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart`.
  - Struktur folder Drive: `SoundPub-Backup/YYYY-MM-DD/{bucket-name}/{file-path}`.
  - **Incremental:** Simpan tabel baru `storage_backup_log` (file_path, bucket, last_backed_up_at, drive_file_id) supaya hanya file baru/berubah yang di-upload ulang, sisanya di-skip. Hemat kuota Drive & waktu eksekusi.
- Buat tabel `storage_backup_runs` (id, started_at, finished_at, files_uploaded, files_skipped, errors, status) untuk audit & UI status.
- Schedule via `pg_cron` + `pg_net` setiap hari jam 02:00 WIB (19:00 UTC):
  ```sql
  select cron.schedule('daily-storage-backup', '0 19 * * *',
    $$ select net.http_post(url:='...functions/v1/backup-storage-to-drive',
       headers:='{"apikey":"..."}'::jsonb, body:='{}'::jsonb); $$);
  ```
- Tambah halaman kecil di Settings (admin only) untuk melihat status backup terakhir & trigger manual.

**Risiko & mitigasi:**

- Edge function timeout (default ~150s) → proses dalam batch 50 file/run, simpan cursor, kalau belum selesai schedule next run otomatis.
- File besar (audio WAV bisa ratusan MB) → stream langsung dari signed URL ke Drive multipart upload, jangan buffer penuh di memori.
- Kuota Drive akun gratis 15GB. Saya akan tampilkan warning di UI; kalau perlu, user upgrade ke Drive berbayar atau ganti akun service.

---

## 3. Rename File Storage Pakai Nama Asli

**Saat ini, semua file disimpan dengan nama generic + timestamp:**


| File       | Pattern sekarang                               | Lokasi                       |
| ---------- | ---------------------------------------------- | ---------------------------- |
| Cover      | `cover-{timestamp}.{ext}`                      | `ReleaseFormDialog.tsx:502`  |
| Full Audio | `audio-{trackIdx}-{timestamp}.{ext}`           | `MediaUploadSection.tsx:113` |
| Audio Clip | `clip-{trackIdx}-{timestamp}.{ext}`            | sda                          |
| Logo       | `label-logo-{type}-{userId}-{timestamp}.{ext}` | `LabelLogoSettings.tsx:59`   |


**Pattern baru (deskriptif + tetap unik):**


| File          | Pattern baru                                                              |
| ------------- | ------------------------------------------------------------------------- |
| Cover release | `{labelId}/{releaseTitle-slug}-{timestamp6}.{ext}`                        |
| Full audio    | `{labelId}/{releaseTitle-slug}/{trackTitle-slug}-full-{timestamp6}.{ext}` |
| Audio clip    | `{labelId}/{releaseTitle-slug}/{trackTitle-slug}-clip-{timestamp6}.{ext}` |
| Logo label    | `{labelId}/logo-{type}-{timestamp6}.{ext}`                                |
| Avatar        | `{userId}/avatar-{timestamp6}.{ext}`                                      |


**Kenapa hybrid (nama + timestamp pendek)?**

- Nama asli saja → bentrok kalau judul sama, plus karakter aneh (spasi, emoji, slash) bikin error storage.
- Solusi: slugify judul (lowercase, ganti non-alphanumeric ke `-`, batasi 60 char) + suffix 6-digit base36 timestamp untuk anti-collision.
- Folder per `labelId`/`userId` mempermudah RLS storage policy & audit.

**Implementasi:**

- Buat helper `src/lib/storageNaming.ts`: `slugify(text)`, `buildCoverPath(labelId, releaseTitle, ext)`, `buildAudioPath(...)`, `buildClipPath(...)`, `buildLogoPath(...)`, `buildAvatarPath(...)`.
- Update 4 file upload caller agar pakai helper.
- **File lama TIDAK di-rename** (terlalu berisiko — banyak URL di DB sudah point ke path lama). Hanya file baru yang pakai pattern baru. Existing files tetap berfungsi.
- Storage RLS policy untuk bucket private (`track-audio`, `release-covers`) perlu dicek ulang supaya pattern `{labelId}/...` tetap masuk policy. Kalau perlu, saya tambahkan policy baru.

---

## Urutan Eksekusi

1. **Connect Gmail + Google Drive connector** (lewat tool, user pilih akun).
2. **Migrasi email** ke Gmail (refactor `send-royalty-notification`).
3. **Buat backup system**: migration tabel + edge function + cron schedule + UI status.
4. **Refactor penamaan file**: helper + update 4 caller.
5. Verifikasi: kirim test email, trigger backup manual, upload test file untuk lihat nama baru.

## Hal yang Perlu Konfirmasi Kamu

- **Akun Gmail untuk kirim email**: nanti waktu connect dialog, pilih akun yang mau jadi pengirim notifikasi (mis. `noreply@soundpub.xyz` atau Gmail admin kamu).  
Jawaban: Emailnya samakan dengan Email yang sudah terhubung dengan gmail Connector `publishersoundpub@gmail.com`
- **Akun Google Drive untuk backup**: bisa sama atau beda dari Gmail. Pastikan punya storage cukup (estimate dari current bucket size).  
Jawaban: Google Drive nya sudah besar, sebesar 2TB
- **File lama** dibiarkan dengan nama lama, atau mau saya buatkan script one-off untuk rename semuanya juga? (Default: dibiarkan, lebih aman.)  
Jawaban: Di biarkan sama, untuk uploadtan baru akan di ganti namanya.  


# CATATAN

Berhubung Credit aku tinggal sedikit, kamu implementasikan Gmail dan Google Drive dulu. Dan buatkan TODO plan scema ini.