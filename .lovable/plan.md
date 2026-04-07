

## Plan: SSO User Enhancements

### Ringkasan

4 fitur yang akan diimplementasikan: (1) fix parent label assignment untuk SSO users, (2) wajib isi profil artis sebelum buat release, (3) tetap pakai role `artist` yang sudah ada, dan (4) fitur upload foto profil.

---

### Poin 3: Jawaban — Tidak perlu role khusus

Role `artist` yang sudah ada sudah cukup. User SSO dibedakan melalui kolom `sso_provider` di tabel `profiles`, bukan melalui role terpisah. Semua RLS policy dan permission yang berlaku untuk artist tetap berlaku.

---

### Step 1: Fix Parent Label Assignment di Edge Function `sso-login`

**Masalah**: Untuk user yang sudah ada (existing), edge function tidak meng-update `parent_label_id` ke ICCN Media. Juga tidak menambahkan ke tabel `artists`.

**Perubahan di `supabase/functions/sso-login/index.ts`**:
- Pada blok `if (existingProfile)`: tambahkan logic untuk set `parent_label_id = iccnMediaLabelId` jika belum di-set
- Tambahkan insert ke tabel `artists` jika belum ada entry untuk user tersebut di bawah ICCN Media
- Pastikan role di-update ke `artist` jika masih `user`

---

### Step 2: Wajib Isi Profil Artis untuk User SSO

**Sudah ada**: `ArtistOnboardingDialog` dan tabel `artist_profiles`. Kolom `artist_profile_completed` di `profiles` sudah ada.

**Perubahan**:
1. **`src/pages/Releases.tsx`**: Sebelum membuka form "Tambah Release", cek `isSsoUser && !isArtistProfileCompleted`. Jika belum lengkap, tampilkan `ArtistOnboardingDialog` dengan `allowSkip={false}` (wajib diisi).
2. **`src/pages/Dashboard.tsx`**: Tampilkan banner/reminder untuk SSO users yang belum melengkapi profil artis.
3. **`ArtistOnboardingDialog`**: Setelah submit berhasil, refresh `profile` dari auth context agar `isArtistProfileCompleted` ter-update.

---

### Step 3: Fitur Upload Foto Profil

**Database**:
- Kolom `avatar_url` sudah **tidak ada** di tabel `profiles`. Perlu ditambahkan via migration.

**Storage**:
- Buat bucket baru `avatars` (public) dengan RLS policy: user hanya bisa upload/update file di path `{user_id}/`.

**Migration SQL**:
```sql
ALTER TABLE public.profiles ADD COLUMN avatar_url text;

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');
```

**Frontend**:
1. **`src/pages/Settings.tsx`**: Tambahkan section upload avatar dengan preview, menggunakan Supabase Storage upload.
2. **`src/components/layout/AppSidebar.tsx`**: Tampilkan `avatar_url` di sidebar footer sebagai pengganti initials jika tersedia.
3. **`src/components/layout/DashboardLayout.tsx`**: Tampilkan avatar di header.

---

### File yang akan diubah/dibuat

| File | Aksi |
|---|---|
| `supabase/functions/sso-login/index.ts` | Edit — fix parent label & artists sync untuk existing users |
| `src/pages/Releases.tsx` | Edit — block release creation jika SSO user belum isi profil |
| `src/pages/Dashboard.tsx` | Edit — tambah banner reminder profil artis |
| `src/pages/Settings.tsx` | Edit — tambah avatar upload section |
| `src/components/layout/AppSidebar.tsx` | Edit — tampilkan avatar |
| `src/components/layout/DashboardLayout.tsx` | Edit — tampilkan avatar di header |
| `src/hooks/useAuth.tsx` | Edit — tambah `avatar_url` di Profile interface |
| Migration SQL | Baru — tambah kolom `avatar_url`, bucket `avatars` + RLS |

