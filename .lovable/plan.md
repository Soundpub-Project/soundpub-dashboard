

## Analisis Dokumentasi ICCN — API Detail Layanan

### Apa Isi Dokumentasi Ini?

Dokumentasi dari ICCN (Indonesia Creative Cities Network) ini meminta platform SoundPub untuk **menyediakan endpoint GET publik** yang mengembalikan:

1. **Deskripsi layanan** platform (plain text, maks 1000 karakter)
2. **Galeri foto** layanan (1-10 foto, format URL absolut publik)

Format response yang diminta:

```text
GET https://<platform-domain>/api/layanan

Response:
{
  "status": "success",
  "message": "Data retrieved successfully",
  "data": {
    "desc": "Deskripsi layanan platform...",
    "photos": [
      "https://domain.com/images/foto-1.jpg",
      "https://domain.com/images/foto-2.jpg"
    ]
  }
}
```

---

### Yang Perlu Diimplementasikan

#### 1. Edge Function: `get-service-info`
Endpoint GET publik yang mengembalikan data deskripsi dan foto sesuai kontrak API ICCN. Data diambil dari tabel `app_settings` sehingga bisa dikelola admin tanpa deploy ulang.

#### 2. Tabel/Settings Baru di `app_settings`
Tambah key:
- `iccn_service_desc` — teks deskripsi layanan (maks 1000 karakter)
- `iccn_service_photos` — JSON array berisi URL foto (1-10 item)

#### 3. Menu Admin: "Integrasi ICCN" (di Settings atau menu baru)
Halaman Super Admin untuk mengelola data yang dikembalikan endpoint:
- **Textarea** untuk mengedit deskripsi layanan (dengan counter 1000 karakter)
- **Upload galeri** foto (1-10 foto) ke storage bucket publik, tampilkan preview, drag-to-reorder, hapus
- **Tombol Test** untuk preview response JSON yang akan dikembalikan endpoint
- Menampilkan URL endpoint yang bisa di-copy untuk diberikan ke tim ICCN

#### 4. Update Whitelist `update-app-settings`
Tambah `iccn_service_desc` dan `iccn_service_photos` ke whitelist key di edge function `update-app-settings`.

---

### Alur Kerja

```text
Super Admin buka Settings → Integrasi ICCN
        │
        ▼
Isi deskripsi + upload foto galeri
        │
        ▼
Simpan ke app_settings via update-app-settings
        │
        ▼
ICCN memanggil GET /functions/v1/get-service-info
        │
        ▼
Response JSON sesuai kontrak API ICCN
```

---

### File yang Akan Dibuat/Diedit

| File | Aksi |
|------|------|
| `supabase/functions/get-service-info/index.ts` | Buat — endpoint GET publik |
| `src/components/settings/IccnIntegrationSettings.tsx` | Buat — UI admin kelola desc + foto |
| `src/pages/Settings.tsx` | Edit — tambah section ICCN untuk superadmin |
| `supabase/functions/update-app-settings/index.ts` | Edit — whitelist key baru |
| `supabase/config.toml` | Edit — config function baru |
| Database migration | Insert default app_settings keys |

---

### Ringkasan Fitur

- Endpoint GET publik tanpa auth sesuai spesifikasi ICCN
- Admin panel untuk edit deskripsi layanan dan upload galeri foto
- Validasi: deskripsi maks 1000 karakter, foto 1-10 item, format jpg/jpeg/png/webp
- Error handling sesuai kontrak (status 200/500)
- URL endpoint bisa di-copy dari admin panel

