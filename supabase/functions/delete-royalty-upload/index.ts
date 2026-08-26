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

    // 2. Count royalties for this upload. Balances are rebuilt after delete from source-of-truth rows.
    const { count: deletedCount, error: countError } = await supabaseAdmin
      .from("royalties")
      .select("id", { count: "exact", head: true })
      .eq("upload_id", upload_id);

    if (countError) throw new Error(`Failed to count royalties: ${countError.message}`);

    // 6. Delete royalties
    // Delete directly by upload_id to avoid very long URLs from `.in("id", ids)`.
    const deleted = deletedCount || 0;
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

    // 8. Rebuild royalty-derived balances from remaining royalties.
    const { error: resetBalanceError } = await supabaseAdmin
      .from("profiles")
      .update({ balance: 0, artist_revenue: 0, label_revenue: 0 })
      .not("id", "is", null);
    if (resetBalanceError) throw new Error(`Balance reset failed: ${resetBalanceError.message}`);

    const { data: remainingRoyalties, error: remainingRoyaltiesError } = await supabaseAdmin
      .from("royalties")
      .select("artist_user_id,label_user_id,artist_revenue,label_revenue");
    if (remainingRoyaltiesError) throw new Error(`Balance rebuild source failed: ${remainingRoyaltiesError.message}`);

    const rebuiltBalances: Record<string, { balance: number; artist_revenue: number; label_revenue: number }> = {};
    for (const row of remainingRoyalties || []) {
      if ((row as any).artist_user_id) {
        const id = (row as any).artist_user_id;
        rebuiltBalances[id] ||= { balance: 0, artist_revenue: 0, label_revenue: 0 };
        const amount = Number((row as any).artist_revenue || 0);
        rebuiltBalances[id].balance += amount;
        rebuiltBalances[id].artist_revenue += amount;
      }
      if ((row as any).label_user_id) {
        const id = (row as any).label_user_id;
        rebuiltBalances[id] ||= { balance: 0, artist_revenue: 0, label_revenue: 0 };
        const amount = Number((row as any).label_revenue || 0);
        rebuiltBalances[id].balance += amount;
        rebuiltBalances[id].label_revenue += amount;
      }
    }

    const rebuildErrors: string[] = [];
    for (const [profileId, totals] of Object.entries(rebuiltBalances)) {
      const { error: rebuildError } = await supabaseAdmin
        .from("profiles")
        .update(totals)
        .eq("id", profileId);
      if (rebuildError) rebuildErrors.push(profileId);
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
        balance_rebuilt: true,
        rebuild_errors: rebuildErrors,
      },
    });

    return respond(true, {
      deletedRecords: deleted,
      balanceRebuilt: true,
      rebuildErrors,
    });
  } catch (error) {
    console.error("Delete royalty upload error:", error);
    return respond(false, {
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});
