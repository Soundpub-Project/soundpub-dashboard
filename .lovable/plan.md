
# ✅ IMPLEMENTED: Migrasi Name-Based ke ID-Based Matching

## Status: COMPLETE ✅

Sistem sekarang menggunakan **hybrid approach** — ID-based matching (`artist_user_id`) sebagai primary, dengan name-based matching sebagai fallback untuk backward compatibility.

---

## Ringkasan Implementasi

### Database Changes (Sudah Selesai)
- ✅ Kolom `artist_user_id` (UUID, FK ke profiles.id) ditambahkan ke tabel `releases`, `tracks`, dan `royalties`
- ✅ Indexes dibuat pada kolom baru
- ✅ Data existing di-migrasi berdasarkan name matching
- ✅ Function `get_artist_user_id_by_name()` dibuat untuk helper matching

### RLS Policies (Sudah Selesai)
- ✅ Releases: Hybrid policy (`artist_user_id = auth.uid()` OR fallback name matching)
- ✅ Tracks: Hybrid policy dengan dukungan `artists` JSONB array
- ✅ Royalties: Hybrid policy (`artist_user_id` OR fallback `artist` name matching)

### Frontend (Sudah Selesai)
- ✅ `ReleaseFormDialog.tsx` menyimpan `artist_user_id` saat pilih artist dari dropdown
- ✅ `ArtistSelector.tsx` mengembalikan `id` dan `name`
- ✅ Releases page query berdasarkan `artist_user_id`

### Backend (Sudah Selesai)
- ✅ `process-royalty-upload` auto-match `artist_user_id` dari nama saat import CSV
- ✅ `get-catalog-tracks` menyertakan label info (profiles join)

---

## Arsitektur Saat Ini

```text
+------------------+          +------------------+          +------------------+
|     profiles     |          |     releases     |          |     tracks       |
+------------------+          +------------------+          +------------------+
| id (uuid) PK     |<---------| artist_user_id   |          | artist_user_id   |
| full_name (text) |   FK     | artist_name (text)|         | artist_name (text)|
| parent_label_id  |          | label_id (uuid)  |          | artists (jsonb)  |
+------------------+          +------------------+          +------------------+
        ^                              |                            |
        |                              |                            |
        +------------------------------+----------------------------+
                       MATCH BY UUID (Primary) + Name (Fallback)
```

---

## Backward Compatibility

1. Kolom `artist_name` (text) tetap ada dan terisi
2. RLS policies menggunakan **hybrid approach**: cek `artist_user_id` dulu, fallback ke `artist_name`
3. Data lama tanpa `artist_user_id` tetap accessible via name matching
4. Data baru akan selalu memiliki `artist_user_id`

---

## Edge Functions Status

| Function | Status | Notes |
|----------|--------|-------|
| `create-user` | ✅ Active | Optimized CORS + pinned @2.49.1 |
| `process-royalty-upload` | ✅ Active | Auto-match artist_user_id |
| `delete-user` | ✅ Active | |
| `update-user-status` | ✅ Active | |
| `update-user-password` | ✅ Active | Optimized CORS + pinned @2.49.1 |
| `change-own-password` | ✅ Active | Optimized CORS + pinned @2.49.1 |
| `remove-artist-from-label` | ✅ Active | |
| `gcs-upload` | ✅ Active | |
| `gcs-manage` | ✅ Active | |
| `test-gcs` | ✅ Active | |
| `create-whitelabel-artist` | ✅ Active | |
| `set-artist-password` | ✅ Active | |
| `get-ga4-config` | ✅ Active | |
| `update-app-settings` | ✅ Active | |
| `send-royalty-notification` | ✅ Active | |
| `get-catalog-tracks` | ✅ Active | Includes label info |

---

## Edge Function Standards

Semua edge functions mengikuti standar berikut untuk menghindari bundle timeout dan CORS errors:
- Pin version: `@supabase/supabase-js@2.49.1`
- CORS headers lengkap termasuk `Access-Control-Allow-Methods`
- Inline CORS (tidak import dari shared)
- `verify_jwt = false` di config.toml

---

## Halaman Tracks

- ✅ Halaman `/tracks` untuk superadmin melihat semua tracks
- ✅ Filter by artist, genre
- ✅ Search by title, artist, ISRC
- ✅ Pagination dengan pilihan page size
- ✅ Label info per track (via release → profiles join)
