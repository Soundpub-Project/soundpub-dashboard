# Kumpulan query SQL untuk sinkron-delta.sh. Di-source, bukan dijalankan sendiri.
# shellcheck shell=bash

# Bucket milik Soundpub. Bucket lain (avatars, daily-report, 3d-models, ...)
# dipakai tenant lain dan TIDAK boleh disalin utuh.
BUCKET_SOUNDPUB="'track-audio','audio-clips','release-covers','label-logos','payout-proofs','release-invoices','contracts','takedown-documents','track-video'"

# User Soundpub = punya baris di soundpub.profiles DAN bukan milik utero_academy.
# 19 user ganda hasil backfill keliru 2026-09-10 sengaja dilewati.
FILTER_USER_SOUNDPUB="EXISTS (SELECT 1 FROM soundpub.profiles p WHERE p.id = u.id)
       AND NOT EXISTS (SELECT 1 FROM utero_academy.user_profiles x WHERE x.id = u.id)"

# Urutan insert tabel soundpub, mengikuti arah foreign key.
# profiles harus lebih dulu (hampir semua tabel menunjuk ke sana);
# releases sebelum tracks; takedown_requests sebelum anak-anaknya.
URUTAN_TABEL=(
  profiles
  user_roles
  artists
  artist_profiles
  app_settings
  releases
  tracks
  release_payments
  royalty_uploads
  royalties
  composer_royalties
  payout_requests
  payout_balance_reservations
  copyright_registrations
  copyright_contracts
  copyright_registration_works
  copyright_registration_files
  copyright_registration_payments
  takedown_requests
  takedown_request_targets
  takedown_request_items
  takedown_request_documents
  takedown_status_history
  artist_deletion_requests
  notifications
  auth_events
  audit_logs
  email_send_log
  rate_limits
  storage_backup_log
  storage_backup_runs
)

# Kolom URL yang perlu ditulis ulang ke domain server baru.
# Format: "tabel:kolom"
KOLOM_URL=(
  "tracks:audio_url"
  "tracks:clip_url"
  "releases:cover_url"
  "profiles:avatar_url"
  "profiles:logo_url_dark"
  "profiles:logo_url_light"
  "artist_profiles:profile_image_url"
  "app_settings:value"
)

# Objek storage Soundpub yang ada di server lama.
# Sidecar TUS (*.json) tidak muncul di sini karena bukan baris storage.objects.
sql_inventaris_objek() {
  cat <<SQL
SELECT o.bucket_id || '|' || o.name || '|' || o.id || '|' || o.version
       || '|' || coalesce(o.metadata->>'size','0')
FROM storage.objects o
WHERE o.bucket_id IN (${BUCKET_SOUNDPUB})
ORDER BY o.bucket_id, o.name;
SQL
}

# Baris storage.objects untuk objek tertentu, siap di-COPY.
sql_ekspor_objek() {
  local daftar_id="$1"
  cat <<SQL
COPY (
  SELECT id, bucket_id, name, owner, created_at, updated_at, last_accessed_at,
         metadata, version, owner_id, user_metadata
  FROM storage.objects
  WHERE id IN (${daftar_id})
  ORDER BY name
) TO STDOUT WITH (FORMAT csv);
SQL
}

# Peta xattr untuk SEMUA objek di server baru.
sql_peta_xattr() {
  cat <<SQL
SELECT bucket_id || '/' || name || '/' || version,
       coalesce(metadata->>'mimetype','application/octet-stream'),
       coalesce(metadata->>'cacheControl','max-age=3600')
FROM storage.objects;
SQL
}

# Ringkasan jumlah objek per bucket — dipakai untuk verifikasi.
sql_ringkas_bucket() {
  cat <<SQL
SELECT bucket_id || '|' || count(*) || '|' || coalesce(sum((metadata->>'size')::bigint),0)
FROM storage.objects
WHERE bucket_id IN (${BUCKET_SOUNDPUB})
GROUP BY bucket_id ORDER BY bucket_id;
SQL
}

# Jumlah baris per tabel soundpub — dipakai untuk verifikasi.
# Memakai filter yang sama dengan ekspor, supaya angka "lama" adalah jumlah
# yang memang akan disalin, bukan jumlah mentah termasuk tenant lain.
# Argumen "mentah" melewati filter (dipakai di server baru yang tak punya
# schema utero_academy).
sql_ringkas_tabel() {
  local mentah="${1:-}" hasil="" filter
  for t in "${URUTAN_TABEL[@]}"; do
    if [ -n "$mentah" ]; then filter=""; else filter="$(filter_user_tabel "$t")"; fi
    [ -n "$hasil" ] && hasil="${hasil} UNION ALL "
    hasil="${hasil}SELECT '${t}' AS t, count(*) AS n FROM soundpub.${t} t ${filter}"
  done
  echo "SELECT t || '|' || n FROM (${hasil}) s ORDER BY t;"
}

