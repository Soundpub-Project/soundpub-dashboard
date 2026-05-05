
# Penyempurnaan Profile Artis sebagai Source of Truth

## Tujuan

Membuat `artist_profiles` jadi sumber data utama identitas artis (nama panggung, foto, bio, link Spotify) — terpisah dari `profiles` yang merepresentasikan akun login user. Setiap artis **wajib** isi profile artis sebelum bisa membuat release. Nama artis utama di release auto-fill dari `artist_profiles.artist_name` dan locked, tapi featured artists tetap bisa ditambahkan bebas.

---

## Bagian 1 — Perubahan Database

### A. Tambahkan kolom ke `artist_profiles`

```text
artist_profiles
├── artist_name         (sudah ada) — nama panggung utama
├── artist_type         (sudah ada) — solo / band / group
├── bio                 (sudah ada)
├── genre               (sudah ada)
├── social_links        (sudah ada — jsonb)
├── + legal_name        text       — nama asli (untuk kontrak/royalty)
├── + profile_image_url text       — foto artis (upload manual)
├── + country           text
├── + city              text
├── + language          text       — bahasa utama lagu
├── + gender            text       — opsional, untuk DSP
├── + date_of_birth     date       — opsional
├── + spotify_artist_id  text
├── + spotify_artist_url text
├── + spotify_data       jsonb     — cache hasil fetch (foto, follower, genre, top tracks)
├── + spotify_synced_at  timestamptz
├── + verified          boolean    — admin-controlled
└── + verified_at       timestamptz
```

RLS policies sudah ada (artist owner, label, whitelabel, admin) — tetap dipakai, hanya kolom baru otomatis ikut.

### B. Helper function baru

```sql
get_user_artist_name(_user_id uuid) RETURNS text
-- COALESCE(artist_profiles.artist_name, profiles.full_name)
-- Dipakai di RPC release/royalty supaya konsisten.
```

`get_user_full_name()` lama tetap ada (dipakai untuk auth/RLS yang sudah berjalan).

### C. Storage bucket

Pakai bucket **`avatars`** yang sudah ada (atau buat folder `artist-photos/`). Tidak perlu bucket baru.

---

## Bagian 2 — Halaman "Profile Artis" (UI)

**Lokasi:** `src/pages/ArtistProfile.tsx` (sudah ada — disempurnakan).

**Section yang ditambahkan:**

1. **Identitas Artis**
   - Stage Name (artist_name) *required*
   - Legal Name
   - Artist Type (solo/band/group)
   - Genre, Language, Country, City
   - Bio (textarea)

2. **Foto Artis** — upload manual ke storage `avatars/artist-photos/{user_id}.jpg`. Tampilkan preview circle.

3. **Social Media** — Instagram, YouTube, TikTok, Twitter (jsonb `social_links`).

4. **Spotify Integration** (section khusus):
   - Input field: paste URL Spotify Artist (contoh `https://open.spotify.com/artist/xxxx`)
   - Tombol **"Connect & Sync"** → panggil edge function `spotify-fetch-artist`
   - Setelah sukses, tampilkan card preview: foto Spotify, follower count, genres, top 5 tracks, link "Open in Spotify"
   - Tombol **"Refresh Data"** untuk re-fetch
   - Tombol **"Disconnect"** untuk hapus

5. **Status**
   - Badge "Verified" kalau `verified=true` (admin yang set)
   - Badge "Profile Lengkap" kalau semua field wajib terisi

---

## Bagian 3 — Spotify Integration

### Edge function baru: `spotify-fetch-artist`

```text
Input:  { artist_url_or_id: string }
Output: { id, name, images, followers, genres, popularity, top_tracks }
```

**Flow:**
1. Parse `artist_id` dari URL/input.
2. Get OAuth token: POST `accounts.spotify.com/api/token` dengan Client Credentials (Basic auth pakai `SPOTIFY_CLIENT_ID:SPOTIFY_CLIENT_SECRET`). Cache token (1 jam).
3. GET `api.spotify.com/v1/artists/{id}` + GET `/v1/artists/{id}/top-tracks?market=ID`.
4. Return data → frontend save ke `artist_profiles.spotify_data` + `spotify_artist_id` + `spotify_synced_at`.

