#!/usr/bin/env bash
#
# Sinkron delta Soundpub: 20.20.20.173 (lama) -> 20.20.20.3 (baru).
#
# Menyalin perubahan yang terjadi di server lama setelah migrasi awal.
# Idempoten — aman dijalankan berulang kali.
#
# Server lama HANYA DIBACA. Tidak ada satu pun perintah tulis ke sana.
#
# Pemakaian:
#   ./sinkron-delta.sh --dry-run    lihat rencana, tidak menulis apa pun
#   ./sinkron-delta.sh              jalankan sinkron
#   ./sinkron-delta.sh --verify     hanya bandingkan kedua server
#
set -euo pipefail

LAMA="maskhar@20.20.20.173"
BARU="maskhar@20.20.20.3"
DOMAIN_LAMA="supabase.carubra.com"
DOMAIN_BARU="supabase.carubra.space"
AKAR_STORAGE="/var/lib/storage/stub/stub"

SKRIP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-sql.sh
. "${SKRIP_DIR}/lib-sql.sh"

KERJA="$(mktemp -d)"
DRY_RUN=0
VERIFY_ONLY=0
MASALAH=0
MULAI=$(date +%s)

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --verify)  VERIFY_ONLY=1 ;;
    -h|--help) sed -n '3,14p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "argumen tidak dikenal: $arg" >&2; exit 2 ;;
  esac
done

trap 'rm -rf "$KERJA"' EXIT

# ---------- keluaran ----------

BAB()   { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
INFO()  { printf '   %s\n' "$*"; }
OK()    { printf '   \033[32m+\033[0m %s\n' "$*"; }
WARN()  { printf '   \033[33m!\033[0m %s\n' "$*"; }
FATAL() { printf '\033[31mGAGAL:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- pembantu ----------

# psql membaca SQL dari stdin, keluaran polos tanpa header/pemisah.
# Gagal kalau SQL error — jangan ditelan, hasil salah lebih bahaya dari berhenti.
psql_di() {
  ssh -o BatchMode=yes "$1" \
    "docker exec -i supabase-db psql -U postgres -d postgres -t -A -q -v ON_ERROR_STOP=1"
}

# Sama, tapi untuk skrip multi-perintah (BEGIN/COMMIT, \copy).
psql_ketat() {
  ssh -o BatchMode=yes "$1" \
    "docker exec -i supabase-db psql -U postgres -d postgres -q -v ON_ERROR_STOP=1"
}

# Pastikan sebuah nilai benar-benar angka sebelum dipakai di perbandingan.
angka() {
  case "$1" in
    ''|*[!0-9]*) echo "$2" ;;
    *) echo "$1" ;;
  esac
}

# ---------- 0. prasyarat ----------

BAB "Prasyarat"

for h in "$LAMA" "$BARU"; do
  if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$h" true 2>/dev/null; then
    FATAL "tidak bisa SSH ke $h (butuh key tanpa password)"
  fi
  OK "SSH $h"
done

for h in "$LAMA" "$BARU"; do
  hidup=$(ssh -o BatchMode=yes "$h" \
    "docker inspect -f '{{.State.Running}}' supabase-db supabase-storage" 2>/dev/null || echo gagal)
  case "$hidup" in
    *false*|*gagal*) FATAL "container supabase-db / supabase-storage tidak jalan di $h" ;;
  esac
done
OK "container database dan storage hidup di kedua server"

SISA_DISK=$(angka "$(ssh -o BatchMode=yes "$BARU" \
  "df -BG --output=avail /data | tail -1 | tr -dc '0-9'")" 0)
INFO "sisa disk /data di server baru: ${SISA_DISK} GB"
if [ "$SISA_DISK" -lt 20 ]; then
  FATAL "sisa disk di server baru kurang dari 20 GB — bereskan dulu"
fi

if [ "$DRY_RUN" = 1 ]; then WARN "MODE DRY-RUN — tidak ada yang ditulis"; fi
if [ "$VERIFY_ONLY" = 1 ]; then WARN "MODE VERIFY — hanya membandingkan"; fi

# ---------- 1. apakah server lama masih dipakai ----------

BAB "Aktivitas server lama"

TERBARU=$(psql_di "$LAMA" <<'SQL'
SELECT coalesce(to_char(max(created_at),'YYYY-MM-DD HH24:MI:SS'),'-')
FROM storage.objects
WHERE bucket_id IN ('track-audio','release-covers','audio-clips');
SQL
)
INFO "upload storage terakhir : ${TERBARU}"

