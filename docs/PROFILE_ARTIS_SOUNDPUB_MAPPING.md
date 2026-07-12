# Mapping Perombakan Profile Artis ke Schema SoundPub

Dokumen ini menyelaraskan perombakan dari task **Profile Artis** dengan schema aktif `soundpub`.

## Prinsip Utama

- Semua tabel aplikasi berada di schema `soundpub`, bukan `public`.
- Role `label` dapat membuat artis tanpa input email/password dari UI.
- UUID artis tetap berasal dari `auth.users.id`, supaya relasi lama (`profiles`, `releases`, `tracks`, `royalties`) tetap kompatibel.
- Metadata artis (`genre`, `artist_type`, `social_links`) dibuat dari Edge Function `create-user` memakai service role, bukan langsung dari browser.
- Browser hanya dipakai untuk upload avatar dan update `profiles.avatar_url` setelah user artis berhasil dibuat.

## Mapping Field Form Label

| Form Label | Tabel | Kolom | Catatan |
| --- | --- | --- | --- |
| Nama Artist | `soundpub.profiles` | `full_name` | Nama utama untuk list user/artis |
| Nama Artist | `soundpub.artist_profiles` | `artist_name` | Nama profil artist detail |
| Genre | `soundpub.artist_profiles` | `genre` | Dibuat server-side oleh `create-user` |
| Jenis Konten | `soundpub.artist_profiles` | `artist_type` | Default fallback `solo` |
| Terdaftar Spotify | `soundpub.artist_profiles` | `social_links.spotify` | Boolean dalam JSON |
| Terdaftar Apple Music | `soundpub.artist_profiles` | `social_links.apple_music` | Boolean dalam JSON |
| Foto Artist | `storage.avatars` | path `{artistUserId}/...` | Setelah upload, URL disimpan ke `soundpub.profiles.avatar_url` |
| Label Pemilik | `soundpub.profiles` | `parent_label_id` | Sama dengan `auth.uid()` milik label |
| Role Artis | `soundpub.user_roles` | `role = artist` | Di-upsert oleh `create-user` |
| Lookup rilis | `soundpub.artists` | `name`, `label_id` | Dipakai fallback/dropdown release form |

## Alur Tambah Artist Role Label

1. Label membuka `dashboard/my-artists`.
2. UI membuka `LabelAddArtistDialog` tanpa field email/password.
3. UI memanggil Edge Function `create-user` dengan `role = artist`, `parent_label_id`, `genre`, `artist_type`, dan `social_links`.
4. Edge Function membuat `auth.users` dengan dummy email `artist_{uuid}@managed.soundpub.local`.
5. Trigger membuat `soundpub.profiles` dan default role.
6. Edge Function mengubah role menjadi `artist`, set `parent_label_id`, set `artist_profile_completed`, insert/upsert `soundpub.artist_profiles`, dan sync `soundpub.artists`.
7. Jika ada foto, UI upload ke bucket `avatars` pada folder ID artis dan update `soundpub.profiles.avatar_url`.

## Dampak ke Royalty dan Rilis

- Release baru harus menyimpan `releases.artist_user_id` jika artis dipilih dari profile valid.
- Royalty upload akan memakai `tracks.artist_user_id` / `releases.artist_user_id` untuk menghitung `artist_revenue`.
- Jika artis hanya ada di `soundpub.artists` tanpa profile/user, maka dropdown tetap bisa menampilkan nama, tetapi `artist_user_id` akan `null`; kondisi ini dapat membuat `artist_share = 0` untuk data tertentu.
- Karena perombakan baru tetap membuat `auth.users` + `profiles`, artis baru dari role `label` harus menghasilkan `artist_user_id` valid dan artist share tidak 0 untuk rilis baru.

## SQL Yang Wajib Dijalankan

Jalankan file berikut di SQL Editor Supabase untuk schema `soundpub`:

```sql
-- file lengkap:
-- supabase/migrations/20260712000000_artist_deletion_requests.sql
```

File tersebut membuat/merapikan:

- `soundpub.artist_deletion_requests`
- kolom metadata tambahan di `soundpub.artist_profiles`
- unique index `artist_profiles(user_id)`
- RLS policy untuk label mengelola artist profile miliknya
- grant eksplisit untuk role `authenticated`
- `NOTIFY pgrst, 'reload schema'`

## Checklist Uji Coba

1. Login sebagai role `label`.
2. Buka `dashboard/my-artists`.
3. Tambah artis baru tanpa email/password.
4. Pastikan artis muncul sebagai card.
5. Buka tambah rilis dan pastikan artis muncul di pilihan artist.
6. Buat rilis draft/pending dengan artis tersebut.
7. Cek database:
   - `soundpub.profiles.parent_label_id` = ID label
   - `soundpub.user_roles.role` = `artist`
   - `soundpub.artist_profiles.user_id` = ID artis
   - `soundpub.artists.label_id` = ID label
   - `soundpub.releases.artist_user_id` terisi saat rilis dibuat
8. Upload royalty test untuk track artis tersebut.
9. Pastikan `artist_revenue` tidak 0 jika `artist_user_id` terhubung.
