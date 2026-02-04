
# ✅ IMPLEMENTED: Migrasi Name-Based ke ID-Based Matching

## Status: COMPLETE ✅

Sistem saat ini menggunakan **name-based matching** untuk menghubungkan artist dengan releases, tracks, dan royalties. Pendekatan ini memiliki kelemahan signifikan yang perlu diperbaiki dengan migrasi ke **ID-based matching**.

---

## Analisis Masalah Saat Ini

### Bagaimana Sistem Bekerja Sekarang

```text
+------------------+          +------------------+          +------------------+
|     profiles     |          |     releases     |          |     royalties    |
+------------------+          +------------------+          +------------------+
| id (uuid)        |    ?     | artist_name (text)|    ?    | artist (text)    |
| full_name (text) |<-------->| label_id (uuid)  |<-------->| label_name (text)|
+------------------+          +------------------+          +------------------+
        |                              
        | RLS Policy menggunakan:
        | artist_name = get_user_full_name(auth.uid())
        v
    MATCH BY NAME (Tidak Reliable!)
```

### RLS Policies yang Menggunakan Name-Matching

| Table | Policy | Kondisi |
|-------|--------|---------|
| `releases` | Artists can view their releases | `artist_name = get_user_full_name(auth.uid())` |
| `tracks` | Artists can view their tracks | `artist_name = get_user_full_name(auth.uid())` |
| `royalties` | Artists can view their royalties | `artist = get_user_full_name(auth.uid())` |

### Masalah yang Ditimbulkan

1. **Typo Sensitivity**: "John Doe" vs "John  Doe" (extra space) = tidak match
2. **Case Sensitivity**: "john doe" vs "John Doe" = tidak match
3. **Name Changes**: Jika admin mengubah nama di profiles, koneksi ke releases lama putus
4. **Duplicate Names**: Dua artist dengan nama sama = conflict
5. **No Referential Integrity**: Tidak ada foreign key, data bisa mismatch

---

## Solusi: ID-Based Matching

### Arsitektur Baru

```text
+------------------+          +------------------+          +------------------+
|     profiles     |          |     releases     |          |     tracks       |
+------------------+          +------------------+          +------------------+
| id (uuid) PK     |<---------| artist_user_id   |          | artist_user_id   |
| full_name (text) |   FK     | artist_name (text)|         | artist_name (text)|
| parent_label_id  |          | label_id (uuid)  |          | artists (jsonb)  |
+------------------+          +------------------+          +------------------+
        ^                              |                            |
        |                              |                            |
        +------------------------------+----------------------------+
                       MATCH BY UUID (Reliable!)
```

### Keuntungan ID-Based Matching

| Aspek | Name-Based | ID-Based |
|-------|------------|----------|
| Typo Resistance | Tidak | Ya |
| Case Sensitivity | Sensitive | N/A |
| Name Changes | Putus koneksi | Tetap terhubung |
| Referential Integrity | Tidak ada | Foreign Key |
| Performance | String comparison | UUID comparison |

---

## Langkah Implementasi

### Fase 1: Perubahan Database Schema

**Tabel `releases`:**
- Tambah kolom `artist_user_id` (UUID, nullable, FK ke profiles.id)
- Kolom `artist_name` tetap dipertahankan untuk display dan backward compatibility

**Tabel `tracks`:**
- Tambah kolom `artist_user_id` (UUID, nullable, FK ke profiles.id)  
- Field `artists` (jsonb) diupdate untuk menyimpan `{id, name, type}` bukan hanya `{name, type}`

**Tabel `royalties`:**
- Tambah kolom `artist_user_id` (UUID, nullable)
- Kolom `artist` (text) tetap untuk import CSV dari distributor

### Fase 2: Migrasi Data Existing

Script migrasi akan mencocokkan data existing berdasarkan nama dan mengisi `artist_user_id`:

```sql
-- Contoh logic migrasi
UPDATE releases r
SET artist_user_id = p.id
FROM profiles p
JOIN user_roles ur ON p.id = ur.user_id
WHERE ur.role = 'artist'
  AND LOWER(TRIM(r.artist_name)) = LOWER(TRIM(p.full_name))
  AND r.artist_user_id IS NULL;
```

### Fase 3: Update RLS Policies

Policies baru akan menggunakan ID:

```sql
-- Releases policy baru
CREATE POLICY "Artists can view their releases" ON public.releases
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'artist') AND (
      artist_user_id = auth.uid()
      OR artist_name = get_user_full_name(auth.uid()) -- fallback
    )
  );
```

### Fase 4: Update Frontend Components

| Component | Perubahan |
|-----------|-----------|
| `ReleaseFormDialog.tsx` | Simpan `artist_user_id` saat pilih artist dari dropdown |
| `ArtistSelector.tsx` | Return both `id` dan `name` |
| `Releases.tsx` | Query berdasarkan `artist_user_id` jika tersedia |
| `ReleaseDetail.tsx` | Tampilkan artist info dari profiles jika `artist_user_id` ada |