MENIT=$(angka "$(psql_di "$LAMA" <<'SQL'
SELECT coalesce(round(extract(epoch FROM now() - max(created_at))/60)::text,'999999')
FROM soundpub.audit_logs;
SQL
)" 999999)
INFO "aktivitas audit terakhir: ${MENIT} menit lalu"

if [ "$MENIT" -lt 60 ]; then
  WARN "server lama MASIH AKTIF DIPAKAI (aktivitas < 1 jam lalu)."
  WARN "Sinkron tetap berguna — memperkecil delta. Tapi hasilnya tidak akan"
  WARN "pernah nol selama admin masih menulis ke sana. Freeze dulu untuk final."
else
  OK "tidak ada aktivitas dalam 1 jam terakhir"
fi

# ---------- 2. delta storage ----------

BAB "Delta storage"

INVENTARIS=$(sql_inventaris_objek)
psql_di "$LAMA" <<< "$INVENTARIS" | grep '|' | sort > "${KERJA}/obj-lama.txt"
psql_di "$BARU" <<< "$INVENTARIS" | grep '|' | sort > "${KERJA}/obj-baru.txt"

INFO "objek di server lama: $(wc -l < "${KERJA}/obj-lama.txt")"
INFO "objek di server baru: $(wc -l < "${KERJA}/obj-baru.txt")"

cut -d'|' -f1,2 "${KERJA}/obj-lama.txt" | sort > "${KERJA}/kunci-lama.txt"
cut -d'|' -f1,2 "${KERJA}/obj-baru.txt" | sort > "${KERJA}/kunci-baru.txt"
comm -23 "${KERJA}/kunci-lama.txt" "${KERJA}/kunci-baru.txt" > "${KERJA}/kunci-kurang.txt"

N_KURANG=$(wc -l < "${KERJA}/kunci-kurang.txt")

# Objek yang hanya ada di server baru — wajar kalau admin sudah mulai pakai
# server baru. Dibiarkan, tidak dihapus.
N_LEBIH=$(comm -13 "${KERJA}/kunci-lama.txt" "${KERJA}/kunci-baru.txt" | wc -l)
if [ "$N_LEBIH" -gt 0 ]; then
  INFO "objek hanya di server baru (dibiarkan): ${N_LEBIH}"
fi

ADA_SALIN=0

if [ "$N_KURANG" = 0 ]; then
  OK "storage sudah lengkap, tidak ada yang perlu disalin"
else
  awk -F'|' 'NR==FNR{k[$1"|"$2]=1;next} ($1"|"$2) in k' \
    "${KERJA}/kunci-kurang.txt" "${KERJA}/obj-lama.txt" > "${KERJA}/kurang.txt"

  BYTE=$(awk -F'|' '{s+=$5} END{printf "%.0f", s+0}' "${KERJA}/kurang.txt")
  INFO "perlu disalin: ${N_KURANG} objek, $((BYTE / 1048576)) MB"
  cut -d'|' -f1 "${KERJA}/kurang.txt" | sort | uniq -c | while read -r n b; do
    INFO "  ${b}: ${n}"
  done

  # Path di disk: <bucket>/<name>/<version>
  awk -F'|' '{print $1"/"$2"/"$4}' "${KERJA}/kurang.txt" > "${KERJA}/paths.txt"

  if [ "$VERIFY_ONLY" = 1 ] || [ "$DRY_RUN" = 1 ]; then
    INFO "(salin dilewati di mode ini)"
    MASALAH=1
  else
    ADA_SALIN=1

    INFO "menarik berkas dari server lama..."
    ssh -o BatchMode=yes "$LAMA" \
      "docker exec -i supabase-storage tar -cf - -C ${AKAR_STORAGE} -T /dev/stdin" \
      < "${KERJA}/paths.txt" > "${KERJA}/delta.tar"

    N_TAR=$(tar -tf "${KERJA}/delta.tar" | grep -vc '/$' || true)
    if [ "$N_TAR" -ne "$N_KURANG" ]; then
      FATAL "isi tar ${N_TAR} berkas, diminta ${N_KURANG} — batal, tidak ada yang ditulis"
    fi
    OK "tertarik ${N_TAR} berkas ($(( $(stat -c%s "${KERJA}/delta.tar") / 1048576 )) MB)"

    INFO "mengirim ke server baru..."
    ssh -o BatchMode=yes "$BARU" "cat > /tmp/delta-sinkron.tar" < "${KERJA}/delta.tar"
    ssh -o BatchMode=yes "$BARU" "
      set -e
      docker cp /tmp/delta-sinkron.tar supabase-storage:/tmp/delta.tar >/dev/null
      docker exec supabase-storage tar -xf /tmp/delta.tar -C ${AKAR_STORAGE}
      docker exec supabase-storage rm -f /tmp/delta.tar
      rm -f /tmp/delta-sinkron.tar"
    OK "berkas diekstrak di server baru"

    # Baris storage.objects untuk objek yang barusan disalin.
    IDS=$(cut -d'|' -f3 "${KERJA}/kurang.txt" | sed "s/.*/'&'/" | paste -sd, -)
    psql_di "$LAMA" <<< "$(sql_ekspor_objek "$IDS")" > "${KERJA}/obj-delta.csv"

    N_CSV=$(wc -l < "${KERJA}/obj-delta.csv")
    if [ "$N_CSV" -ne "$N_KURANG" ]; then
      FATAL "ekspor baris objek ${N_CSV}, diharapkan ${N_KURANG}"
    fi

    ssh -o BatchMode=yes "$BARU" "cat > /tmp/obj-delta.csv" < "${KERJA}/obj-delta.csv"
    ssh -o BatchMode=yes "$BARU" \
      "docker cp /tmp/obj-delta.csv supabase-db:/tmp/obj-delta.csv >/dev/null"

    KOL_OBJ="id,bucket_id,name,owner,created_at,updated_at,last_accessed_at,metadata,version,owner_id,user_metadata"
    psql_ketat "$BARU" <<SQL
