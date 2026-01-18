import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GCSManageRequest {
  action: 'check_cors' | 'apply_cors' | 'list_files' | 'delete_file';
  folder?: string;
  file_path?: string;
  page_token?: string;
  max_results?: number;
}

interface CorsRule {
  origin?: string[];
  method?: string[];
  responseHeader?: string[];
  maxAgeSeconds?: number;
}

// Complete CORS rule with ALL required headers for resumable uploads
const DESIRED_CORS_RULE: CorsRule = {
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
    'x-goog-stored-content-encoding',
    'x-goog-stored-content-length',
    'x-goog-upload-chunk-granularity',
    'x-goog-upload-control-url',
    'x-goog-upload-header-content-type',
    'x-goog-upload-status',
    'x-goog-upload-url',
    'x-upload-content-length',
    'x-upload-content-type',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Methods',
    'Access-Control-Allow-Headers',
    'Access-Control-Expose-Headers',
    'Access-Control-Max-Age',
  ],
  maxAgeSeconds: 3600,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated and is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || !['superadmin', 'admin'].includes(roleData.role)) {
      throw new Error('Admin access required');
    }

    // Get GCS configuration
    const gcsProjectId = Deno.env.get('GCS_PROJECT_ID');
    const gcsBucketName = Deno.env.get('GCS_BUCKET_NAME');
    const gcsServiceAccountKey = Deno.env.get('GCS_SERVICE_ACCOUNT_KEY');

    if (!gcsProjectId || !gcsBucketName || !gcsServiceAccountKey) {
      throw new Error('GCS configuration is missing');
    }

    const body: GCSManageRequest = await req.json();
    const { action } = body;

    // Get access token
    const accessToken = await getGCSAccessToken(gcsServiceAccountKey);

    switch (action) {
      case 'check_cors':
        return await handleCheckCors(gcsBucketName, accessToken);
      
      case 'apply_cors':
        return await handleApplyCors(gcsBucketName, accessToken, user.id, supabase);
      
      case 'list_files':
        return await handleListFiles(gcsBucketName, accessToken, body.folder, body.page_token, body.max_results);
      
      case 'delete_file':
        if (!body.file_path) {
          throw new Error('file_path is required for delete_file action');
        }
        return await handleDeleteFile(gcsBucketName, accessToken, body.file_path, user.id, supabase);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('GCS Manage Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getGCSAccessToken(serviceAccountKeyJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountKeyJson);
  
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.full_control',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: exp,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const signatureInput = `${headerB64}.${payloadB64}`;
  
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

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  
  if (!tokenData.access_token) {
    throw new Error('Failed to get GCS access token');
  }

  return tokenData.access_token;
}

async function handleCheckCors(bucketName: string, accessToken: string) {
  const bucketInfoUrl = `https://storage.googleapis.com/storage/v1/b/${bucketName}?fields=cors`;

  console.log(`Checking CORS for bucket: ${bucketName}`);

  const getRes = await fetch(bucketInfoUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // Handle bucket not found or access denied
  if (getRes.status === 404) {
    return new Response(
      JSON.stringify({
        success: false,
        corsConfigured: false,
        bucketExists: false,
        message: `Bucket "${bucketName}" tidak ditemukan. Pastikan GCS_BUCKET_NAME sudah benar.`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (getRes.status === 403) {
    return new Response(
      JSON.stringify({
        success: false,
        corsConfigured: false,
        bucketExists: false,
        message: `Service account tidak punya akses ke bucket "${bucketName}". Cek IAM permissions.`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!getRes.ok) {
    const errorText = await getRes.text();
    console.error(`Bucket CORS check error: ${getRes.status}`, errorText);
    throw new Error(`Failed to read bucket CORS config: ${getRes.status} - ${errorText}`);
  }

  const bucketData = await getRes.json();
  const existingCors: CorsRule[] | undefined = bucketData?.cors;

  // Check for complete CORS configuration including all required headers
  const hasCompleteRule = Array.isArray(existingCors)
    ? existingCors.some((rule) => {
        const origins = rule.origin ?? [];
        const methods = (rule.method ?? []).map((m) => m.toUpperCase());
        const headers = rule.responseHeader ?? [];
        
        const originOk = origins.includes('*');
        const methodsOk = methods.includes('PUT') && methods.includes('OPTIONS') && methods.includes('GET') && methods.includes('POST');
        // Check for critical headers that indicate complete configuration
        const hasAccessControlHeaders = headers.includes('Access-Control-Allow-Origin');
        const hasResumableHeaders = headers.includes('x-goog-resumable');
        const hasBasicHeaders = headers.includes('Content-Type') && headers.includes('Content-Length');
        
        return originOk && methodsOk && hasAccessControlHeaders && hasResumableHeaders && hasBasicHeaders;
      })
    : false;

  // Also check if it's partially configured (has some rules but incomplete)
  const hasPartialRule = Array.isArray(existingCors) && existingCors.length > 0 && !hasCompleteRule;

  let message = '';
  if (hasCompleteRule) {
    message = 'CORS sudah dikonfigurasi lengkap untuk browser uploads';
  } else if (hasPartialRule) {
    message = 'CORS ada tapi tidak lengkap - disarankan klik "Apply/Fix CORS" untuk memperbarui';
  } else {
    message = 'CORS belum dikonfigurasi - browser uploads akan gagal, klik "Apply/Fix CORS"';
  }

  console.log(`CORS check result for ${bucketName}: configured=${hasCompleteRule}, partial=${hasPartialRule}`);

  return new Response(
    JSON.stringify({
      success: true,
      corsConfigured: hasCompleteRule,
      partiallyConfigured: hasPartialRule,
      bucketExists: true,
      bucketName: bucketName,
      currentRules: existingCors || [],
      requiredHeaders: DESIRED_CORS_RULE.responseHeader,
      message,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleApplyCors(bucketName: string, accessToken: string, userId: string, supabase: any) {
  console.log(`Applying GCS CORS rules to bucket: ${bucketName}`);

  const patchRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cors: [DESIRED_CORS_RULE] }),
  });

  if (!patchRes.ok) {
    const errorText = await patchRes.text();
    throw new Error(`Failed to update bucket CORS config: ${patchRes.status} - ${errorText}`);
  }

  // Log the action
  await supabase.from('audit_logs').insert({
    actor_id: userId,
    action: 'gcs_cors_applied',
    target_type: 'gcs_bucket',
    details: { 
      bucket: bucketName,
      cors_rule: DESIRED_CORS_RULE,
    },
  });

  console.log(`GCS CORS configured for bucket: ${bucketName}`);

  return new Response(
    JSON.stringify({
      success: true,
      message: 'CORS berhasil dikonfigurasi untuk browser uploads',
      appliedRule: DESIRED_CORS_RULE,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleListFiles(
  bucketName: string, 
  accessToken: string, 
  folder?: string, 
  pageToken?: string,
  maxResults = 100
) {
  let url = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o?maxResults=${maxResults}`;
  
  if (folder) {
    url += `&prefix=${encodeURIComponent(folder)}/`;
  }
  
  if (pageToken) {
    url += `&pageToken=${encodeURIComponent(pageToken)}`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list files: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Transform the response to a more usable format
  const files = (data.items || []).map((item: any) => ({
    name: item.name,
    size: parseInt(item.size, 10),
    contentType: item.contentType,
    created: item.timeCreated,
    updated: item.updated,
    publicUrl: `https://storage.googleapis.com/${bucketName}/${item.name}`,
    folder: item.name.includes('/') ? item.name.split('/')[0] : null,
  }));

  return new Response(
    JSON.stringify({
      success: true,
      files,
      nextPageToken: data.nextPageToken || null,
      totalItems: files.length,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleDeleteFile(
  bucketName: string, 
  accessToken: string, 
  filePath: string,
  userId: string,
  supabase: any
) {
  const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodeURIComponent(filePath)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Failed to delete file: ${response.status} - ${errorText}`);
  }

  // Log the action
  await supabase.from('audit_logs').insert({
    actor_id: userId,
    action: 'gcs_file_deleted',
    target_type: 'gcs_file',
    details: { 
      bucket: bucketName,
      file_path: filePath,
    },
  });

  return new Response(
    JSON.stringify({
      success: true,
      message: `File berhasil dihapus: ${filePath}`,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

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
