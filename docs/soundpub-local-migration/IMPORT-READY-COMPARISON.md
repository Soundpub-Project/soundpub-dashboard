# Perbandingan Perubahan vs Paket Import Soundpub Local Terakhir

Dokumen ini merangkum posisi terakhir folder `docs/Soundpub-local-migration/` setelah rangkaian migrasi Lovable -> Supabase Local schema `Soundpub`.

## Paket Import Terbaru Yang Siap Dipakai

Urutan siap import saat ini adalah:

1. `00-HARDRESET-Soundpub-LOCAL.sql` *(opsional, hanya jika ingin reset total data Soundpub)*
2. `01-reset-and-recreate-Soundpub.sql`
3. `02-initial-seed.sql`
4. `03-align-schema-to-csv.sql`
5. `04-runtime-permissions-and-rpc.sql`
6. `05-royalty-dashboard-rpcs.sql`
7. `06-allow-draft-upc-isrc-empty.sql`
8. `07-release-status-and-nullable-identifiers.sql`
9. `08-user-profile-role-support.sql`
10. `09-storage-buckets-and-policies.sql`
11. `10-reconcile-user-roles-from-csv.sql`
12. `11-signup-default-artist-under-Soundpub.sql`
13. `12-add-missing-royalties-columns.sql`
14. `13-recalculate-royalty-balances.sql`
15. `14-reset-all-profile-balances.sql` *(opsional, hanya untuk reset saldo manual)*
16. `15-scan-orphan-artist-data.sql` *(audit/helper)*
17. `16-normalize-Soundpub-split-and-recalculate.sql`
18. `17-role-aware-royalty-rpcs.sql`
19. `18-repair-artist-role-links.sql`
20. `19-backfill-artist-share.sql`
21. `pnpm import:csv`

> Untuk reset + import bersih, jalankan `00`, lalu `01` sampai `19`, lalu `pnpm import:csv`.

## Perubahan Besar Setelah Import Awal

| Area | File | Fungsi |
| --- | --- | --- |
| Hard reset | `00-HARDRESET-Soundpub-LOCAL.sql` | Menghapus schema `Soundpub`, auth users terkait `Soundpub.profiles`, dan object storage Soundpub yang aman dihapus |
| Schema awal | `01-reset-and-recreate-Soundpub.sql` | Membuat ulang schema utama Soundpub |
| CSV alignment | `03-align-schema-to-csv.sql` | Menyesuaikan kolom database dengan data CSV Lovable |
| Runtime/RPC | `04-runtime-permissions-and-rpc.sql` | Permission runtime dan helper RPC dasar |
| Dashboard royalty | `05-royalty-dashboard-rpcs.sql` | RPC awal untuk dashboard royalty |
| Draft release | `06`, `07` | Mengizinkan UPC/ISRC kosong untuk draft/pending |
| Role/profile | `08`, `10`, `11`, `18` | Perbaikan role, default signup artist, repair role artist dari CSV/data lama |
| Storage | `09-storage-buckets-and-policies.sql` | Bucket dan policy upload untuk cover/audio/avatar/template |
| Royalty columns | `12` | Menambah kolom royalty yang hilang |
| Balance | `13`, `14`, `16`, `19` | Recalculate balance/share, reset saldo, normalisasi split, backfill artist share |
| Audit orphan | `15` | Scan data orphan artist/profile/release |
| Role-aware RPC | `17` | RPC dashboard/analytics/summary tidak lagi bocor data antar role |

## Perubahan Yang Baru Kita Tambahkan Dalam Kode App