BEGIN;
CREATE TEMP TABLE tmp_obj (LIKE storage.objects INCLUDING DEFAULTS);
\copy tmp_obj (${KOL_OBJ}) FROM '/tmp/obj-delta.csv' WITH (FORMAT csv)
INSERT INTO storage.objects (${KOL_OBJ})
SELECT ${KOL_OBJ} FROM tmp_obj
ON CONFLICT (id) DO NOTHING;
COMMIT;
SQL
    ssh -o BatchMode=yes "$BARU" \
      "rm -f /tmp/obj-delta.csv; docker exec supabase-db rm -f /tmp/obj-delta.csv"
    OK "${N_KURANG} baris storage.objects ditambahkan"
  fi
fi

# ---------- 3. xattr ----------

# Wajib setelah menyalin berkas: tanpa xattr setiap download balas HTTP 500
# ENODATA. Dibangun ulang dari storage.objects.metadata, bukan disalin.
if [ "$ADA_SALIN" = 1 ]; then
  BAB "Membangun ulang xattr"
  PETA=$(sql_peta_xattr | tr '\n' ' ')
  ssh -o BatchMode=yes "$BARU" \
    "docker exec -i supabase-db psql -U postgres -d postgres -t -A -q -F'|~|' -c \"${PETA}\" > /tmp/xattr.tsv"
  ssh -o BatchMode=yes "$BARU" "cat > /tmp/setxattr.js" < "${SKRIP_DIR}/setxattr.js"
  HASIL=$(ssh -o BatchMode=yes "$BARU" "
    set -e
    docker cp /tmp/xattr.tsv supabase-storage:/tmp/xattr.tsv >/dev/null
    docker cp /tmp/setxattr.js supabase-storage:/app/setxattr.js >/dev/null
    docker exec supabase-storage node /app/setxattr.js
    rm -f /tmp/xattr.tsv /tmp/setxattr.js") || FATAL "setxattr gagal:
${HASIL}"
  OK "$(echo "$HASIL" | tail -1)"
fi

# ---------- 4. delta database ----------

BAB "Delta database"

# Di server lama dihitung dengan filter tenant (schema utero_academy ada di
# sana); di server baru dihitung mentah — semua barisnya memang milik Soundpub.
psql_di "$LAMA" <<< "$(sql_ringkas_tabel)"       | grep '|' | sort > "${KERJA}/tbl-lama.txt"
psql_di "$BARU" <<< "$(sql_ringkas_tabel mentah)" | grep '|' | sort > "${KERJA}/tbl-baru.txt"

> "${KERJA}/kurang-baris.txt"
while IFS='|' read -r t n_lama; do
  n_baru=$(grep "^${t}|" "${KERJA}/tbl-baru.txt" | cut -d'|' -f2 || true)
  n_baru=$(angka "${n_baru}" 0)
  [ "$n_lama" = "$n_baru" ] && continue

  # baru > lama itu wajar: server baru sudah mencatat aktivitasnya sendiri
  # (audit_logs, auth_events). Sinkron bersifat menambah, tidak menghapus.
  if [ "$n_baru" -gt "$n_lama" ]; then
    printf '   %-32s lama=%-7s baru=%-7s (lebih, dibiarkan)\n' "$t" "$n_lama" "$n_baru"
  else
    printf '   %-32s lama=%-7s baru=%-7s KURANG %s\n' \
      "$t" "$n_lama" "$n_baru" "$((n_lama - n_baru))"
    echo "$t" >> "${KERJA}/kurang-baris.txt"
  fi
done < "${KERJA}/tbl-lama.txt"

ADA_BEDA=0
[ -s "${KERJA}/kurang-baris.txt" ] && ADA_BEDA=1

if [ "$ADA_BEDA" = 0 ]; then
  OK "tidak ada baris yang hilang di server baru"
else
  INFO "(jumlah sama belum tentu isi sama — UPDATE tidak menambah baris)"
fi

N_U_LAMA=$(psql_di "$LAMA" <<SQL
SELECT count(*) FROM auth.users u WHERE ${FILTER_USER_SOUNDPUB};
SQL
)
N_U_BARU=$(psql_di "$BARU" <<'SQL'
SELECT count(*) FROM auth.users;
SQL
)
INFO "auth.users Soundpub: lama=${N_U_LAMA} baru=${N_U_BARU}"

# Sinkron satu tabel: ekspor dari lama, UPSERT ke baru.
# Kolom dan primary key dibaca dari katalog server BARU lebih dulu, lalu dipakai
# untuk menyusun ekspor — supaya kedua sisi punya daftar kolom yang persis sama
# dan kolom generated tidak ikut.
sinkron_tabel() {
  local skema="$1" tabel="$2" matikan_trigger="$3"

  local kolom pk set_klausa
  kolom=$(psql_di "$BARU" <<< "$(sql_kolom_tabel "$skema" "$tabel")")
  pk=$(psql_di "$BARU" <<< "$(sql_pk_tabel "$skema" "$tabel")")
  if [ -z "$kolom" ]; then
    WARN "${skema}.${tabel}: tidak ada di server baru, dilewati"
    MASALAH=1
    return 0
  fi
  if [ -z "$pk" ]; then
    WARN "${skema}.${tabel}: tanpa primary key, dilewati"
    MASALAH=1
    return 0
  fi

  local query
  case "${skema}.${tabel}" in
    auth.users)      query="$(sql_ekspor_users "$kolom")" ;;
    auth.identities) query="$(sql_ekspor_identities "$kolom")" ;;
    *)               query="$(sql_ekspor_tabel "$tabel" "$kolom")" ;;
  esac

  psql_di "$LAMA" <<< "$query" > "${KERJA}/t.csv"
  local n
  if [ ! -s "${KERJA}/t.csv" ]; then
    INFO "${skema}.${tabel}: kosong, dilewati"
    return 0
  fi

  # Kolom PK tidak boleh masuk SET — itu kunci pencocokannya.
  set_klausa=$(echo "$kolom" | tr ',' '\n' \
    | grep -vxF -f <(echo "$pk" | tr ',' '\n') \
    | sed 's/.*/& = EXCLUDED.&/' | paste -sd, -)

  # Selaraskan PK sebelum insert.
  #
  # id di server baru tidak selalu sama dengan di server lama — migrasi awal
  # membiarkan sebagian tabel membuat id sendiri. Kalau dibiarkan, baris yang
  # isinya identik akan ditolak unique constraint karena ON CONFLICT (id)
  # tidak menangkapnya.
  #
  # Yang diubah adalah id di tabel sementara, MENGIKUTI server baru — bukan
  # sebaliknya. Penting: id di server baru sudah dirujuk baris lain, jadi
  # menimpanya akan memutus foreign key.
  #
  # Pembandingnya '=' biasa, bukan IS NOT DISTINCT FROM: kolom unik yang NULL
  # (releases.upc, tracks.isrc) memang tidak pernah bentrok di unique index,
  # jadi tidak boleh ikut dicocokkan.
  local selaras=""
  if [ "${pk}" = "${pk%,*}" ]; then
    local unik
    while read -r unik; do
      [ -z "$unik" ] && continue
      # paste -sd hanya memakai karakter pertama delimiter, jadi ' AND '
      # tidak bisa dipakai di sana — gabungkan dengan sed.
      local syarat
      syarat=$(echo "$unik" | tr ',' '\n' | sed 's/.*/x.& = s.&/' \
        | paste -sd'|' - | sed 's/|/ AND /g')
      selaras="${selaras}
