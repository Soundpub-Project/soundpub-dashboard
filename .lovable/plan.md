

## Plan: Fix SSO Bugs + Fitur Hapus Upload Royalti

### Bug #1 & #2: SSO ICCN — Token Tidak Terdeteksi & Tombol Tidak Berfungsi

**Akar masalah:** Fungsi `initKeycloakAndLogin()` menggunakan singleton `keycloakInstance`. Jika Keycloak sudah pernah di-init (misalnya dari callback sebelumnya), instance lama masuk status stale dan `kc.login()` gagal tanpa error yang terlihat. Selain itu, saat kembali dari SSO ICCN, `initKeycloak()` mungkin gagal memproses code/state karena instance sudah terinisialisasi sebelumnya.

**Solusi:**
1. **`src/lib/keycloak.ts`** — Reset `keycloakInstance` ke `null` sebelum setiap init baru (`initKeycloak` dan `initKeycloakAndLogin`), sehingga selalu mendapatkan instance Keycloak yang fresh. Tambahkan error logging yang lebih detail.

2. **`src/context/SsoAuthContext.tsx`** — Tambahkan handling ketika `initKeycloak()` mengembalikan `false` (callback gagal/token tidak terdeteksi): bersihkan URL params dan set error message yang jelas, TANPA redirect. Tambahkan console.log untuk debugging flow.

3. **`src/pages/Auth.tsx`** — Pastikan tombol SSO menampilkan error dari `ssoError` jika ada, agar user tahu apa yang terjadi.

### Fitur #3: Hapus Upload Royalti + Rollback Saldo

**Cara kerja:**
- Buat edge function `delete-royalty-upload` yang:
  1. Menerima `upload_id`
  2. Query semua `royalties` dengan `upload_id` tersebut
  3. Hitung total `net_revenue` per `artist_user_id` (dengan split 70/21/9)
  4. Kurangi saldo di `profiles.balance` dan `profiles.label_revenue` / `profiles.artist_revenue`
  5. Hapus semua row dari `royalties` dengan `upload_id`
  6. Hapus record dari `royalty_uploads`
  7. Catat di `audit_logs`

- Update `src/pages/UploadRoyalty.tsx`:
  - Tambah tombol "Hapus" per row di tabel Riwayat Upload
  - Tambah `AlertDialog` konfirmasi dengan peringatan rollback saldo
  - Panggil edge function dan refresh data setelah berhasil

### File yang Diedit/Dibuat

| File | Aksi |
|------|------|
| `src/lib/keycloak.ts` | Edit — reset instance sebelum init |
| `src/context/SsoAuthContext.tsx` | Edit — better error handling, no redirect on failure |
| `src/pages/Auth.tsx` | Edit — tampilkan ssoError |
| `supabase/functions/delete-royalty-upload/index.ts` | Baru — edge function hapus + rollback |
| `src/pages/UploadRoyalty.tsx` | Edit — tambah tombol hapus + dialog konfirmasi |

