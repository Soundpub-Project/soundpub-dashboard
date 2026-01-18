import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced CORS rule with all required headers for resumable uploads
const COMPLETE_CORS_RULE = {
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

// Track last CORS update to avoid excessive patching
let lastCorsUpdateTime = 0;
const CORS_UPDATE_COOLDOWN_MS = 60000; // 1 minute cooldown

async function ensureBucketCorsForBrowserUploads(params: {
  accessToken: string;
  bucketName: string;
  requestOrigin: string;
  forceApply?: boolean;
}): Promise<void> {
  const { accessToken, bucketName, forceApply = false } = params;

  // Check cooldown unless force apply
  const now = Date.now();
  if (!forceApply && (now - lastCorsUpdateTime) < CORS_UPDATE_COOLDOWN_MS) {
    console.log('CORS update skipped (cooldown active)');
    return;
  }

  const bucketInfoUrl = `https://storage.googleapis.com/storage/v1/b/${bucketName}?fields=cors`;

  try {
    const getRes = await fetch(bucketInfoUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!getRes.ok) {
      const errorText = await getRes.text();
      console.error('GCS bucket read error:', errorText);
      // Continue anyway - try to apply CORS
    } else {
      const bucketData = await getRes.json();
      const existingCors: Array<{ origin?: string[]; method?: string[]; responseHeader?: string[] }> | undefined = bucketData?.cors;

      // Check if CORS is fully configured with all required headers
      const hasCompleteRule = Array.isArray(existingCors)
        ? existingCors.some((rule) => {
            const origins = rule.origin ?? [];
            const methods = (rule.method ?? []).map((m) => m.toUpperCase());
            const headers = rule.responseHeader ?? [];
            
            const originOk = origins.includes('*');
            const methodsOk = methods.includes('PUT') && methods.includes('OPTIONS') && methods.includes('POST');
            // Check for key headers that indicate complete configuration
            const headersOk = headers.includes('Access-Control-Allow-Origin') && 
                             headers.includes('x-goog-resumable') &&
                             headers.includes('Content-Type');
            
            return originOk && methodsOk && headersOk;
          })
        : false;

      // Skip if already complete and not forced
      if (hasCompleteRule && !forceApply) {
        console.log('CORS already complete, skipping update');
        return;
      }
    }
  } catch (error) {
    console.warn('Error checking CORS, will try to apply:', error);
  }

  // Always apply the complete CORS rule
  console.log(`Applying complete GCS CORS rules to bucket: ${bucketName}`);

  const patchRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cors: [COMPLETE_CORS_RULE] }),
  });

  if (!patchRes.ok) {
    const errorText = await patchRes.text();
    console.error('GCS bucket patch error:', errorText);
    // Don't throw - let the upload proceed and fail with a clearer error if needed
    console.warn('Failed to update CORS, upload may fail');
  } else {
    lastCorsUpdateTime = Date.now();
    console.log(`GCS CORS configured successfully for bucket: ${bucketName}`);
  }
}

interface GCSSignedUrlRequest {
  file_name: string;
  file_type: string;
  folder?: string;
  file_size?: number;
}

// Server-side validation configuration
const FOLDER_VALIDATION: Record<string, {
  allowedTypes: string[];
  maxSizeMB: number;
  description: string;
}> = {
  covers: {
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    maxSizeMB: 10,
    description: 'Cover images',
  },
  audio: {
    allowedTypes: [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
      'audio/flac', 'audio/x-flac', 'audio/aiff', 'audio/x-aiff',
      'audio/m4a', 'audio/mp4', 'audio/x-m4a',
    ],
    maxSizeMB: 500,
    description: 'Full audio files',
  },
  clips: {
    allowedTypes: [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
      'audio/flac', 'audio/x-flac', 'audio/m4a', 'audio/mp4',
    ],
    maxSizeMB: 50,
    description: 'Audio clips (30-60 seconds)',
  },
};

function validateFileUpload(folder: string | undefined, fileType: string, fileSize?: number): { valid: boolean; error?: string } {
  // If no folder specified, skip validation (backwards compatibility)
  if (!folder) {
    return { valid: true };
  }

  const config = FOLDER_VALIDATION[folder];
  
  // Unknown folder - allow upload but log warning
  if (!config) {
    console.warn(`Unknown folder for validation: ${folder}`);
    return { valid: true };
  }

  // Validate file type
  const normalizedType = fileType.toLowerCase();
  if (!config.allowedTypes.includes(normalizedType)) {
    return {
      valid: false,
      error: `Tipe file tidak diizinkan untuk ${config.description}. Tipe yang diizinkan: ${config.allowedTypes.map(t => t.split('/')[1]).join(', ')}`,
    };
  }

  // Validate file size if provided
  if (fileSize !== undefined) {
    const maxSizeBytes = config.maxSizeMB * 1024 * 1024;
    if (fileSize > maxSizeBytes) {
      return {
        valid: false,
        error: `Ukuran file melebihi batas ${config.maxSizeMB}MB untuk ${config.description}`,
      };
    }
  }

  return { valid: true };
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

    // Allow superadmin, admin, label, and whitelabel roles to upload
    const allowedRoles = ['superadmin', 'admin', 'label', 'whitelabel'];
    if (!allowedRoles.includes(roleData.role)) {
      console.error(`Role denied: ${roleData.role}, allowed: ${allowedRoles.join(', ')}`);
      return new Response(
        JSON.stringify({ 
          error: 'Insufficient permissions to upload files',
          code: 'INSUFFICIENT_ROLE',
          currentRole: roleData.role,
          allowedRoles: allowedRoles,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gcsProjectId = Deno.env.get('GCS_PROJECT_ID');
    const gcsBucketName = Deno.env.get('GCS_BUCKET_NAME');
    const gcsServiceAccountKey = Deno.env.get('GCS_SERVICE_ACCOUNT_KEY');

    if (!gcsProjectId || !gcsBucketName || !gcsServiceAccountKey) {
      throw new Error('GCS configuration is missing');
    }

    const body: GCSSignedUrlRequest = await req.json();
    const { file_name, file_type, folder, file_size } = body;

    if (!file_name || !file_type) {
      throw new Error('Missing required fields: file_name, file_type');
    }

    // Server-side validation for file type and size
    const validation = validateFileUpload(folder, file_type, file_size);
    if (!validation.valid) {
      throw new Error(validation.error);
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
