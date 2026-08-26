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


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 500); // Max 100
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const genre = url.searchParams.get("genre");
    const search = url.searchParams.get("search");

    // Build query for active releases with tracks
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
          id,
          full_name
        ),
        tracks (
          id,
          title,
          artist_name,
          isrc,
          genre,
          audio_url,
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
