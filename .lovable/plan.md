## Jawaban singkat

Untuk SSO ICCN ada **dua kelompok** variabel — jangan dicampur:

### A. Frontend (build-time, `VITE_*` di `.env` / Workspace Build Secrets)
Dipakai oleh `src/lib/keycloak.ts` saat browser inisialisasi keycloak-js.

| Variable | Wajib | Contoh isi |
|---|---|---|
| `VITE_SSO_BASE_URL` | ✅ | `https://sso.iccn.or.id` (tanpa trailing slash) |
| `VITE_SSO_REALM` | ✅ | `playground` (staging) / `PORTALICCN` (prod) |
| `VITE_SSO_CLIENT_ID` | ✅ | `soundpub` |
| `VITE_SSO_AUTO_REDIRECT` | ❌ | `true` / `false` (default `false`) |

### B. Backend (Cloud Secrets — Edge Function `sso-login`)
Dipakai untuk verifikasi JWT + sinkronisasi profil.

| Secret | Wajib | Contoh isi |
|---|---|---|
| `SSO_REALM_URL` | ✅ | `https://sso.iccn.or.id/realms/playground` (staging) atau `https://sso.iccn.or.id/realms/PORTALICCN` (prod) |
| `SSO_CLIENT_ID` | ✅ | `soundpub` |
| `ICCN_MEDIA_LABEL_ID` | ✅ | UUID baris di `public.profiles` milik label "ICCN Media" (email `halo.iccn@gmail.com`) |
| `SSO_BASE_URL` | ❌ fallback | `https://sso.iccn.or.id` — hanya dipakai kalau `SSO_REALM_URL` kosong |
| `SSO_REALM` | ❌ fallback | `playground` / `PORTALICCN` — sama, fallback saja |

Jadi **jawaban pertanyaan**: betul, tiga secret backend yang wajib adalah `SSO_CLIENT_ID`, `SSO_REALM_URL`, dan `ICCN_MEDIA_LABEL_ID`. Tapi di frontend masih butuh tiga `VITE_SSO_*` lain agar tombol login bisa redirect ke Keycloak.

> Catatan: edge function `sso-login` saat ini tidak butuh `SSO_CLIENT_SECRET` karena PKCE (public client). Jangan tambahkan secret itu kecuali Keycloak client diubah jadi confidential.

---

## Rencana update

1. **`docs/SSO-INTEGRATION-DOCS.md`** — di section "Secrets yang Diperlukan":
   - Pisahkan jadi dua tabel: **Frontend (VITE_*)** dan **Backend (Cloud Secrets)**.
   - Tambah kolom contoh nilai + tandai opsional vs wajib.
   - Tambah catatan cara mendapatkan `ICCN_MEDIA_LABEL_ID` (query `select id from profiles where email='halo.iccn@gmail.com'`).
   - Tambah catatan tentang fallback `SSO_BASE_URL` + `SSO_REALM`.

2. **`.env.example`** — di blok "CLOUD SECRETS" tambah contoh isi + opsional fallback, dan rapikan komentar realm staging/production.

3. **`docs/MIGRATION-CHECKLIST.md`** — section SSO:
   - Pastikan checklist memuat 3 backend secret wajib + 3 frontend VITE wajib + 1 opsional masing-masing.
   - Tambah langkah verifikasi `ICCN_MEDIA_LABEL_ID` (cek UUID).

4. **`docs/MIGRATION-GUIDE.md`** — bagian SSO env vars:
   - Update daftar lengkap (saat ini hanya menyebut `VITE_SSO_BASE_URL/REALM/CLIENT_ID`).
   - Tambahkan langkah set Cloud Secrets backend + cara cari UUID label ICCN Media.

5. **`docs/plan/Integrasi_SSO_ICCN.md`** — pastikan daftar env var di-sync (saat ini menyebut `SSO_BASE_URL/REALM/CLIENT_ID` saja, hilang `SSO_REALM_URL` dan `ICCN_MEDIA_LABEL_ID`).

**Yang TIDAK diubah:** logika edge function, `keycloak.ts`, atau struktur DB — hanya dokumentasi + `.env.example`.

Setuju lanjut implement? Atau ada nilai spesifik (mis. realm production yang dipakai sekarang) yang mau saya hardcode di docs?
