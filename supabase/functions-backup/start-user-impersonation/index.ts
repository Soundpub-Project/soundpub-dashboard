import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const schema = () =>
  Deno.env.get("DATABASE_SCHEMA") ||
  Deno.env.get("SUPABASE_DB_SCHEMA") ||
  "Soundpub";
const client = (
  url: string,
  key: string,
  options: Record<string, unknown> = {},
) =>
  createClient(url, key, {
    ...options,
    db: {
      ...((options.db as Record<string, unknown>) || {}),
      schema: schema(),
    },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const supabase = client(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
      },
    );
    const {
      data: { user: actor },
    } = await supabase.auth.getUser();
    if (!actor) throw new Error("Unauthorized");
    const { data: actorRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", actor.id)
      .single();
    if (actorRole?.role !== "superadmin")
      throw new Error("Only superadmins can impersonate users");

    const { user_id: targetId, redirect_to: redirectTo } = await req.json();
    if (!targetId || targetId === actor.id)
      throw new Error("Invalid target user");
    const admin = client(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select("id, email, full_name, status")
      .eq("id", targetId)
      .single();
    if (targetError || !targetProfile) throw new Error("Target user not found");
    if (targetProfile.status !== "active")
      throw new Error("Target user is not active");

    if (!redirectTo || !redirectTo.endsWith("/auth/impersonate"))
      throw new Error("Invalid impersonation redirect");
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: targetProfile.email,
        options: { redirectTo },
      });
    if (linkError || !linkData?.properties?.action_link)
      throw linkError || new Error("Failed to generate impersonation link");

    await admin.from("audit_logs").insert({
      action: "user_impersonation_started",
      actor_id: actor.id,
      target_id: targetId,
      target_type: "user",
      actor_role: "superadmin",
      details: {
        target_name: targetProfile.full_name,
        target_email: targetProfile.email,
        expires_in_minutes: 5,
      },
      changed_fields: [],
    });
    return new Response(
      JSON.stringify({
        success: true,
        action_link: linkData.properties.action_link,
        target_id: targetId,
        target_name: targetProfile.full_name,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start impersonation";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
