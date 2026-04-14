import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Anon client to get user
    const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Check admin
    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Only admins can delete uploads" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { upload_id } = await req.json();
    if (!upload_id) {
      return new Response(
        JSON.stringify({ error: "upload_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get upload record
    const { data: upload, error: uploadError } = await supabaseAdmin
      .from("royalty_uploads")
      .select("*")
      .eq("id", upload_id)
      .single();

    if (uploadError || !upload) {
      return new Response(
        JSON.stringify({ error: "Upload not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get all royalties for this upload
    const { data: royalties, error: royaltiesError } = await supabaseAdmin
      .from("royalties")
      .select("net_revenue, artist_user_id, label_name")
      .eq("upload_id", upload_id);

    if (royaltiesError) {
      throw new Error(`Failed to fetch royalties: ${royaltiesError.message}`);
    }

    // 3. Calculate balance rollbacks per artist_user_id
    // Split: 70% artist, 21% label, 9% admin
    // balance = artist_share (70%), artist_revenue += artist_share, label_revenue += label_share
    const balanceMap: Record<string, { balance: number; artistRevenue: number; labelRevenue: number }> = {};

    for (const row of royalties || []) {
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

    // Also calculate label_revenue rollback for label profiles (by label_name)
    const labelRevenueMap: Record<string, number> = {};
    for (const row of royalties || []) {
      if (!row.label_name) continue;
      const labelShare = Number(row.net_revenue) * 0.21;
      labelRevenueMap[row.label_name] = (labelRevenueMap[row.label_name] || 0) + labelShare;
    }

    // 4. Rollback artist balances
    const rollbackResults: Array<{ user_id: string; balance_deducted: number }> = [];
    for (const [uid, amounts] of Object.entries(balanceMap)) {
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          balance: supabaseAdmin.rpc ? undefined : 0, // placeholder
        })
        .eq("id", uid);

      // Use raw SQL-like approach via rpc or direct update
      // Actually, we need to subtract, so let's do it properly
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("balance, artist_revenue, label_revenue")
        .eq("id", uid)
        .single();

      if (profile) {
        const newBalance = Math.max(0, Number(profile.balance) - amounts.balance);
        const newArtistRevenue = Math.max(0, Number(profile.artist_revenue) - amounts.artistRevenue);

        await supabaseAdmin
          .from("profiles")
          .update({
            balance: newBalance,
            artist_revenue: newArtistRevenue,
          })
          .eq("id", uid);

        rollbackResults.push({ user_id: uid, balance_deducted: amounts.balance });
      }
    }

    // 5. Rollback label_revenue for label profiles
    for (const [labelName, amount] of Object.entries(labelRevenueMap)) {
      // Find profile by full_name matching label_name
      const { data: labelProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, label_revenue")
        .eq("full_name", labelName);

      for (const lp of labelProfiles || []) {
        const newLabelRevenue = Math.max(0, Number(lp.label_revenue) - amount);
        await supabaseAdmin
          .from("profiles")
          .update({ label_revenue: newLabelRevenue })
          .eq("id", lp.id);
      }
    }

    // 6. Delete royalties
    const { error: deleteRoyaltiesError } = await supabaseAdmin
      .from("royalties")
      .delete()
      .eq("upload_id", upload_id);

    if (deleteRoyaltiesError) {
      throw new Error(`Failed to delete royalties: ${deleteRoyaltiesError.message}`);
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
        deleted_records: royalties?.length || 0,
        balance_rollbacks: rollbackResults,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        deletedRecords: royalties?.length || 0,
        balanceRollbacks: rollbackResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Delete royalty upload error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