# Ekspor auth.users milik Soundpub.
# Daftar kolom diberikan pemanggil — dibaca dari katalog server BARU supaya
# kedua sisi persis sama dan kolom generated tidak ikut.
sql_ekspor_users() {
  local kolom="$1"
  cat <<SQL
COPY (
  SELECT ${kolom} FROM auth.users u
  WHERE ${FILTER_USER_SOUNDPUB}
  ORDER BY u.created_at
) TO STDOUT WITH (FORMAT csv);
SQL
}

# Ekspor auth.identities milik user Soundpub.
sql_ekspor_identities() {
  local kolom="$1"
  cat <<SQL
COPY (
  SELECT ${kolom} FROM auth.identities i
  WHERE EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = i.user_id AND ${FILTER_USER_SOUNDPUB}
  )
  ORDER BY i.created_at
) TO STDOUT WITH (FORMAT csv);
SQL
}

# Tabel yang barisnya menunjuk auth.users dan HARUS disaring, supaya 19 user
# ganda utero_academy tidak ikut dan meninggalkan baris yatim (FK gagal).
# Terverifikasi 2026-09-30: hanya dua tabel ini yang punya baris milik mereka —
# artist_profiles, artists, releases, notifications, auth_events, dan
# copyright_registrations semuanya nol.
filter_user_tabel() {
  local kolom
  case "$1" in
    profiles)   kolom="id" ;;
    user_roles) kolom="user_id" ;;
    *) return 0 ;;
  esac
  cat <<SQL
 WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.${kolom}
       AND ${FILTER_USER_SOUNDPUB})
SQL
}

# Ekspor satu tabel soundpub, dibatasi ke user Soundpub bila tabelnya punya
# kolom pemilik. Tabel tanpa kolom pemilik disalin utuh.
sql_ekspor_tabel() {
  local tabel="$1" kolom="$2"
  local filter
  filter="$(filter_user_tabel "$tabel")"
  cat <<SQL
COPY (SELECT ${kolom} FROM soundpub.${tabel} t ${filter}) TO STDOUT WITH (FORMAT csv);
SQL
}

# Daftar kolom sebuah tabel, urut posisi — dipakai menyusun INSERT.
# Kolom generated dilewati: Postgres menolak INSERT nilai ke sana
# ("cannot insert a non-DEFAULT value into column"). Di server baru yang
# kena: auth.users.confirmed_at dan auth.identities.email — keduanya
# dihitung ulang otomatis dari kolom lain, jadi aman tidak disalin.
sql_kolom_tabel() {
  local skema="$1" tabel="$2"
  cat <<SQL
SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position)
FROM information_schema.columns
WHERE table_schema = '${skema}' AND table_name = '${tabel}'
  AND is_generated = 'NEVER';
SQL
}

# Unique constraint selain primary key, satu per baris, kolom dipisah koma.
#
# Perlu karena id di server baru TIDAK selalu sama dengan di server lama:
# migrasi awal membiarkan sebagian tabel membuat id sendiri. Contoh nyata
# soundpub.user_roles — (user_id, role) sama persis, id beda. Tanpa ini
# insert gagal kena "duplicate key value violates unique constraint".
sql_unik_tabel() {
  local skema="$1" tabel="$2"
  cat <<SQL
SELECT (SELECT string_agg(quote_ident(a.attname), ',' ORDER BY k.ord)
        FROM unnest(c.conkey) WITH ORDINALITY k(att, ord)
        JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.att)
FROM pg_constraint c
JOIN pg_class cl ON cl.oid = c.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE n.nspname = '${skema}' AND cl.relname = '${tabel}' AND c.contype = 'u'
ORDER BY 1;
SQL
}

# Primary key sebuah tabel — dipakai untuk ON CONFLICT.
sql_pk_tabel() {
  local skema="$1" tabel="$2"
  cat <<SQL
SELECT coalesce(string_agg(quote_ident(a.attname), ',' ORDER BY k.ord), '')
FROM pg_constraint c
JOIN pg_class cl ON cl.oid = c.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(att, ord) ON true
JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = k.att
WHERE n.nspname = '${skema}' AND cl.relname = '${tabel}' AND c.contype = 'p';
SQL
}
