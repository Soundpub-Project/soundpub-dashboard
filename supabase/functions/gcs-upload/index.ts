import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function ensureBucketCorsForBrowserUploads(params: {
  accessToken: string;
  bucketName: string;
  requestOrigin: string;
}): Promise<void> {
  const { accessToken, bucketName } = params;

  // Use a permissive origin to avoid breakage across preview/published domains.
  // Anyone would still need a valid resumable upload URL to upload anything.
  const desiredCorsRule = {
    origin: ['*'],
    method: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    responseHeader: [
      'Content-Type',
      'Content-Length',
      'Content-Range',
      'ETag',
      'Location',
      'Range',
      'x-goog-resumable',
      'x-goog-generation',
      'x-goog-metageneration',
    ],
    maxAgeSeconds: 3600,
  };

  const bucketInfoUrl = `https://storage.googleapis.com/storage/v1/b/${bucketName}?fields=cors`;

  const getRes = await fetch(bucketInfoUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!getRes.ok) {
    const errorText = await getRes.text();
    console.error('GCS bucket read error:', errorText);
    throw new Error(`Failed to read bucket CORS config: ${getRes.status}`);
  }

  const bucketData = await getRes.json();
  const existingCors: Array<{ origin?: string[]; method?: string[] }> | undefined = bucketData?.cors;

  const hasWorkingRule = Array.isArray(existingCors)
    ? existingCors.some((rule) => {
        const origins = rule.origin ?? [];
        const methods = (rule.method ?? []).map((m) => m.toUpperCase());
        const originOk = origins.includes('*');
        const methodsOk = methods.includes('PUT') && methods.includes('OPTIONS');
        return originOk && methodsOk;
      })
    : false;

  if (hasWorkingRule) return;

  console.log(`Applying GCS CORS rules to bucket: ${bucketName}`);

  const patchRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cors: [desiredCorsRule] }),
  });

  if (!patchRes.ok) {
    const errorText = await patchRes.text();
    console.error('GCS bucket patch error:', errorText);
    throw new Error(`Failed to update bucket CORS config: ${patchRes.status}`);
  }

  console.log(`GCS CORS configured for bucket: ${bucketName}`);
}

interface GCSSignedUrlRequest {
  file_name: string;
  file_type: string;
  folder?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Get user role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !roleData) {
      throw new Error('User role not found');
    }

    // Allow superadmin, admin, and label roles to upload
    const allowedRoles = ['superadmin', 'admin', 'label'];
    if (!allowedRoles.includes(roleData.role)) {
      throw new Error('Insufficient permissions to upload files');
    }

    const gcsProjectId = Deno.env.get('GCS_PROJECT_ID');
    const gcsBucketName = Deno.env.get('GCS_BUCKET_NAME');
    const gcsServiceAccountKey = Deno.env.get('GCS_SERVICE_ACCOUNT_KEY');

    if (!gcsProjectId || !gcsBucketName || !gcsServiceAccountKey) {
      throw new Error('GCS configuration is missing');
    }

    const body: GCSSignedUrlRequest = await req.json();
    const { file_name, file_type, folder } = body;

    if (!file_name || !file_type) {
      throw new Error('Missing required fields: file_name, file_type');
    }

    // Parse the service account key
    const serviceAccount = JSON.parse(gcsServiceAccountKey);
    
    // Create JWT for authentication
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;

    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const payload = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/devstorage.read_write',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: exp,
    };

    // Encode header and payload
    const encoder = new TextEncoder();
    const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    
    const signatureInput = `${headerB64}.${payloadB64}`;
    
    // Import private key and sign
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      pemToBinary(serviceAccount.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      encoder.encode(signatureInput)
    );
    
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    
    const jwt = `${signatureInput}.${signatureB64}`;

    // Get access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('Token response:', tokenData);
      throw new Error('Failed to get GCS access token');
    }

    // Ensure the bucket has CORS rules so browser uploads to GCS don't get blocked
    const requestOrigin = req.headers.get('Origin') ?? '*';
    await ensureBucketCorsForBrowserUploads({
      accessToken: tokenData.access_token,
      bucketName: gcsBucketName,
      requestOrigin,
    });

    // Generate object path
    const objectPath = folder ? `${folder}/${file_name}` : file_name;

    // Create resumable upload session to get upload URL
    const initiateUrl = `https://storage.googleapis.com/upload/storage/v1/b/${gcsBucketName}/o?uploadType=resumable&name=${encodeURIComponent(objectPath)}`;
    
    const initiateResponse = await fetch(initiateUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': file_type,
      },
      body: JSON.stringify({
        name: objectPath,
        contentType: file_type,
      }),
    });

    if (!initiateResponse.ok) {
      const errorText = await initiateResponse.text();
      console.error('GCS Initiate Error:', errorText);
      throw new Error(`Failed to initiate upload: ${initiateResponse.status}`);
    }

    // Get the resumable upload URL from the Location header
    const uploadUrl = initiateResponse.headers.get('Location');
    
    if (!uploadUrl) {
      throw new Error('Failed to get upload URL from GCS');
    }

    // Generate public URL
    const publicUrl = `https://storage.googleapis.com/${gcsBucketName}/${objectPath}`;

    // Log the upload initiation
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'gcs_upload_initiated',
      target_type: 'gcs_file',
      details: { 
        file_name: objectPath, 
        file_type,
        bucket: gcsBucketName,
      },
    });

    console.log(`Upload session created for: ${objectPath}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        uploadUrl: uploadUrl,
        publicUrl: publicUrl,
        objectPath: objectPath,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('GCS Upload Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to convert PEM to binary
function pemToBinary(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
