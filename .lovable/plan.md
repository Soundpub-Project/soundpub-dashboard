## Tujuan

Menambah email notifikasi untuk **4 event** lewat Gmail connector yang sudah aktif (`publishersoundpub@gmail.com`), dengan **sistem opt-in** — user hanya menerima email kalau preferensinya aktif.

## Arsitektur

```text
Event (DB trigger / Edge Function)
   │
   ▼
notifications (in-app) ──► realtime → lonceng
   │
   ▼ (jika user opt-in)
send-app-email (edge function baru, generic)
   │
   ▼
Gmail connector gateway → inbox user
```

Satu edge function generik `send-app-email` dipakai semua trigger, dengan parameter `templateName` + `templateData`. Lebih maintainable dari bikin function per event.

## Tahap Implementasi

### 1. Skema database

**Migration baru:**

- Tambah kolom ke `profiles`:
  - `email_notif_payout boolean default true`
  - `email_notif_release boolean default true`
  - `email_notif_payment boolean default true`
  - `email_notif_announcement boolean default true`
- Tabel `email_send_log` (audit: template, recipient, status, error, created_at) untuk troubleshooting

### 2. Edge function generic: `send-app-email`

Input: `{ templateName, recipientUserId | recipientEmail, templateData, idempotencyKey? }`

Tugas:

1. Resolve email + cek kolom opt-in yang sesuai (`email_notif_<scope>`)
2. Skip kalau opt-out → log `suppressed`
3. Render template HTML berdasarkan `templateName`
4. Kirim via Gmail gateway (reuse helper `sendGmail` dari `send-royalty-notification`)
5. Insert ke `email_send_log`

Template yang dibuat (HTML inline, sesuai gaya `send-royalty-notification`):

- `payout-requested` (ke admin)
- `payout-approved` / `payout-rejected` / `payout-paid` (ke user)
- `release-submitted` (ke admin) / `release-approved` / `release-rejected` (ke artist)
- `payment-success` (ke pembayar release)
- `announcement` (ke user opt-in)

### 3. Wire trigger di tiap event


| Event                         | Lokasi                                                      | Aksi                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Payout request baru           | `src/pages/Payouts.tsx` (create request)                    | invoke `send-app-email` template `payout-requested` ke semua admin                                                             |
| Payout approved/rejected/paid | `src/pages/AdminPayouts.tsx` (status update)                | invoke template `payout-<status>` ke pemilik payout                                                                            |
| Release submitted             | `ReleaseFormDialog` / `ArtistReleaseFormDialog` saat submit | template `release-submitted` ke admin                                                                                          |
| Release approved/rejected     | `src/pages/Releases.tsx` admin action                       | template `release-<status>` ke artist                                                                                          |
| Payment success               | `supabase/functions/xendit-webhook` setelah invoice paid    | template `payment-success` ke `release.label_id` user                                                                          |
| Announcement                  | `AnnouncementDialog` (fix)                                  | loop user yang `email_notif_announcement = true`, kirim per orang (rate-limit 1 req/300ms supaya tidak kena Gmail quota burst) |


### 4. UI Settings — toggle opt-in

Tambah section baru di `src/pages/Settings.tsx`: **"Notifikasi Email"**

- 4 switch: Payout, Release, Payment, Pengumuman
- Default semua ON (sesuai default kolom)
- Catatan kecil: "Notifikasi in-app tetap aktif walau email dimatikan"

### 5. Fix `AnnouncementDialog`

- Ganti call dari `send-royalty-notification` → `send-app-email` template `announcement`
- Backend loop user opt-in, batching 50/batch dengan delay supaya aman ke quota Gmail (~500/hari)
- Tampilkan estimasi penerima sebelum kirim

### 6. Logging & monitoring

- Semua kiriman tercatat di `email_send_log`
- (Opsional, di luar scope plan ini) UI admin sederhana untuk lihat log — bisa tahap berikutnya

## Catatan Teknis

- **Quota Gmail:** ~500 email/hari untuk akun Gmail biasa. Payout/Release/Payment volumenya rendah (aman). Announcement berisiko — sistem opt-in + batching mengurangi blast radius.
- **Tidak migrasi ke Lovable Emails** karena user sudah commit ke Gmail connector dan domain belum ada.
- **Idempotency:** key = `<event>-<row_id>-<status>` supaya retry/double-trigger tidak duplikasi.
- **Tidak ada perubahan** ke `send-royalty-notification` (sudah jalan, biarkan).
- **RLS:** kolom opt-in cuma boleh diedit owner; sudah cover via policy `profiles` existing yang allow self-update non-privileged field.

## Yang TIDAK termasuk plan ini

- Email untuk security event (password/role change) — bisa tahap berikut
- Email backup harian summary — bisa tahap berikut
- Migrasi ke domain custom (`notify.soundpub.xyz`) — Gmail dulu, custom domain kalau volume naik
- Dashboard email monitoring UI

&nbsp;

## Tambahan:

- Untuk fitur upload audio dan clip dan auto clip permision nya di perbaiki. Karena ada beberapa Role tidak bisa upload.