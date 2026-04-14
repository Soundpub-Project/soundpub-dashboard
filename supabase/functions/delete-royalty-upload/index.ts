import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

    const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser();
    if (userError || !user) {
      return respond(false, { error: "Unauthorized" });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: user.id });
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
    let allRoyalties: Array<{ net_revenue: number; artist_user_id: string | null; label_name: string }> = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error: pageError } = await supabaseAdmin
        .from("royalties")
        .select("net_revenue, artist_user_id, label_name")
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
      const artistShare = Number(row.net_revenue) * 0.70;
      const labelShare = Number(row.net_revenue) * 0.21;
      balanceMap[uid].balance += artistShare;
      balanceMap[uid].artistRevenue += artistShare;
      balanceMap[uid].labelRevenue += labelShare;
    }

    // Label revenue rollback by label_name
    const labelRevenueMap: Record<string, number> = {};
    for (const row of allRoyalties) {
      if (!row.label_name) continue;
      const labelShare = Number(row.net_revenue) * 0.21;
      labelRevenueMap[row.label_name] = (labelRevenueMap[row.label_name] || 0) + labelShare;
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

    // 5. Rollback label_revenue for label profiles (case-insensitive)
    for (const [labelName, amount] of Object.entries(labelRevenueMap)) {
      const { data: labelProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, label_revenue")
        .ilike("full_name", labelName.trim());

      for (const lp of labelProfiles || []) {
        const newLabelRevenue = Math.max(0, Number(lp.label_revenue) - amount);
        await supabaseAdmin
          .from("profiles")
          .update({ label_revenue: newLabelRevenue })
          .eq("id", lp.id);
      }
    }

    // 6. Delete royalties
    // Delete in batches to avoid timeout on large datasets
    let deleted = 0;
    while (true) {
      const { data: batch } = await supabaseAdmin
        .from("royalties")
        .select("id")
        .eq("upload_id", upload_id)
        .limit(500);

      if (!batch || batch.length === 0) break;

      const ids = batch.map((r: { id: string }) => r.id);
      const { error: delErr } = await supabaseAdmin
        .from("royalties")
        .delete()
        .in("id", ids);

      if (delErr) throw new Error(`Failed to delete royalties: ${delErr.message}`);
      deleted += ids.length;
    }

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
