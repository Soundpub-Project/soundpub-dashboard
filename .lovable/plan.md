

## Perbaikan Bug Data Royalti Tidak Muncul untuk Artis, Whitelabel, dan Label

### Masalah

Halaman `dashboard/analytics` dan `dashboard/royalty-summary` menggunakan `fetchAllRoyalties()` yang mengambil data dari tabel `royalties` langsung via client-side query + RLS. Untuk 21rb+ data, ini membutuhkan 21+ batch sequential queries. RLS policies sudah benar memfilter per role, tapi prosesnya sangat lambat sehingga halaman tampak tidak menampilkan data.

Sementara itu, KPI cards sudah menggunakan RPC hooks yang cepat — tapi **semua tab detail** (Per Periode, Per Platform, Per Label, Per Artist, Per Lagu di RoyaltySummary; dan comparison chart + top performers di Analytics) masih bergantung 100% pada `fetchAllRoyalties()`.

### Solusi

Buat **RPC functions baru** di database untuk menghitung breakdown server-side (sudah terfilter per role), sehingga tidak perlu fetch 21rb row ke client.

### Database Migration — 5 RPC Functions Baru

1. **`get_royalty_period_summary()`** — Mengembalikan ringkasan per periode (revenue, streams, unique tracks/artists/labels, top platform, top country, growth). Untuk tab "Per Periode" di RoyaltySummary.

2. **`get_royalty_label_breakdown(_period text DEFAULT NULL)`** — Breakdown per label dengan revenue split. Untuk tab "Per Label".

3. **`get_royalty_artist_breakdown(_period text DEFAULT NULL, _limit int DEFAULT 20)`** — Breakdown per artis dengan track count dan revenue split. Untuk tab "Per Artist".

4. **`get_royalty_track_breakdown(_period text DEFAULT NULL)`** — Breakdown per ISRC/lagu dengan platform/country count dan revenue split. Untuk tab "Per Lagu" + CSV export.

5. **`get_royalty_comparison(_from_date text, _to_date text, _prev_from text, _prev_to text)`** — Mengembalikan current vs previous period data untuk Analytics comparison chart dan top performers.

Semua RPC menggunakan pola role-filter yang sama (SECURITY DEFINER + CASE WHEN admin/label/whitelabel/artist).

### Frontend Changes

**`src/hooks/useRoyaltyData.ts`** — Tambah 5 hooks baru:
- `useRoyaltyPeriodSummary()`
- `useRoyaltyLabelBreakdown(period)`
- `useRoyaltyArtistBreakdown(period, limit)`
- `useRoyaltyTrackBreakdown(period)`
- `useRoyaltyComparison(fromDate, toDate, prevFrom, prevTo)`

**`src/pages/RoyaltySummary.tsx`**:
- Hapus `fetchAllRoyalties()` dan semua state/useMemo yang bergantung padanya
- Gunakan hooks baru untuk setiap tab (periodSummaries, platformBreakdown, labelBreakdown, artistBreakdown, trackBreakdown)
- KPI tetap dari `useRoyaltyStats()` + filter period dari RPC
- CSV export dari data `useRoyaltyTrackBreakdown`

**`src/pages/Analytics.tsx`**:
- Hapus `fetchAllRoyalties()` dan semua state/useMemo yang bergantung padanya
- Gunakan `useRoyaltyComparison()` untuk chart dan top performers
- KPI tetap dari `useRoyaltyStats()`

**`src/pages/AllRoyalties.tsx`** — Tetap menggunakan `fetchAllRoyalties()` karena memang perlu data detail mentah untuk tabel.

### Hasil yang Diharapkan
- Data langsung muncul untuk semua role (artis, label, whitelabel) karena semua perhitungan dilakukan server-side
- Tidak ada lagi fetch 21rb+ row ke client untuk halaman summary/analytics
- Performa instant karena PostgreSQL menghitung agregasi langsung di database

