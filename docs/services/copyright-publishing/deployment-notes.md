# Deployment Notes — Copyright / Publishing Service

Update: 2026-07-17

## Database Target

- Project menggunakan schema aplikasi `soundpub`.
- Jangan ubah schema lain seperti `public`, `finance`, `extensions`, atau `auth` dalam task service ini.
- Remote DB self-hosted bisa diakses melalui Supavisor/pooler.
- Port host `5432` mengarah ke pooler, bukan direct Postgres container.

## Koneksi Pooler

Format yang berhasil untuk lint/check remote:

```powershell
$env:PGPASSWORD="<password>"
supabase db lint --db-url "postgres://postgres.<POOLER_TENANT_ID>@20.20.20.173:5432/postgres?sslmode=disable" --schema soundpub --debug
Remove-Item Env:PGPASSWORD
```

Catatan: credential jangan disimpan di repo.

## Migration History

Remote DB belum memiliki tabel `supabase_migrations.schema_migrations`.
Karena itu, jangan memakai `supabase db push` untuk saat ini, karena semua migration lokal akan dianggap pending.

## Cara Deploy yang Disarankan

Deploy migration Hak Cipta secara spesifik saja:

- File migration: `supabase/migrations/20260717090000_copyright_publishing_registration.sql`
- Apply melalui `psql` atau SQL editor/admin tool yang menjalankan file spesifik tersebut.
- Jangan deploy migration lain di luar service ini tanpa keputusan eksplisit.

## Validasi Terakhir

- `supabase db lint --schema soundpub` berhasil konek ke remote DB.
- Issue existing di schema `soundpub`:
  - `soundpub.repair_orphan_artist_link`
  - error: `function min(uuid) does not exist`
- Issue tersebut tidak berasal dari migration service Hak Cipta.
