import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const getDatabaseSchema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'soundpub'

const createSoundpubClient = (supabaseUrl: string, supabaseKey: string, options: any = {}) => {
  const existingDb = options.db || {}
  return createClient(supabaseUrl, supabaseKey, {
    ...options,
    db: { ...existingDb, schema: getDatabaseSchema() },
  })
}


const SOUNDPUB_LABEL_ID = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'
const SOUNDPUB_LABEL_ALIASES = new Set(['soundpub', 'soundpub music', 'soundpub music ecosystem'])
const normalizeName = (value: string | null | undefined) => (value || '').trim().toLowerCase()
const isSoundpubLabel = (labelUserId: string | null | undefined, labelName: string | null | undefined) => {
  return labelUserId === SOUNDPUB_LABEL_ID || SOUNDPUB_LABEL_ALIASES.has(normalizeName(labelName))
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function respond(ok: boolean, body: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok, ...body }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respond(false, { error: "Missing Authorization header" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAnon = createSoundpubClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser();
    if (userError || !user) {
      return respond(false, { error: "Unauthorized" });
    }

    const supabaseAdmin = createSoundpubClient(supabaseUrl, serviceRoleKey);

    const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { user_id: user.id });
    if (!isAdmin) {
      return respond(false, { error: "Only admins can delete uploads" });
    }

    const { upload_id } = await req.json();
    if (!upload_id) {
      return respond(false, { error: "upload_id is required" });
    }

    // 1. Get upload record
    const { data: upload, error: uploadError } = await supabaseAdmin
      .from("royalty_uploads")
      .select("*")
      .eq("id", upload_id)
      .single();

    if (uploadError || !upload) {
      return respond(false, { error: "Upload not found" });
    }

    // 2. Get all royalties for this upload (handle >1000 rows)
    let allRoyalties: Array<{ net_revenue: number; artist_user_id: string | null; label_user_id: string | null; label_name: string }> = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error: pageError } = await supabaseAdmin
        .from("royalties")
        .select("net_revenue, artist_user_id, label_user_id, label_name")
        .eq("upload_id", upload_id)
        .range(from, from + pageSize - 1);

      if (pageError) throw new Error(`Failed to fetch royalties: ${pageError.message}`);
      if (!page || page.length === 0) break;
      allRoyalties = allRoyalties.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    // 3. Calculate balance rollbacks per artist_user_id
    const balanceMap: Record<string, { balance: number; artistRevenue: number; labelRevenue: number }> = {};

    for (const row of allRoyalties) {
      if (!row.artist_user_id) continue;
      const uid = row.artist_user_id;
      if (!balanceMap[uid]) {
        balanceMap[uid] = { balance: 0, artistRevenue: 0, labelRevenue: 0 };
      }
      const soundpubLabel = isSoundpubLabel(row.label_user_id, row.label_name);
      const artistShare = Number(row.net_revenue) * (soundpubLabel ? 0.70 : 0.49);
      balanceMap[uid].balance += artistShare;
      balanceMap[uid].artistRevenue += artistShare;
    }

    // Label/whitelabel revenue rollback by stable label_user_id, fallback by label_name.
    const labelRevenueMap: Record<string, number> = {};
    const labelRevenueById: Record<string, number> = {};
    for (const row of allRoyalties) {
      const soundpubLabel = isSoundpubLabel(row.label_user_id, row.label_name);
      const labelShare = soundpubLabel
        ? Number(row.net_revenue) * 0.30
        : (row.artist_user_id ? Number(row.net_revenue) * 0.21 : Number(row.net_revenue) * 0.70);
      if (row.label_user_id) labelRevenueById[row.label_user_id] = (labelRevenueById[row.label_user_id] || 0) + labelShare;
      if (row.label_name) labelRevenueMap[row.label_name] = (labelRevenueMap[row.label_name] || 0) + labelShare;
    }

    // 4. Rollback artist balances
    const rollbackResults: Array<{ user_id: string; balance_deducted: number }> = [];
    for (const [uid, amounts] of Object.entries(balanceMap)) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("balance, artist_revenue")
        .eq("id", uid)
        .single();

      if (profile) {
        const newBalance = Math.max(0, Number(profile.balance) - amounts.balance);
        const newArtistRevenue = Math.max(0, Number(profile.artist_revenue) - amounts.artistRevenue);

        await supabaseAdmin
          .from("profiles")
          .update({ balance: newBalance, artist_revenue: newArtistRevenue })
          .eq("id", uid);

        rollbackResults.push({ user_id: uid, balance_deducted: amounts.balance });
      }
    }

    // 5. Rollback label/whitelabel balance and label_revenue.
    for (const [id, amount] of Object.entries(labelRevenueById)) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("balance, label_revenue")
        .eq("id", id)
        .single();

      if (profile) {
        await supabaseAdmin
          .from("profiles")
          .update({
            balance: Math.max(0, Number(profile.balance) - amount),
            label_revenue: Math.max(0, Number(profile.label_revenue) - amount),
          })
          .eq("id", id);
      }
    }

    // Fallback: rollback label_revenue for label profiles (case-insensitive)
    for (const [labelName, amount] of Object.entries(labelRevenueMap)) {
      const { data: labelProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, balance, label_revenue")
        .ilike("full_name", labelName.trim());

      for (const lp of labelProfiles || []) {
        if (labelRevenueById[lp.id]) continue;
        const newLabelRevenue = Math.max(0, Number(lp.label_revenue) - amount);
        await supabaseAdmin
          .from("profiles")
          .update({ label_revenue: newLabelRevenue, balance: Math.max(0, Number((lp as any).balance || 0) - amount) })
          .eq("id", lp.id);
      }
    }

    // 6. Delete royalties
    // Delete directly by upload_id to avoid very long URLs from `.in("id", ids)`.
    const deleted = allRoyalties.length;
    const { error: delErr } = await supabaseAdmin
      .from("royalties")
      .delete()
      .eq("upload_id", upload_id);

    if (delErr) throw new Error(`Failed to delete royalties: ${delErr.message}`);
    // 7. Delete upload record
    const { error: deleteUploadError } = await supabaseAdmin
      .from("royalty_uploads")
      .delete()
      .eq("id", upload_id);

    if (deleteUploadError) {
      throw new Error(`Failed to delete upload: ${deleteUploadError.message}`);
    }

    // 8. Audit log
    await supabaseAdmin.from("audit_logs").insert({
      action: "delete_royalty_upload",
      actor_id: user.id,
      target_id: upload_id,
      target_type: "royalty_upload",
      details: {
        filename: upload.original_filename,
        deleted_records: deleted,
        balance_rollbacks: rollbackResults,
      },
    });

    return respond(true, {
      deletedRecords: deleted,
      balanceRollbacks: rollbackResults,
    });
  } catch (error) {
    console.error("Delete royalty upload error:", error);
    return respond(false, {
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});