| Area | File | Perubahan |
| --- | --- | --- |
| Profile Artis label | `src/components/users/LabelAddArtistDialog.tsx` | Label tambah artis tanpa email/password, mengirim metadata artis ke edge function |
| Create user | `supabase/functions/create-user/index.ts` | Generate dummy email, set role artist, set `parent_label_id`, buat/upsert `artist_profiles`, sync `artists` |
| Release form | `src/components/releases/ReleaseFormDialog.tsx` | Release dan track sekarang mengisi `artist_user_id` dari pilihan artis |
| Royalty upload | `supabase/functions/process-royalty-upload/index.ts` | Fallback mapping `artist_user_id` dari nama artis + label jika track/release belum punya ID |
| Edit artist | `src/components/users/EditArtistDialog.tsx` | Menyamarkan dummy email managed artist |
| Profile mapping docs | `docs/PROFILE_ARTIS_Soundpub_MAPPING.md` | Dokumen mapping form -> schema `Soundpub` dan dampak royalty |

## Perbandingan Dengan Database Import Terakhir

### Sebelum perubahan terbaru

- Import CSV bisa masuk, tetapi banyak baris royalty hanya punya nama artis, bukan `artist_user_id`.
- Jika `artist_user_id` kosong, sistem menghitung:
  - `artist_revenue = 0`
  - label menerima 70% untuk kasus label selain Soundpub
  - hasil UI menampilkan `Artist Share` nol.
- Release form juga belum selalu menyimpan `tracks.artist_user_id`, sehingga royalty upload berikutnya tetap sulit map ke artis.

### Setelah perubahan terbaru

- Artis baru dari role `label` tetap punya `auth.users.id` + `Soundpub.profiles.id`.
- `Soundpub.artist_profiles` dibuat oleh `create-user` edge function memakai service role.
- Release baru menyimpan `releases.artist_user_id` dan `tracks.artist_user_id`.
- Royalty upload punya fallback mapping nama artis + label ke `artist_user_id`.
- SQL `19-backfill-artist-share.sql` dapat memperbaiki data lama dan menghitung ulang share.

## SQL Yang Wajib Ada Untuk Import Bersih

Minimal setelah import CSV, jalankan ulang/akhirkan dengan:

```sql
-- Normalisasi split dan label Soundpub
-- docs/Soundpub-local-migration/16-normalize-Soundpub-split-and-recalculate.sql

-- RPC role-aware
-- docs/Soundpub-local-migration/17-role-aware-royalty-rpcs.sql

-- Repair role/profile artist
-- docs/Soundpub-local-migration/18-repair-artist-role-links.sql

-- Backfill artist_user_id + recalculate share
-- docs/Soundpub-local-migration/19-backfill-artist-share.sql
```

## Checklist Verifikasi Setelah Import

Jalankan query berikut setelah `19-backfill-artist-share.sql`:

```sql
SELECT
  COALESCE(label_name, '-') AS label_name,
  SUM(COALESCE(net_revenue, 0)) AS total_revenue,
  SUM(COALESCE(artist_revenue, 0)) AS artist_share,
  SUM(COALESCE(label_revenue, 0)) AS label_share,
  SUM(COALESCE(Soundpub_revenue, 0)) AS admin_share,
  COUNT(*) FILTER (WHERE artist_user_id IS NULL) AS rows_without_artist_user_id
FROM Soundpub.royalties
GROUP BY COALESCE(label_name, '-')
ORDER BY rows_without_artist_user_id DESC, total_revenue DESC;
```

Target hasil:

- Label yang punya artis valid harus punya `artist_share > 0`.
- `rows_without_artist_user_id` idealnya turun signifikan.
- Jika masih ada `rows_without_artist_user_id`, berarti data nama artis di royalty/release tidak cocok dengan `profiles.full_name` atau `artist_profiles.artist_name` di bawah label tersebut.

## Catatan Penting Multi-Project Supabase Local

Karena Supabase localhost ini dipakai beberapa project/schema, file hard reset sengaja **tidak** menjalankan `DROP DATABASE` dan **tidak** menghapus schema lain. Reset hanya menyasar:

- `Soundpub` schema
- `auth.users` yang ID-nya pernah tercatat di `Soundpub.profiles`
- object storage bucket Soundpub yang owner-nya user Soundpub

Ini supaya project lain di Supabase local tetap aman.