UPDATE tmp_s s SET ${pk} = x.${pk}
FROM ${skema}.${tabel} x WHERE ${syarat} AND x.${pk} <> s.${pk};"
    done <<< "$(psql_di "$BARU" <<< "$(sql_unik_tabel "$skema" "$tabel")")"
  fi

  local trigger=""
  if [ "$matikan_trigger" = 1 ]; then
    # Pengganti pg_dump --disable-triggers; tidak butuh superuser.
    trigger="SET LOCAL session_replication_role = replica;"
  fi

  ssh -o BatchMode=yes "$BARU" "cat > /tmp/sync.csv" < "${KERJA}/t.csv"
  ssh -o BatchMode=yes "$BARU" "docker cp /tmp/sync.csv supabase-db:/tmp/sync.csv >/dev/null"

  local perintah
  perintah="BEGIN;
${trigger}
CREATE TEMP TABLE tmp_s (LIKE ${skema}.${tabel} INCLUDING DEFAULTS);
\\copy tmp_s (${kolom}) FROM '/tmp/sync.csv' WITH (FORMAT csv)
${selaras}
INSERT INTO ${skema}.${tabel} (${kolom}) SELECT ${kolom} FROM tmp_s
ON CONFLICT (${pk}) DO UPDATE SET ${set_klausa};
SELECT 'JUMLAH=' || count(*) FROM tmp_s;
COMMIT;"

  # Debug: CETAK_SQL=1 menampilkan SQL tanpa menjalankannya.
  if [ -n "${CETAK_SQL:-}" ]; then
    printf '\n--- %s.%s ---\n%s\n' "$skema" "$tabel" "$perintah"
    return 0
  fi

  local keluar
  keluar=$(psql_ketat "$BARU" <<< "$perintah")
  # Jumlah dari tabel sementara, bukan wc -l: nilai CSV boleh mengandung
  # newline sehingga jumlah baris berkas bukan jumlah record.
  n=$(angka "$(echo "$keluar" | grep -oE 'JUMLAH=[0-9]+' | head -1 | cut -d= -f2)" 0)
  printf '   %-34s %s baris\n' "${skema}.${tabel}" "$n"
}

