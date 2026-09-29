# Sinkron Delta Soundpub — `20.20.20.173` → `20.20.20.3`

Menyalin perubahan yang terjadi di server lama setelah migrasi awal, ke server baru.
Aman dijalankan berulang kali (idempoten). **Server lama tidak pernah ditulis.**

## Cara pakai

```bash
./sinkron-delta.sh --dry-run     # lihat apa yang akan berubah, tidak menulis apa pun
./sinkron-delta.sh               # jalankan sinkron
./sinkron-delta.sh --verify      # hanya verifikasi, tanpa menyalin
```

Jalankan dari laptop. Butuh SSH key ke kedua server (tanpa password).

## Urutan yang harus diikuti

1. **Freeze dulu.** Hentikan akses tulis ke server lama — matikan container `functions`/`rest`
   di sana, atau umumkan ke admin agar berhenti memakai dashboard lama.
2. `./sinkron-delta.sh` — sinkron final.
3. `./sinkron-delta.sh --verify` — pastikan nol selisih.
4. Arahkan frontend ke `https://supabase.carubra.space`.
5. Baru boleh menghapus storage di server lama.

Menjalankan sinkron **tanpa** freeze tetap berguna (memperkecil delta), tapi hasilnya
tidak akan pernah nol selama admin masih menulis ke server lama.

## Apa yang disinkron

| Bagian | Cara | Konflik |
|---|---|---|
| File storage | tar via laptop, hanya objek yang belum ada | tidak mungkin — additive |
| `storage.objects` | INSERT `ON CONFLICT DO NOTHING` | baris lama dipertahankan |
| xattr | dibangun ulang dari `storage.objects.metadata` | — |
| `auth.users` / `identities` | UPSERT, hanya user Soundpub | server lama menang |
| 31 tabel `soundpub` | UPSERT per PK, urut FK | server lama menang |

Kolom URL otomatis ditulis ulang `supabase.carubra.com` → `supabase.carubra.space`
saat masuk ke server baru.

## Batas yang disengaja

- **Penghapusan tidak diikuti.** Baris yang dihapus di server lama tetap ada di server
  baru. Ini pilihan sadar: selama migrasi, kehilangan data lebih berbahaya daripada
  kelebihan baris. Setelah cutover masalah ini hilang dengan sendirinya.
- **Hanya tenant Soundpub.** User yang juga punya baris di `utero_academy.user_profiles`
  (19 orang) sengaja dilewati — lihat `migrasi-soundpub-ke-server-baru` di memory.
  Filternya dipasang di `profiles` dan `user_roles` saja; diperiksa 2026-09-30 bahwa
  ke-19 user itu tidak punya baris di tabel Soundpub lain (`artist_profiles`, `artists`,
  `releases`, `notifications`, `auth_events`, `copyright_registrations` semuanya nol).
  Kalau nanti mereka mulai punya data Soundpub, tambahkan tabelnya ke
  `filter_user_tabel()` di `lib-sql.sh` — tanpa itu insert akan gagal karena FK.
- **File sidecar TUS (`*.json`) dilewati.** Itu metadata upload, bukan data.
- `soundpub.audit_logs` disalin apa adanya tanpa rewrite URL — isinya riwayat historis.

## Berkas

- `sinkron-delta.sh` — skrip utama
- `lib-sql.sh` — query SQL yang dipakai skrip
- `setxattr.js` — dijalankan di dalam container storage server baru

## Membaca keluaran

Pada bagian **Delta database**, selisih diberi label berbeda:

- `KURANG n` — server baru ketinggalan; ini yang akan disinkron.
- `(lebih, dibiarkan)` — server baru punya lebih banyak baris. Wajar untuk
  `audit_logs` dan `auth_events`: server baru mencatat aktivitas pengujiannya
  sendiri. Sinkron hanya menambah, tidak pernah menghapus.

Jumlah baris sama **tidak** berarti isi sama — `UPDATE` di server lama tidak
mengubah jumlah baris. UPSERT tetap dijalankan untuk semua baris, jadi perubahan
semacam itu ikut tersalin walau tidak muncul di tabel selisih.
