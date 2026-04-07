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

  // Decode header to get kid
  const header = JSON.parse(
    new TextDecoder().decode(base64urlDecode(parts[0]))
  );
  const kid = header.kid;
  if (!kid) throw new Error("No kid in JWT header");

  // Fetch JWKS
  const jwksUrl = `${realmUrl}/protocol/openid-connect/certs`;
  const jwksResp = await fetch(jwksUrl);
  if (!jwksResp.ok) throw new Error(`Failed to fetch JWKS: ${jwksResp.status}`);
  const jwks = await jwksResp.json();

  const jwk = jwks.keys?.find(
    (k: Record<string, string>) => k.kid === kid && k.kty === "RSA"
  );
  if (!jwk) throw new Error(`No matching JWK for kid: ${kid}`);

  // Import key and verify
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

  // Decode and validate payload
  const payload = decodeJwtPayload(token);

  // Check issuer
  if (payload.iss !== realmUrl) {
    throw new Error(`Invalid issuer: ${payload.iss}`);
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) {
    throw new Error("Token expired");
  }

  return payload;
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

    // 3. Extract email and name
    const email = payload.email as string;
    const name =
      (payload.name as string) ||
      (payload.preferred_username as string) ||
      email.split("@")[0];

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
      .select("id, sso_provider, artist_profile_completed")
      .eq("email", email)
      .maybeSingle();

    let userId: string;

    if (existingProfile) {
      // User exists — update sso_provider if needed
      userId = existingProfile.id;
      if (!existingProfile.sso_provider) {
        await supabaseAdmin
          .from("profiles")
          .update({ sso_provider: "iccn" })
          .eq("id", userId);
      }
    } else {
      // Create new user
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

      // Update profile with SSO info and ICCN Media label
      await supabaseAdmin
        .from("profiles")
        .update({
          full_name: name,
          sso_provider: "iccn",
          parent_label_id: iccnMediaLabelId,
          password_set: false,
          artist_profile_completed: false,
        })
        .eq("id", userId);

      // Set role to artist
      await supabaseAdmin
        .from("user_roles")
        .update({ role: "artist" })
        .eq("user_id", userId);

      // Insert into artists table
      const { data: existingArtist } = await supabaseAdmin
        .from("artists")
        .select("id")
        .eq("label_id", iccnMediaLabelId)
        .eq("name", name)
        .maybeSingle();

      if (!existingArtist) {
        await supabaseAdmin.from("artists").insert({
          label_id: iccnMediaLabelId,
          name: name,
        });
      }
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

    // Extract the token hash and verify OTP to get session
    const urlObj = new URL(linkData.properties.action_link);
    const token_hash = urlObj.searchParams.get("token") || 
                       urlObj.hash?.replace("#", "")?.split("&")?.find(p => p.startsWith("token="))?.split("=")[1];

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