if [ "$VERIFY_ONLY" = 1 ] || [ "$DRY_RUN" = 1 ]; then
  INFO "(sinkron tabel dilewati di mode ini)"
  [ "$ADA_BEDA" = 1 ] && MASALAH=1
else
  # auth lebih dulu — soundpub.profiles.id menunjuk ke auth.users.id.
  sinkron_tabel auth users      0
  sinkron_tabel auth identities 0

  for tabel in "${URUTAN_TABEL[@]}"; do
    sinkron_tabel soundpub "$tabel" 1
  done

  ssh -o BatchMode=yes "$BARU" \
    "rm -f /tmp/sync.csv; docker exec supabase-db rm -f /tmp/sync.csv"
  OK "semua tabel soundpub disinkron"

  # ---------- 5. tulis ulang URL ----------

  BAB "Menulis ulang URL ke ${DOMAIN_BARU}"
  # audit_logs sengaja TIDAK disentuh — isinya riwayat historis apa adanya.
  #
  # WAJIB di dalam transaksi ber-replica seperti UPSERT. Tanpa itu trigger
  # update_*_timestamp dan audit_row_change ikut menyala: updated_at tertimpa
  # jam sinkron dan audit_logs terisi ratusan baris palsu. Terbukti 2026-09-29:
  # jalan tanpa replica menghasilkan 574 baris audit palsu, persis di 5 tabel
  # yang ada di KOLOM_URL (tracks, releases, profiles, app_settings,
  # artist_profiles) dan tidak satu pun di tabel lain.
  for pasangan in "${KOLOM_URL[@]}"; do
    tabel="${pasangan%%:*}"
    kolom="${pasangan##*:}"
    keluar=$(psql_ketat "$BARU" <<SQL
BEGIN;
SET LOCAL session_replication_role = replica;
UPDATE soundpub.${tabel}
SET ${kolom} = replace(${kolom}, '${DOMAIN_LAMA}', '${DOMAIN_BARU}')
WHERE ${kolom} LIKE '%${DOMAIN_LAMA}%';
COMMIT;
SQL
)
    n=$(angka "$(echo "$keluar" | grep -oE 'UPDATE [0-9]+' | tail -1 | cut -d' ' -f2)" 0)
    if [ "$n" != 0 ]; then INFO "${tabel}.${kolom}: ${n} baris"; fi
  done
  OK "URL ditulis ulang"
