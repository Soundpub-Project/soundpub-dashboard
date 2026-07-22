# TODO — Tahap 2 (setelah Gmail + Backup Drive selesai)

## Selesai ✅
- [x] Migrasi notifikasi email Resend → Gmail connector (`publishersoundpub@gmail.com`)
- [x] Backup harian Supabase Storage → Google Drive (`SoundPub-Backup/YYYY-MM-DD/{bucket}/...`)
  - Tabel: `storage_backup_log`, `storage_backup_runs`
  - Edge function: `backup-storage-to-drive` (incremental, max 40 file/run, max 200MB/file)
  - Cron: `daily-storage-backup` jam 19:00 UTC (02:00 WIB)

## Pending (Tahap 2 — Refactor Penamaan File)

### Helper baru
- [ ] `src/lib/storageNaming.ts`
  - `slugify(text: string): string` — lowercase, non-alnum → `-`, max 60 char, trim
  - `shortStamp(): string` — base36 dari `Date.now()`
  - `buildCoverPath(labelId, releaseTitle, ext)` → `{labelId}/{slug}-{stamp}.{ext}`
  - `buildAudioPath(labelId, releaseTitle, trackTitle, ext)` → `{labelId}/{releaseSlug}/{trackSlug}-full-{stamp}.{ext}`
  - `buildClipPath(labelId, releaseTitle, trackTitle, ext)` → `{labelId}/{releaseSlug}/{trackSlug}-clip-{stamp}.{ext}`
  - `buildLogoPath(labelId, type, ext)` → `{labelId}/logo-{type}-{stamp}.{ext}`
  - `buildAvatarPath(userId, ext)` → `{userId}/avatar-{stamp}.{ext}`

### Caller yang harus diubah
- [ ] `src/components/releases/ReleaseFormDialog.tsx:502` — cover upload
- [ ] `src/components/releases/MediaUploadSection.tsx:113` — full audio + clip upload
- [ ] `src/components/releases/MediaUploadSection.tsx:523` — clip cutter blob
- [ ] `src/components/settings/LabelLogoSettings.tsx:59` — label logo
- [ ] (opsional) avatar upload di profile

### Storage RLS
- [ ] Audit RLS `storage.objects` untuk bucket privat (`track-audio`, `release-covers`) — pastikan path baru `{labelId}/...` tetap masuk policy upload/read sesuai role.

### Catatan
- File **lama tetap** dengan nama lama (URL di DB sudah point ke path lama; tidak di-rename).
- Hanya **upload baru** yang pakai pattern baru.

## Catatan Operasional

### Email (Gmail Connector)
- Pengirim: `publishersoundpub@gmail.com` (akun Gmail terhubung di connector)
- Quota: ~500 email/hari (Gmail) atau 2.000/hari (Workspace). Cukup untuk notifikasi internal.
- Untuk blast besar ke semua user, butuh provider lain (Resend/SendGrid).

### Backup Google Drive
- Akun Drive: terhubung lewat connector (kapasitas 2TB)
- Frekuensi: tiap hari jam 02:00 WIB
- Incremental: file yang `updated_at`-nya tidak berubah akan di-skip
- Max 40 file/run, max 200MB/file (untuk hindari timeout edge function)
- File >200MB akan di-skip (tercatat di error log)
- Trigger manual: POST ke `/functions/v1/backup-storage-to-drive` (admin only via UI nanti)
- Lihat status: query tabel `storage_backup_runs` (UI admin belum dibuat — pending)

### Pending UI
- [ ] Halaman Settings admin: tampilkan riwayat `storage_backup_runs` + tombol "Backup Sekarang"