### Fase 5: Update Backend Functions

| Function | Perubahan |
|----------|-----------|
| `create-user` | Tidak ada perubahan (already syncs to artists table) |
| `process-royalty-upload` | Auto-match `artist_user_id` dari nama saat import |

---

## Database Function Baru

### `get_artist_user_id_by_name`

Function helper untuk mencari artist ID berdasarkan nama dengan fuzzy matching:

```sql
CREATE OR REPLACE FUNCTION public.get_artist_user_id_by_name(_artist_name TEXT, _label_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM profiles p
  JOIN user_roles ur ON p.id = ur.user_id
  WHERE ur.role = 'artist'
    AND LOWER(TRIM(p.full_name)) = LOWER(TRIM(_artist_name))
    AND (_label_id IS NULL OR p.parent_label_id = _label_id)
  LIMIT 1
$$;
```

---

## Timeline Implementasi

| Fase | Durasi | Deskripsi |
|------|--------|-----------|
| 1 | 1 sesi | Database migration (tambah kolom, indexes) |
| 2 | 1 sesi | Data migration script + RLS policies update |
| 3 | 1-2 sesi | Frontend components update |
| 4 | 1 sesi | Backend edge functions update |
| 5 | 1 sesi | Testing & validation |

---

## Backward Compatibility

Sistem akan tetap **backward compatible**:

1. Kolom `artist_name` (text) tetap ada dan terisi
2. RLS policies menggunakan **hybrid approach**: cek `artist_user_id` dulu, fallback ke `artist_name`
3. Data lama tanpa `artist_user_id` tetap accessible via name matching
4. Data baru akan selalu memiliki `artist_user_id`

---

## Risiko dan Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Data migration gagal match | Manual review untuk unmatched records |
| Performance degradation | Indexes pada kolom baru |
| Existing integrations break | Hybrid RLS policies untuk transisi |

---

## Deliverables

1. Database migration SQL untuk schema changes
2. Data migration script untuk existing records
3. Updated RLS policies (hybrid)
4. Updated frontend components
5. Updated edge functions
6. Updated documentation (`full-schema-v2.sql`)
7. Testing checklist

---

## Bagian Teknis Detail

### SQL Migration Script

```sql
-- 1. Add artist_user_id to releases
ALTER TABLE public.releases 
ADD COLUMN IF NOT EXISTS artist_user_id UUID REFERENCES public.profiles(id);

-- 2. Add artist_user_id to tracks
ALTER TABLE public.tracks
ADD COLUMN IF NOT EXISTS artist_user_id UUID REFERENCES public.profiles(id);

-- 3. Add artist_user_id to royalties
ALTER TABLE public.royalties
ADD COLUMN IF NOT EXISTS artist_user_id UUID;

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_releases_artist_user_id ON public.releases(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_artist_user_id ON public.tracks(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_royalties_artist_user_id ON public.royalties(artist_user_id);

-- 5. Migrate existing data
UPDATE releases r
SET artist_user_id = (
  SELECT p.id 
  FROM profiles p
  JOIN user_roles ur ON p.id = ur.user_id
  WHERE ur.role = 'artist'
    AND LOWER(TRIM(r.artist_name)) = LOWER(TRIM(p.full_name))
    AND (r.label_id = p.parent_label_id OR p.parent_label_id IS NULL)
  LIMIT 1
)
WHERE r.artist_user_id IS NULL;
```

### Updated RLS Policy Example

```sql
DROP POLICY IF EXISTS "Artists can view their releases" ON public.releases;
CREATE POLICY "Artists can view their releases" ON public.releases
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'artist') AND (
      -- Primary: ID-based matching
      artist_user_id = auth.uid()
      -- Fallback: Name-based matching untuk backward compatibility
      OR (artist_user_id IS NULL AND artist_name = get_user_full_name(auth.uid()))
    )
  );
```

### Frontend Component Update (ReleaseFormDialog)

```typescript
// Saat menyimpan release
const onSubmit = async (values: ReleaseFormValues) => {
  // Find artist_user_id from selected artist
  const selectedArtist = labelArtists.find(a => a.name === values.artist_name);
  
  const releaseData = {
    ...values,
    artist_user_id: selectedArtist?.user_id || null, // NEW: Include user_id
    artist_name: values.artist_name, // Keep for display
  };
  
  // ... save logic
};
```

---

## Kesimpulan

Migrasi ini akan membuat sistem lebih robust, menghilangkan masalah typo dan case sensitivity, serta memungkinkan artist untuk mengubah nama tanpa kehilangan akses ke releases mereka. Sistem tetap backward compatible sehingga tidak ada downtime atau data loss selama transisi.