fi

# ---------- 6. verifikasi ----------

BAB "Verifikasi"

RB=$(sql_ringkas_bucket)
psql_di "$LAMA" <<< "$RB" | grep '|' | sort > "${KERJA}/b-lama.txt"
psql_di "$BARU" <<< "$RB" | grep '|' | sort > "${KERJA}/b-baru.txt"

printf '   %-22s %9s %9s\n' "bucket" "lama" "baru"
while IFS='|' read -r b n _sisa; do
  nb=$(grep "^${b}|" "${KERJA}/b-baru.txt" | cut -d'|' -f2 || true)
  nb=$(angka "${nb}" 0)
  tanda="ok"
  if [ "$n" != "$nb" ]; then tanda="BEDA"; MASALAH=1; fi
  printf '   %-22s %9s %9s  %s\n' "$b" "$n" "$nb" "$tanda"
done < "${KERJA}/b-lama.txt"

# Setiap URL carubra.space harus punya baris storage.objects-nya.
YATIM=$(angka "$(psql_di "$BARU" <<SQL
WITH ref AS (
  SELECT 'track-audio' AS b,
         split_part(regexp_replace(audio_url,'^.*/track-audio/',''),'?',1) AS p
    FROM soundpub.tracks WHERE audio_url LIKE '%${DOMAIN_BARU}%'
  UNION ALL
  SELECT 'audio-clips',
         split_part(regexp_replace(clip_url,'^.*/audio-clips/',''),'?',1)
    FROM soundpub.tracks WHERE clip_url LIKE '%${DOMAIN_BARU}%'
  UNION ALL
  SELECT 'release-covers',
         split_part(regexp_replace(cover_url,'^.*/release-covers/',''),'?',1)
    FROM soundpub.releases WHERE cover_url LIKE '%${DOMAIN_BARU}%'
)
SELECT count(*) FROM ref
LEFT JOIN storage.objects o ON o.bucket_id = ref.b AND o.name = ref.p
WHERE o.id IS NULL;
SQL
)" 0)
if [ "$YATIM" = 0 ]; then
  OK "semua URL media punya berkasnya"
else
  WARN "${YATIM} URL menunjuk objek yang tidak ada di storage"
  MASALAH=1
fi

SISA_URL=$(angka "$(psql_di "$BARU" <<SQL
SELECT (SELECT count(*) FROM soundpub.tracks
          WHERE audio_url LIKE '%${DOMAIN_LAMA}%' OR clip_url LIKE '%${DOMAIN_LAMA}%')
     + (SELECT count(*) FROM soundpub.releases WHERE cover_url LIKE '%${DOMAIN_LAMA}%')
     + (SELECT count(*) FROM soundpub.profiles WHERE avatar_url LIKE '%${DOMAIN_LAMA}%');
SQL
)" 0)
if [ "$SISA_URL" = 0 ]; then
  OK "nol URL domain lama tersisa"
else
  WARN "${SISA_URL} baris masih memakai ${DOMAIN_LAMA}"
  MASALAH=1
fi

# ---------- ringkasan ----------

BAB "Selesai dalam $(( $(date +%s) - MULAI )) detik"

if [ "$DRY_RUN" = 1 ]; then
  INFO "Ini dry-run — tidak ada yang ditulis."
  INFO "Jalankan tanpa --dry-run untuk benar-benar menyinkron."
elif [ "$MASALAH" = 1 ]; then
  WARN "Masih ada selisih."
  if [ "$MENIT" -lt 60 ]; then
    WARN "Server lama tadi terdeteksi masih aktif — selisih ini wajar."
    WARN "Jalankan lagi setelah akses tulis ke server lama dihentikan."
  fi
  exit 1
else
  OK "Kedua server sinkron."
  INFO "Langkah berikutnya: arahkan frontend ke https://${DOMAIN_BARU},"
  INFO "baru storage di server lama boleh dihapus."
fi
