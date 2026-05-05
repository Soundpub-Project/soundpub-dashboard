
# Perbaikan Bug Profil Artis + Pencarian Spotify Langsung

Tiga masalah yang akan diperbaiki sekaligus, semua sudah berhasil aku reproduksi penyebabnya dari kode + RLS.

---

## Bug 1 — `supabase.auth.getClaims is not a function`

**Penyebab:** Edge function `spotify-fetch-artist` memakai `supabase.auth.getClaims(token)`. Method ini **tidak ada** di `@supabase/supabase-js@2.49.1` (versi yang dikunci untuk semua edge function di project ini). Jadi setiap kali dipanggil langsung lempar exception → toast "Gagal sync Spotify" muncul.

**Fix:** Ganti validasi JWT pakai `supabase.auth.getUser(token)` yang memang ada di v2.49.1. Pola ini sudah dipakai di edge function lain di project ini (mis. `set-artist-password`, `delete-royalty-upload`).

```text
File: supabase/functions/spotify-fetch-artist/index.ts
- const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
- if (claimsErr || !claims?.claims) { return json({ error: "Unauthorized" }, 200); }
+ const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
+ if (userErr || !user) { return json({ error: "Unauthorized" }, 200); }
```

---

## Bug 2 — `new row violates row-level security policy` saat upload foto

**Penyebab:** RLS policy storage bucket `avatars` mewajibkan folder pertama = `auth.uid()`:

```sql
((storage.foldername(name))[1] = (auth.uid())::text)
```

Sedangkan kode meng-upload ke path `artist-photos/{userId}-{timestamp}.ext` — folder pertamanya jadi `artist-photos`, **bukan** UUID user. Jadi insert ke `storage.objects` ditolak.

**Fix:** Balik strukturnya jadi `{userId}/artist-photo-{timestamp}.ext`. UUID user jadi folder pertama → policy lolos. Tidak perlu ubah RLS sama sekali (lebih aman).

```text
File: src/pages/ArtistProfile.tsx (handlePhotoUpload)
- const path = `artist-photos/${targetUserId}-${Date.now()}.${ext}`;
+ const path = `${targetUserId}/artist-photo-${Date.now()}.${ext}`;
```

Plus:
- Tambah guard kalau row `artist_profiles` belum ada — auto-insert dulu sebelum update `profile_image_url` (kasus user upload foto sebelum klik Save). Pakai `upsert` dengan `onConflict: 'user_id'`.

---

## Bug 3 / Fitur baru — Pencarian Spotify Artist Langsung

Saat ini user harus paste URL/ID Spotify manual. Akan ditambah **search box** yang query Spotify Search API real-time, tampil daftar kandidat dengan foto + follower + genre, tinggal klik untuk connect.

### Edge function: tambah action `search`

`spotify-fetch-artist/index.ts` jadi multi-action:

```text
POST body:
  { action: "search", q: "..." }              → list artists (max 8)
  { action: "fetch", artist_url_or_id: "..." } → existing flow
  // backward-compat: kalau body tanpa action tapi ada artist_url_or_id → fetch
```

Endpoint Spotify yang dipakai:
- `GET /v1/search?type=artist&q={q}&limit=8&market=ID`

Hasil dipetakan ke `{ id, name, image, followers, genres, url }`.

### UI di `ArtistProfile.tsx` — Spotify Connect Card

```text
┌─ Spotify Integration ─────────────────────────┐
│ [ search input: cari nama artis... ] [Cari]   │
│                                                │
│ ┌─ result card (klik untuk connect) ────────┐ │
│ │ [img] Artist Name                          │ │
│ │       1.2M followers · pop, indie          │ │
│ └────────────────────────────────────────────┘ │
│ ┌─ result card ─...                          ┐ │
│ ...                                            │
│                                                │
│ ── atau paste URL manual ──                    │
│ [ https://open.spotify.com/artist/... ] [Sync] │
└────────────────────────────────────────────────┘
```

Flow:
1. User ketik nama → debounce 400ms → call `action: "search"`.
2. Tampilkan max 8 hasil. Klik kartu → langsung jalankan `action: "fetch"` dengan `artist.id` → simpan ke `artist_profiles`.
3. Mode paste-URL manual tetap ada sebagai fallback.

Tooltip kecil di atas search: "Pilih artis kamu yang sesuai. Pastikan benar — ini akan jadi link resmi Spotify untuk profilmu."

---

## File yang berubah

| File | Perubahan |
|---|---|
| `supabase/functions/spotify-fetch-artist/index.ts` | Ganti `getClaims` → `getUser`. Tambah action `search` (Spotify `/v1/search`). |
| `src/pages/ArtistProfile.tsx` | Path upload `{userId}/...`, auto-create row sebelum update foto, search UI + state + debounce, `onSelectSearchResult` handler. |

## Yang TIDAK disentuh
- Tidak ada migration baru. Skema `artist_profiles` sudah cukup.
- Tidak ada perubahan RLS storage atau tabel.
- Audio clip cutter, SSO/login, release form lock — tidak diutak-atik.
- Secret `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` sudah ada, tidak perlu request lagi.

---

## Catatan untuk user

- Setelah fix, kalau user pernah connect Spotify dengan URL salah, tinggal klik **Disconnect** lalu cari lagi via search box.
- Spotify Search API butuh nama yang cukup spesifik (>2 karakter). Hint sudah ditampilkan.
- Token Spotify di-cache server-side 1 jam (sudah ada), jadi search berikutnya cepat.
