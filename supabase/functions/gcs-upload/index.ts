import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  logos: {
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'],
    maxSizeMB: 1,
    description: 'Logo images',
  },
  favicons: {
    allowedTypes: ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml'],
    maxSizeMB: 0.5,
    description: 'Favicon images',
  },
  test: {
    allowedTypes: ['text/plain', 'application/octet-stream'],
    maxSizeMB: 1,
    description: 'Test files',
  },
};

function validateFileUpload(folder: string | undefined, fileType: string, fileSize?: number): { valid: boolean; error?: string } {
  if (!folder) {
    return { valid: true };
  }

  const config = FOLDER_VALIDATION[folder];
  
  if (!config) {
    console.warn(`Unknown folder for validation: ${folder}`);
    return { valid: true };
  }

  const normalizedType = fileType.toLowerCase();
  if (!config.allowedTypes.includes(normalizedType)) {
    return {
      valid: false,
      error: `Tipe file tidak diizinkan untuk ${config.description}. Tipe yang diizinkan: ${config.allowedTypes.map(t => t.split('/')[1]).join(', ')}`,
    };
  }

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

// Generate V4 Signed URL for PUT upload
async function generateSignedUrl(params: {
  bucketName: string;
  objectPath: string;
  contentType: string;
  serviceAccountEmail: string;
  privateKey: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { bucketName, objectPath, contentType, serviceAccountEmail, privateKey, expiresInSeconds = 3600 } = params;
  
  const now = Math.floor(Date.now() / 1000);
  const expiration = now + expiresInSeconds;
  
  // Format timestamp for V4 signature
  const dateISO = new Date(now * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = dateISO.substring(0, 8);
  
  const host = 'storage.googleapis.com';
  const credentialScope = `${dateStamp}/auto/storage/goog4_request`;
  const credential = `${serviceAccountEmail}/${credentialScope}`;
  
  // Canonical headers
  const signedHeaders = 'content-type;host';
  
  // Query parameters for signed URL
  const queryParams = new URLSearchParams({
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': dateISO,
    'X-Goog-Expires': String(expiresInSeconds),
    'X-Goog-SignedHeaders': signedHeaders,
  });
  
  // Build canonical request
  const encodedObjectPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const canonicalUri = `/${bucketName}/${encodedObjectPath}`;
  const canonicalQueryString = [...queryParams.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  
  // Hash canonical request
  const encoder = new TextEncoder();
  const canonicalRequestHash = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest));
  const hashedCanonicalRequest = Array.from(new Uint8Array(canonicalRequestHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Build string to sign
  const stringToSign = [
    'GOOG4-RSA-SHA256',
    dateISO,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');
  
  // Sign with private key
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBinary(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(stringToSign)
  );
  
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Build final URL
  queryParams.set('X-Goog-Signature', signatureHex);
  
  const signedUrl = `https://${host}${canonicalUri}?${queryParams.toString()}`;
  
  return signedUrl;
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
    
    // Generate object path
    const objectPath = folder ? `${folder}/${file_name}` : file_name;

    console.log(`Generating signed URL for: ${objectPath} in bucket: ${gcsBucketName}`);

    // Generate V4 Signed URL for PUT
    const signedUrl = await generateSignedUrl({
      bucketName: gcsBucketName,
      objectPath: objectPath,
      contentType: file_type,
      serviceAccountEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
      expiresInSeconds: 3600, // 1 hour
    });

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
        method: 'signed_url_v4',
      },
    });

    console.log(`Signed URL generated for: ${objectPath}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        signedUrl: signedUrl,
        publicUrl: publicUrl,
        objectPath: objectPath,
        // Keep uploadUrl for backward compatibility during transition
        uploadUrl: signedUrl,
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
