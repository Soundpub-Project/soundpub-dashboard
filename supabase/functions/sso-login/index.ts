import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

async function exchangeAuthorizationCode(
  realmUrl: string,
  clientId: string,
  code: string,
  redirectUri: string,
  codeVerifier?: string | null
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
  });

  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const tokenResp = await fetch(`${realmUrl}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const tokenData = await tokenResp.json().catch(() => ({}));
  if (!tokenResp.ok || !tokenData.access_token) {
    console.error("ICCN code exchange failed:", tokenResp.status, tokenData);
    throw new Error(tokenData.error_description || tokenData.error || "Failed to exchange SSO code");
  }

  return tokenData.access_token as string;
}

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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

async function resolveIccnMediaLabelId(
  supabaseAdmin: ReturnType<typeof createClient>,
  configuredLabelId: string | null
): Promise<string> {
  if (isUuid(configuredLabelId)) {
    return configuredLabelId;
  }

  console.warn(
    configuredLabelId
      ? "Invalid ICCN_MEDIA_LABEL_ID secret, falling back to ICCN profile lookup"
      : "Missing ICCN_MEDIA_LABEL_ID secret, falling back to ICCN profile lookup"
  );

  const { data: labelProfile, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", "halo.iccn@gmail.com")
    .maybeSingle();

  if (error) {
    console.error("ICCN label lookup error:", error);
    throw new Error(`Failed to resolve ICCN Media label: ${error.message}`);
  }

  if (!isUuid(labelProfile?.id)) {
    throw new Error("ICCN Media label is not configured correctly");
  }

  return labelProfile.id;
}

function getErrorStatus(message: string): number {
  if (
    message.startsWith("Invalid JWT") ||
    message.startsWith("Invalid issuer") ||
    message.startsWith("Invalid azp") ||
    message.startsWith("Token expired") ||
    message.startsWith("No kid in JWT header")
  ) {
    return 401;
  }

  return 500;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { keycloak_token, code, redirect_uri, code_verifier } = await req.json();
    if (!keycloak_token && !code) {
      return new Response(
        JSON.stringify({ error: "keycloak_token or code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientId = Deno.env.get("SSO_CLIENT_ID");
    const realm = Deno.env.get("SSO_REALM") || "playground";
    let realmUrl = Deno.env.get("SSO_REALM_URL") || "";
    if (!realmUrl) {
      const base = Deno.env.get("SSO_BASE_URL") || "https://sso.iccn.or.id";
      realmUrl = `${base.replace(/\/$/, "")}/realms/${realm}`;
    } else if (!/\/realms\//.test(realmUrl)) {
      realmUrl = `${realmUrl.replace(/\/$/, "")}/realms/${realm}`;
    } else {
      realmUrl = realmUrl.replace(/\/$/, "");
    }
    console.log("SSO: using realmUrl:", realmUrl);

    if (!clientId) {
      console.error("Missing SSO configuration secrets");
      return new Response(
        JSON.stringify({ error: "SSO not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = keycloak_token || await exchangeAuthorizationCode(
      realmUrl,
      clientId,
      code,
      redirect_uri,
      code_verifier ?? null
    );

    const payload = await verifyJwt(accessToken, realmUrl);

    // Validate azp (authorized party) matches our client ID
    if (payload.azp && payload.azp !== clientId) {
      return new Response(
        JSON.stringify({ error: `Invalid azp: ${payload.azp}` }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resourceAccess = payload.resource_access as Record<string, { roles?: string[] }> | undefined;
    const clientRoles = resourceAccess?.[clientId]?.roles;
    if (!clientRoles || clientRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No access role for this application" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const email = payload.email as string;
    const fullnameFromSso = (payload.fullname as string) || null;
    const name =
      fullnameFromSso ||
      (payload.name as string) ||
      (payload.preferred_username as string) ||
      email.split("@")[0];
    const avatarFromSso = (payload.avatar as string) || null;
    const phoneFromSso = (payload.phone as string) || null;
    const cityFromSso = (payload.city as string) || null;
    const provinceFromSso = (payload.province as string) || null;
    const ssoUserId = (payload.sub as string) || null;
    const ssoUserType = (payload.type as string) || null;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "No email in token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing backend admin configuration secrets");
      return new Response(
        JSON.stringify({ error: "Backend admin configuration is missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const iccnMediaLabelId = await resolveIccnMediaLabelId(
      supabaseAdmin,
      Deno.env.get("ICCN_MEDIA_LABEL_ID")
    );

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, sso_provider, parent_label_id, avatar_url, phone, city, province, sso_user_id, sso_user_type, artist_profile_completed")
      .eq("email", email)
      .maybeSingle();

    let userId: string;

    if (existingProfile) {
      userId = existingProfile.id;

      // Only update fields that are NOT already set — never overwrite existing data
      const updates: Record<string, unknown> = {};
      if (!existingProfile.sso_provider) updates.sso_provider = "iccn";
      if (!existingProfile.parent_label_id) updates.parent_label_id = iccnMediaLabelId;
      if (!existingProfile.avatar_url && avatarFromSso) updates.avatar_url = avatarFromSso;
      if (!(existingProfile as Record<string, unknown>).phone && phoneFromSso) updates.phone = phoneFromSso;
      if (!(existingProfile as Record<string, unknown>).city && cityFromSso) updates.city = cityFromSso;
      if (!(existingProfile as Record<string, unknown>).province && provinceFromSso) updates.province = provinceFromSso;
      if (!(existingProfile as Record<string, unknown>).sso_user_id && ssoUserId) updates.sso_user_id = ssoUserId;
      if (!(existingProfile as Record<string, unknown>).sso_user_type && ssoUserType) updates.sso_user_type = ssoUserType;

      if (Object.keys(updates).length > 0) {
        // Preserve existing values — only fill in what's missing
        updates.sso_provider = updates.sso_provider || existingProfile.sso_provider;
        updates.parent_label_id = updates.parent_label_id || existingProfile.parent_label_id;

        await syncProfile(supabaseAdmin, userId, updates);
      }

      await ensureArtistRole(supabaseAdmin, userId);
      await ensureArtistEntry(supabaseAdmin, iccnMediaLabelId, name);
    } else {
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

      const profileReady = await waitForProfile(supabaseAdmin, userId);
      if (!profileReady) {
        console.error("Profile not created by trigger after max retries");
        return new Response(
          JSON.stringify({ error: "Profile creation timeout" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await syncProfile(supabaseAdmin, userId, {
        full_name: name,
        sso_provider: "iccn",
        parent_label_id: iccnMediaLabelId,
        password_set: false,
        artist_profile_completed: false,
        ...(avatarFromSso ? { avatar_url: avatarFromSso } : {}),
        ...(phoneFromSso ? { phone: phoneFromSso } : {}),
        ...(cityFromSso ? { city: cityFromSso } : {}),
        ...(provinceFromSso ? { province: provinceFromSso } : {}),
        ...(ssoUserId ? { sso_user_id: ssoUserId } : {}),
        ...(ssoUserType ? { sso_user_type: ssoUserType } : {}),
      });

      await supabaseAdmin
        .from("user_roles")
        .update({ role: "artist" })
        .eq("user_id", userId);

      await ensureArtistEntry(supabaseAdmin, iccnMediaLabelId, name);
    }

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
      { status: getErrorStatus(message), headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});