### Secrets yang perlu ditambahkan
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

(Akan di-request via `add_secret` di awal implementasi. User daftar gratis di developer.spotify.com → Create App.)

---

## Bagian 4 — Enforcement di Release Form

Lokasi: `src/components/releases/ArtistReleaseFormDialog.tsx` & `ReleaseFormDialog.tsx`.

**Logic baru:**

1. Ketika artis buka form release:
   - Cek `artist_profiles` untuk user ini (sudah ada `artist_profile_completed` flag di profiles).
   - Kalau **belum** lengkap → blokir form, munculkan dialog: "Lengkapi Profile Artis dulu" → tombol redirect ke `/artist-profile`.

2. Kalau sudah lengkap:
   - Field "Artist Name" (Main Artist) auto-fill dari `artist_profiles.artist_name` dan **disabled** (read-only) — ada tooltip "Diambil dari Profile Artis. Edit di halaman Profile Artis".
   - **Featured Artists** tetap bisa ditambahkan manual via `ArtistSelector` (free input) — tidak diblokir.

3. Saat submit:
   - `artist_name` di `releases` & `tracks` pakai value dari `artist_profiles.artist_name`.
   - `artist_user_id` tetap = user.id.

### Untuk role Label/Whitelabel/Admin
- Tidak terdampak — mereka tetap bisa input nama artis bebas (karena mereka mungkin bikin release untuk artis yang belum punya akun di sistem).
- TAPI: kalau yang dipilih adalah artis terdaftar (dari dropdown `labelArtists`) yang punya `artist_profiles`, prefer pakai `artist_profiles.artist_name`.

---

## Bagian 5 — Role & Permission Map

| Role | View Profile | Edit Own | Edit Others | Set Verified |
|---|---|---|---|---|
| artist | ✓ (own) | ✓ | ✗ | ✗ |
| label | ✓ (artisnya) | ✗ | ✓ (artis di bawahnya) | ✗ |
| whitelabel | ✓ (artisnya) | ✗ | ✓ (artis di bawahnya) | ✗ |
| admin / superadmin | ✓ (semua) | ✓ | ✓ (semua) | ✓ |
| copyright | — | — | — | — |

RLS `artist_profiles` sudah cover ini, tinggal verifikasi.

---

## File yang akan dibuat / diubah

**Baru:**
- `supabase/functions/spotify-fetch-artist/index.ts`
- `src/components/artist-profile/SpotifyConnectCard.tsx`
- `src/components/artist-profile/ArtistPhotoUpload.tsx`
- Migration: tambah kolom + helper function

**Diubah:**
- `src/pages/ArtistProfile.tsx` — section baru lengkap
- `src/components/releases/ArtistReleaseFormDialog.tsx` — guard + lock main artist name
- `src/components/releases/ReleaseFormDialog.tsx` — guard + lock untuk role artist
- `src/hooks/useAuth.tsx` — tambah `artistProfile` state + `refreshArtistProfile()`
- `src/components/onboarding/ArtistOnboardingDialog.tsx` — sinkron field baru (opsional)

**Tidak diubah:**
- Storage bucket existing (pakai `avatars`)
- RPC royalty (tetap pakai `get_user_full_name` untuk konsistensi data lama)
- Auth/SSO logic (sudah fix, tidak disentuh)
- Audio clip cutter (sudah selesai)

---

## Catatan Penting

- **Backward compatibility:** Release lama tetap pakai nama lama. Hanya release baru yang pakai `artist_profiles.artist_name`.
- **Migrasi data:** Untuk artist yang sudah ada tapi belum isi `artist_profiles`, sistem auto-create row dengan `artist_name = profiles.full_name` saat pertama buka halaman Profile Artis (bisa diedit setelahnya).
- **Spotify rate limit:** Client Credentials token cached server-side. Sync manual (button-triggered), bukan auto-sync di setiap page load.
- **Featured artists:** Tetap free-input, tidak dipaksa harus punya akun di sistem.
