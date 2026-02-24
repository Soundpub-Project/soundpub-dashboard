

## Perbaikan Tampilan Total Royalti & Halaman Admin All Royalties

### Masalah yang Ditemukan

Database memiliki **21,734 baris** data royalti, tetapi Supabase memiliki batas default **1,000 baris per query**. Semua halaman yang menampilkan royalti (`Royalties.tsx`, `RoyaltySummary.tsx`, `Dashboard.tsx`) menggunakan `.select('*')` tanpa menangani limit ini, sehingga hanya ~1,000 baris yang ditampilkan.

### Solusi

#### 1. Perbaiki Fetch Royalti - Pagination Loop (semua halaman terkait)

Membuat helper function yang melakukan fetch seluruh data royalti dengan loop pagination (batch 1000 baris per request) sampai semua data terambil:

```text
fetchAllRoyalties():
  allData = []
  offset = 0
  BATCH = 1000
  loop:
    fetch royalties range(offset, offset + BATCH - 1)
    append to allData
    if returned < BATCH -> break
    offset += BATCH
  return allData
```

Halaman yang diperbaiki:
- `src/pages/Royalties.tsx` - Halaman Royalty Overview
- `src/pages/RoyaltySummary.tsx` - Halaman Ringkasan Royalti
- `src/pages/Dashboard.tsx` - Halaman Dasbor (fetch royalti untuk chart & total)
- `src/pages/Analytics.tsx` - Halaman Analitik

#### 2. Halaman Baru: All Royalties (Admin/Superadmin Only)

Membuat halaman baru `src/pages/AllRoyalties.tsx` yang menampilkan semua data royalti secara komprehensif, khusus untuk Admin dan Superadmin.

Fitur halaman:
- **KPI Cards**: Total Revenue, Total Streams, Total Artis, Total Label, Total Tracks, Total Platform
- **Filter**: Pencarian (ISRC, judul, artis, label, platform), filter periode, filter label, filter artis
- **Tabel Detail**: Semua baris royalti dengan kolom Period, ISRC, Judul, Artis, Label, Platform, Negara, Tipe Sales, Streams, Revenue
- **Pagination**: Tabel dengan paginasi client-side (10/20/50/100 per halaman)
- **Breakdown Tabs**:
  - Per Artis: daftar artis dengan total revenue, streams, jumlah lagu
  - Per Label: daftar label dengan total revenue, streams, jumlah artis
  - Per Track: daftar lagu (by ISRC) dengan total revenue, streams, platform count
- **Export CSV**: Tombol export untuk semua data atau data yang sudah difilter

#### 3. Routing & Sidebar

- Route baru: `/dashboard/all-royalties`
- Ditambahkan ke sidebar di grup **Administrasi** dengan ikon `ListMusic`
- Dilindungi `ProtectedRoute` dengan `requireAdmin`
- Hanya muncul untuk role `superadmin` dan `admin`

### Detail Teknis

**File yang diubah:**
1. `src/pages/Royalties.tsx` - Perbaiki fetch dengan pagination loop
2. `src/pages/RoyaltySummary.tsx` - Perbaiki fetch dengan pagination loop
3. `src/pages/Dashboard.tsx` - Perbaiki fetch royalti dengan pagination loop
4. `src/pages/Analytics.tsx` - Perbaiki fetch dengan pagination loop
5. `src/components/layout/AppSidebar.tsx` - Tambah menu "Semua Royalti" di grup Administrasi
6. `src/App.tsx` - Tambah route `/dashboard/all-royalties`

**File baru:**
1. `src/pages/AllRoyalties.tsx` - Halaman lengkap all royalties untuk admin

**Pagination helper pattern:**
```typescript
const fetchAllRoyalties = async () => {
  const allData: Royalty[] = [];
  const BATCH_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('royalties')
      .select('*')
      .order('period', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;
    if (data) allData.push(...data);
    hasMore = (data?.length || 0) === BATCH_SIZE;
    offset += BATCH_SIZE;
  }

  return allData;
};
```

Tidak ada perubahan database yang diperlukan - masalah ini murni di sisi frontend.

