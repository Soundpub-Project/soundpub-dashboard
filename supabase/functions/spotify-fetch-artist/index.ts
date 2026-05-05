import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function parseArtistId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Direct ID (22-char alphanumeric)
  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return trimmed;
  // open.spotify.com URL or spotify:artist:id URI
  const urlMatch = trimmed.match(/artist[/:]([A-Za-z0-9]{22})/);
  return urlMatch ? urlMatch[1] : null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }
  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials not configured");
  }
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Spotify token error: ${res.status} ${txt}`);
  }
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 200);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return json({ error: "Unauthorized" }, 200);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? (body?.q ? "search" : "fetch"));
    const accessToken = await getSpotifyToken();
    const headers = { Authorization: `Bearer ${accessToken}` };

    // ---- SEARCH action ----
    if (action === "search") {
      const q = String(body?.q ?? "").trim();
      if (q.length < 2) {
        return json({ error: "Minimal 2 karakter untuk search" }, 200);
      }
      const sRes = await fetch(
        `https://api.spotify.com/v1/search?type=artist&limit=8&market=ID&q=${encodeURIComponent(q)}`,
        { headers },
      );
      if (!sRes.ok) {
        const txt = await sRes.text();
        return json({ error: `Spotify search error (${sRes.status}): ${txt.slice(0, 200)}` }, 200);
      }
      const sData = await sRes.json();
      const results = (sData.artists?.items ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        url: a.external_urls?.spotify,
        image: a.images?.[0]?.url ?? null,
        followers: a.followers?.total ?? 0,
        genres: a.genres ?? [],
        popularity: a.popularity ?? 0,
      }));
      return json({ data: results }, 200);
    }

    // ---- FETCH action (default) ----
    const input = String(body?.artist_url_or_id ?? "").trim();
    const artistId = parseArtistId(input);
    if (!artistId) {
      return json({ error: "URL atau ID Spotify Artist tidak valid" }, 200);
    }

    const [artistRes, topRes] = await Promise.all([
      fetch(`https://api.spotify.com/v1/artists/${artistId}`, { headers }),
      fetch(
        `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=ID`,
        { headers },
      ),
    ]);

    if (!artistRes.ok) {
      const txt = await artistRes.text();
      return json(
        { error: `Spotify API error (${artistRes.status}): ${txt.slice(0, 200)}` },
        200,
      );
    }

    const artist = await artistRes.json();
    const top = topRes.ok ? await topRes.json() : { tracks: [] };

    const result = {
      id: artist.id,
      name: artist.name,
      url: artist.external_urls?.spotify,
      images: artist.images ?? [],
      followers: artist.followers?.total ?? 0,
      genres: artist.genres ?? [],
      popularity: artist.popularity ?? 0,
      top_tracks: (top.tracks ?? []).slice(0, 5).map((t: any) => ({
        id: t.id,
        name: t.name,
        preview_url: t.preview_url,
        album: t.album?.name,
        image: t.album?.images?.[0]?.url,
        url: t.external_urls?.spotify,
      })),
    };

    return json({ data: result }, 200);
  } catch (err) {
    console.error("spotify-fetch-artist error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      200,
    );
  }
});