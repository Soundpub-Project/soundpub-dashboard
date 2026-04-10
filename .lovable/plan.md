

## Plan: Implementasi Google Login + Auto-Assign Role Artist

### Ringkasan

Menambahkan tombol "Login dengan Google" di halaman Auth. User baru yang signup (manual atau Google) otomatis di-assign role **artist** dan wajib isi profil artis sebelum bisa buat release. User lama yang login via Google **tidak** akan ditimpa data profilnya.

### Langkah Implementasi

#### 1. Configure Social Auth (Lovable Cloud)
Gunakan tool **Configure Social Auth** untuk generate modul `src/integrations/lovable/` dengan package `@lovable.dev/cloud-auth-js`. Ini menyediakan `lovable.auth.signInWithOAuth("google", ...)`.

#### 2. Update Halaman Auth (`src/pages/Auth.tsx`)
- Import `lovable` dari `@/integrations/lovable/index`
- Tambahkan tombol **"Login dengan Google"** (dengan icon Google SVG) di bawah form login, sejajar dengan tombol "Login via ICCN"
- Handler:
  ```typescript
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
  });
  ```
- Tambahkan juga di tab Signup agar user baru bisa langsung daftar via Google

#### 3. Update Database Trigger `handle_new_user()`
Ubah trigger agar user baru **otomatis mendapat role `artist`** (bukan `user`):
```sql
INSERT INTO public.user_roles (user_id, role)
VALUES (NEW.id, 'artist');
```
Juga set `artist_profile_completed = false` dan `sso_provider = 'google'` jika login via Google (dari `raw_user_meta_data`).

#### 4. Fix SSO Login — Jangan Overwrite Data Existing User
Update edge function `sso-login` agar **tidak mengubah `parent_label_id`** jika user sudah punya label assignment. Ini mencegah bug dimana user manual yang login SSO otomatis pindah ke label ICCN.

#### 5. Onboarding Wajib
Sistem onboarding artis sudah ada — `ArtistOnboardingDialog` muncul otomatis di Dashboard jika `artist_profile_completed = false`. Tidak perlu perubahan di sini, sudah sesuai kebutuhan.

### File yang Akan Dibuat/Diedit

| File | Aksi |
|------|------|
| `src/integrations/lovable/*` | Auto-generated via Configure Social Auth |
| `src/pages/Auth.tsx` | Edit — tambah tombol Google Login |
| Database migration | Alter trigger `handle_new_user` → default role `artist` |
| `supabase/functions/sso-login/index.ts` | Fix — jangan overwrite `parent_label_id` jika sudah ada |

### Yang TIDAK Berubah
- Tidak perlu tabel baru
- Tidak perlu RLS baru
- Tidak perlu API key (managed by Lovable Cloud)
- Account linking → nanti (sesuai jawaban user)

