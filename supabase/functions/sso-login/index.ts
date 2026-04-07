import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Base64url decode helper
function base64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  return JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
}

async function importRSAKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

async function verifyJwt(
  token: string,
  realmUrl: string
): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");

  const header = JSON.parse(
    new TextDecoder().decode(base64urlDecode(parts[0]))
  );
  const kid = header.kid;
  if (!kid) throw new Error("No kid in JWT header");

  const jwksUrl = `${realmUrl}/protocol/openid-connect/certs`;
  const jwksResp = await fetch(jwksUrl);
  if (!jwksResp.ok) throw new Error(`Failed to fetch JWKS: ${jwksResp.status}`);
  const jwks = await jwksResp.json();

  const jwk = jwks.keys?.find(
    (k: Record<string, string>) => k.kid === kid && k.kty === "RSA"
  );
  if (!jwk) throw new Error(`No matching JWK for kid: ${kid}`);

  const key = await importRSAKey(jwk);
  const signatureBytes = base64urlDecode(parts[2]);
  const dataBytes = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signatureBytes,
    dataBytes
  );
  if (!valid) throw new Error("Invalid JWT signature");

  const payload = decodeJwtPayload(token);

  if (payload.iss !== realmUrl) {
    throw new Error(`Invalid issuer: ${payload.iss}`);
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) {
    throw new Error("Token expired");
  }

  return payload;
}

// Wait for profile to exist after createUser (trigger may be async)
async function waitForProfile(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  maxRetries = 10,
  delayMs = 300
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (data) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function syncProfile(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (error) {
    console.error("Profile update error:", error);
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  // Verify critical fields were saved
  const { data: verify } = await supabaseAdmin
    .from("profiles")
    .select("sso_provider, parent_label_id")
    .eq("id", userId)
    .single();

  if (!verify?.sso_provider || !verify?.parent_label_id) {
    throw new Error(
      `Profile sync verification failed: sso_provider=${verify?.sso_provider}, parent_label_id=${verify?.parent_label_id}`
    );
  }
}

async function ensureArtistRole(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  const { data: currentRole } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (currentRole?.role === "user") {
    await supabaseAdmin
      .from("user_roles")
      .update({ role: "artist" })
      .eq("user_id", userId);
  }
}

async function ensureArtistEntry(
  supabaseAdmin: ReturnType<typeof createClient>,
  labelId: string,
  name: string
): Promise<void> {
  const { data: existingArtist } = await supabaseAdmin
    .from("artists")
    .select("id")
    .eq("label_id", labelId)
    .eq("name", name)
    .maybeSingle();

  if (!existingArtist) {
    await supabaseAdmin.from("artists").insert({
      label_id: labelId,
      name: name,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { keycloak_token } = await req.json();
    if (!keycloak_token) {
      return new Response(
        JSON.stringify({ error: "keycloak_token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const realmUrl = Deno.env.get("SSO_REALM_URL");
    const clientId = Deno.env.get("SSO_CLIENT_ID");
    const iccnMediaLabelId = Deno.env.get("ICCN_MEDIA_LABEL_ID");

    if (!realmUrl || !clientId || !iccnMediaLabelId) {
      console.error("Missing SSO configuration secrets");
      return new Response(
        JSON.stringify({ error: "SSO not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Verify JWT
    const payload = await verifyJwt(keycloak_token, realmUrl);

    // 2. Check resource_access
    const resourceAccess = payload.resource_access as Record<string, { roles?: string[] }> | undefined;
    const clientRoles = resourceAccess?.[clientId]?.roles;
    if (!clientRoles || clientRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No access role for this application" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Extract email, name, and avatar
    const email = payload.email as string;
    const name =
      (payload.name as string) ||
      (payload.preferred_username as string) ||
      email.split("@")[0];
    const avatarFromSso = (payload.avatar as string) || null;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "No email in token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Create admin Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 5. Check if user exists by email
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, sso_provider, parent_label_id, avatar_url, artist_profile_completed")
      .eq("email", email)
      .maybeSingle();

    let userId: string;

    if (existingProfile) {
      // === EXISTING USER ===
      userId = existingProfile.id;

      const updates: Record<string, unknown> = {};
      if (!existingProfile.sso_provider) updates.sso_provider = "iccn";
      if (!existingProfile.parent_label_id) updates.parent_label_id = iccnMediaLabelId;
      if (!existingProfile.avatar_url && avatarFromSso) updates.avatar_url = avatarFromSso;

      if (Object.keys(updates).length > 0) {
        // Always ensure sso_provider and parent_label_id are set
        updates.sso_provider = updates.sso_provider || existingProfile.sso_provider || "iccn";
        updates.parent_label_id = updates.parent_label_id || existingProfile.parent_label_id || iccnMediaLabelId;

        await syncProfile(supabaseAdmin, userId, updates);
      }

      await ensureArtistRole(supabaseAdmin, userId);
      await ensureArtistEntry(supabaseAdmin, iccnMediaLabelId, name);

    } else {
      // === NEW USER ===
      const randomPassword = crypto.randomUUID() + crypto.randomUUID();
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: randomPassword,
          email_confirm: true,
          user_metadata: { full_name: name, password_set: false },
        });

      if (createError || !newUser?.user) {
        console.error("Error creating user:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create user" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;

      // Wait for handle_new_user trigger to create profile row
      const profileReady = await waitForProfile(supabaseAdmin, userId);
      if (!profileReady) {
        console.error("Profile not created by trigger after max retries");
        return new Response(
          JSON.stringify({ error: "Profile creation timeout" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update profile with SSO info
      await syncProfile(supabaseAdmin, userId, {
        full_name: name,
        sso_provider: "iccn",
        parent_label_id: iccnMediaLabelId,
        password_set: false,
        artist_profile_completed: false,
        ...(avatarFromSso ? { avatar_url: avatarFromSso } : {}),
      });

      // Set role to artist
      await supabaseAdmin
        .from("user_roles")
        .update({ role: "artist" })
        .eq("user_id", userId);

      // Insert into artists table
      await ensureArtistEntry(supabaseAdmin, iccnMediaLabelId, name);
    }

    // 6. Generate a magic link to get session tokens
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

    if (linkError || !linkData) {
      console.error("Error generating link:", linkError);
      return new Response(
        JSON.stringify({ error: "Failed to generate session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use verifyOtp with token_hash
    const { data: sessionData, error: sessionError } =
      await supabaseAdmin.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: "magiclink",
      });

    if (sessionError || !sessionData?.session) {
      console.error("Error verifying OTP:", sessionError);
      return new Response(
        JSON.stringify({ error: "Failed to create session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_in: sessionData.session.expires_in,
        user: {
          id: userId,
          email,
          full_name: name,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("SSO login error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
