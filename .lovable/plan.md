
# Rencana: Memisahkan Akses Public Landing Page dan Dashboard dengan Edge Function

## Ringkasan Masalah

RLS policy "Public can view active releases" yang ditambahkan menyebabkan semua user authenticated (artis, label, whitelabel, hak cipta) dapat melihat SEMUA data releases/tracks yang berstatus `active`, bukan hanya data milik mereka sendiri.

**Penyebab:** RLS policies bersifat **ADDITIVE (OR)**. Jika satu policy return `true`, user mendapat akses ke data tersebut.

---

## Solusi: Edge Function untuk Public Catalog

Membuat edge function `get-catalog-tracks` yang bypass RLS menggunakan service role, khusus untuk landing page public.

**Alur Data:**

```text
+------------------+     +-------------------+     +------------------+
|  Landing Page    | --> | get-catalog-tracks| --> | Database         |
|  (Public/Guest)  |     | (Edge Function)   |     | (Service Role)   |
+------------------+     +-------------------+     +------------------+
                              |
                              v
                         Returns only:
                         - status = 'active'
                         - Selected fields only

+------------------+     +-------------------+     +------------------+
|  Dashboard       | --> | Supabase Client   | --> | Database         |
|  (Authenticated) |     | (RLS Enabled)     |     | (User's JWT)     |
+------------------+     +-------------------+     +------------------+
                              |
                              v
                         Returns data per role:
                         - Admin: all data
                         - Label: own releases
                         - Artist: own releases
```

---

## Langkah Implementasi

### 1. Hapus RLS Policies Public

Menghapus 2 policy yang menyebabkan masalah:

```sql
-- Hapus policy dari releases
DROP POLICY IF EXISTS "Public can view active releases" ON public.releases;

-- Hapus policy dari tracks
DROP POLICY IF EXISTS "Public can view tracks in active releases" ON public.tracks;
```

### 2. Buat Edge Function `get-catalog-tracks`

File: `supabase/functions/get-catalog-tracks/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use service role to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Parse query params
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Fetch active releases with tracks
    const { data: releases, error: releasesError } = await supabaseAdmin
      .from("releases")
      .select(`
        id,
        title,
        artist_name,
        cover_url,
        genre,
        release_type,
        release_date,
        upc,
        tracks (
          id,
          title,
          artist_name,
          isrc,
          genre,
          audio_url,
          clip_url,
          duration
        )
      `)
      .eq("status", "active")
      .is("archived_at", null)
      .order("release_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (releasesError) throw releasesError;

    // Get total count
    const { count } = await supabaseAdmin
      .from("releases")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .is("archived_at", null);

    return new Response(
      JSON.stringify({
        success: true,
        data: releases,
        pagination: {
          total: count,
          limit,
          offset,
          hasMore: offset + limit < (count || 0),
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
```

### 3. Buat Landing Page Component

File: `src/pages/LandingPage.tsx` (atau update sesuai kebutuhan)

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CatalogRelease {
  id: string;
  title: string;
  artist_name: string;
  cover_url: string | null;
  genre: string | null;
  release_type: string;
  release_date: string | null;
  tracks: CatalogTrack[];
}

interface CatalogTrack {
  id: string;
  title: string;
  artist_name: string;
  isrc: string | null;
  clip_url: string | null;
  duration: number | null;
}

export default function LandingPage() {
  const [releases, setReleases] = useState<CatalogRelease[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCatalog();
  }, []);

  const fetchCatalog = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-catalog-tracks', {
        body: { limit: 50, offset: 0 }
      });

      if (error) throw error;
      setReleases(data.data || []);
    } catch (error) {
      console.error('Error fetching catalog:', error);
    } finally {
      setLoading(false);
    }
  };

  // ... render UI
}
```

### 4. Update Route di App.tsx

Menambahkan route untuk landing page yang bisa diakses public.

---

## Hasil Akhir

| Halaman | Method | Akses Data |
|---------|--------|------------|
| **Landing Page** | Edge Function `get-catalog-tracks` | Semua releases dengan status `active` |
| **Dashboard - Admin** | Supabase Client + RLS | Semua data |
| **Dashboard - Label** | Supabase Client + RLS | Hanya releases milik label tersebut |
| **Dashboard - Artist** | Supabase Client + RLS | Hanya releases dengan nama artis tersebut |
| **Dashboard - Whitelabel** | Supabase Client + RLS | Hanya releases milik whitelabel tersebut |
| **Dashboard - Copyright** | Supabase Client + RLS | Sesuai policy yang ada |

---

## Keuntungan Solusi Ini

1. **Tidak mengubah RLS policies existing** - Dashboard tetap bekerja dengan benar per role
2. **Keamanan terjaga** - Edge function hanya return field yang diperlukan untuk public
3. **Fleksibel** - Bisa menambahkan filter, sorting, atau pagination sesuai kebutuhan landing page
4. **Performa** - Edge function bisa di-cache jika diperlukan

---

## Catatan Penting

- Secrets `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` sudah tersedia
- Edge function akan otomatis di-deploy
- Jangan expose field sensitif seperti `label_id` atau internal IDs di response public
