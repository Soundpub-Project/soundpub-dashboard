import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const getDatabaseSchema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'Soundpub'

const createSoundpubClient = (supabaseUrl: string, supabaseKey: string, options: any = {}) => {
  const existingDb = options.db || {}
  return createClient(supabaseUrl, supabaseKey, {
    ...options,
    db: { ...existingDb, schema: getDatabaseSchema() },
  })
}


// This endpoint is deliberately public (the landing-page catalog), so the
// wildcard origin stays — but it must therefore never return anything that is
// not already public. No credentials are accepted or echoed back.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * PostgREST `.or()` takes a filter *string*, so an unescaped value can add its
 * own conditions (`,` separates them, `)` closes the group). Strip the
 * metacharacters and cap the length before it reaches the query.
 */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()\\%*"']/g, " ").trim().slice(0, 80);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use service role to bypass RLS - this is safe because we only return public data
    const supabaseAdmin = createSoundpubClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Parse query params from URL
    const url = new URL(req.url);
    const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 100);
    const rawOffset = parseInt(url.searchParams.get("offset") || "0", 10);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
    const genre = url.searchParams.get("genre");
    const rawSearch = url.searchParams.get("search");
    const search = rawSearch ? sanitizeSearch(rawSearch) : null;

    // Build query for active releases with tracks.
    // `audio_url` (the full master) and the label's profile id are deliberately
    // not selected: this response is served to anonymous visitors, who only get
    // the preview `clip_url`.
    let query = supabaseAdmin
      .from("releases")
      .select(
        `
        id,
        title,
        artist_name,
        cover_url,
        genre,
        release_type,
        release_date,
        upc,
        label:profiles!releases_label_id_fkey (
          full_name
        ),
        tracks (
          id,
          title,
          artist_name,
          isrc,
          genre,
          clip_url,
          duration,
          explicit_lyrics
        )
      `,
      )
      .eq("status", "active")
      .is("archived_at", null)
      .order("release_date", { ascending: false });

    // Apply optional filters
    if (genre) {
      query = query.eq("genre", genre);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,artist_name.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: releases, error: releasesError } = await query;

    if (releasesError) {
      console.error("Error fetching releases:", releasesError);
      throw releasesError;
    }

    // Get total count for pagination
    let countQuery = supabaseAdmin
      .from("releases")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .is("archived_at", null);

    if (genre) {
      countQuery = countQuery.eq("genre", genre);
    }
    if (search) {
      countQuery = countQuery.or(`title.ilike.%${search}%,artist_name.ilike.%${search}%`);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error("Error getting count:", countError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: releases || [],
        pagination: {
          total: count || 0,
          limit,
          offset,
          hasMore: offset + limit < (count || 0),
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: unknown) {
    console.error("Edge function error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        data: [],
        pagination: { total: 0, limit: 50, offset: 0, hasMore: true },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
