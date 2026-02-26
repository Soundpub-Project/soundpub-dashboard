

## Mempercepat Loading Royalti dengan Database Aggregation

### Masalah

Saat ini, **21,734 baris** data royalti diambil seluruhnya ke browser dalam 22 request berurutan (batch 1000). Ini menyebabkan:
- Loading lama (5-15 detik tergantung koneksi)
- Browser harus memproses 21rb+ objek untuk menghitung total, chart, dll
- Setiap halaman yang butuh data royalti melakukan hal yang sama

### Solusi: Pindahkan Perhitungan ke Database

Daripada mengambil semua baris ke browser, kita buat **fungsi database** yang menghitung agregasi langsung di server. Hasilnya: 1 request cepat menggantikan 22 request lambat.

#### 1. Fungsi Database Baru (3 RPC functions)

**`get_royalty_stats`** - Untuk Dashboard & KPI cards:
- Total revenue, total streams, jumlah artis/label/platform/track unik
- 1 query ringan, hasil instan

**`get_royalty_monthly_summary`** - Untuk chart bulanan:
- Revenue & streams per periode
- Sudah di-group dan di-sort di database

**`get_royalty_platform_summary`** - Untuk chart platform:
- Revenue & streams per platform, top 10
- Sudah di-sort berdasarkan revenue

#### 2. Perubahan di Halaman

**Dashboard (`src/pages/Dashboard.tsx`)**:
- Ganti `fetchAllRoyalties()` dengan 3 RPC call ringan via `Promise.all`
- Loading chart akan instan (< 1 detik vs 5-15 detik)

**Royalties (`src/pages/Royalties.tsx`)**:
- Gunakan RPC untuk KPI cards dan chart data
- Tabel detail tetap fetch per-halaman (hanya 100 baris yang ditampilkan)

**RoyaltySummary (`src/pages/RoyaltySummary.tsx`)**:
- Gunakan RPC untuk aggregasi utama
- Detail breakdown tetap pakai client-side tapi dengan select kolom minimal

**Analytics (`src/pages/Analytics.tsx`)**:
- Gunakan RPC untuk KPI
- Untuk comparison chart yang butuh filter tanggal, tetap fetch tapi hanya kolom yang diperlukan

**AllRoyalties (`src/pages/AllRoyalties.tsx`)**:
- KPI cards pakai RPC (instan)
- Tabel detail: fetch hanya halaman yang ditampilkan (server-side pagination)
- Breakdown tabs: buat RPC tambahan untuk artist/label/track breakdown

#### 3. Server-Side Pagination untuk Tabel Detail

Untuk halaman AllRoyalties, daripada fetch 21rb baris lalu paginate di browser:
- Fetch hanya baris yang ditampilkan (misal 20 baris per halaman)
- Filter dan search dilakukan di database
- Tambah RPC `get_royalties_paginated` dengan parameter search, filter, offset, limit

### Perkiraan Peningkatan Kecepatan

```text
Sebelum:  22 requests x ~300ms = ~7 detik minimum
Sesudah:  1-3 requests x ~100ms = < 0.5 detik
```

### Detail Teknis

**Migrasi Database - 4 RPC Functions:**

1. `get_royalty_stats()` - Returns: total_revenue, total_streams, unique_artists, unique_labels, unique_platforms, unique_tracks
2. `get_royalty_monthly_summary()` - Returns: period, revenue, streams (sorted)
3. `get_royalty_platform_summary(limit_count)` - Returns: platform, revenue, streams (top N)
4. `get_royalties_paginated(search, period_filter, label_filter, artist_filter, page_offset, page_limit)` - Returns: paginated rows + total count

**File yang diubah:**
1. `src/pages/Dashboard.tsx` - Ganti fetchAllRoyalties dengan RPC calls
2. `src/pages/Royalties.tsx` - Ganti fetchAllRoyalties dengan RPC untuk aggregasi
3. `src/pages/RoyaltySummary.tsx` - Gunakan RPC untuk summary data
4. `src/pages/Analytics.tsx` - Gunakan RPC untuk KPI, fetch minimal untuk comparison
5. `src/pages/AllRoyalties.tsx` - Server-side pagination + RPC untuk KPI & breakdowns
6. `src/lib/fetchAllRoyalties.ts` - Tetap ada sebagai fallback, tapi tidak lagi dipakai di halaman utama

**Tidak ada perubahan UI** - Tampilan tetap sama, hanya jauh lebih cepat.

