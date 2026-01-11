import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GCSUploadRequest {
  file_name: string;
  file_type: string;
  file_data: string; // base64 encoded
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

    // Verify user is superadmin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is superadmin
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || !roleData || roleData.role !== 'superadmin') {
      throw new Error('Only superadmins can use GCS upload');
    }

    const gcsProjectId = Deno.env.get('GCS_PROJECT_ID');
    const gcsBucketName = Deno.env.get('GCS_BUCKET_NAME');
    const gcsServiceAccountKey = Deno.env.get('GCS_SERVICE_ACCOUNT_KEY');

    if (!gcsProjectId || !gcsBucketName || !gcsServiceAccountKey) {
      throw new Error('GCS configuration is missing');
    }

    const body: GCSUploadRequest = await req.json();
    const { file_name, file_type, file_data, folder } = body;

    if (!file_name || !file_type || !file_data) {
      throw new Error('Missing required fields: file_name, file_type, file_data');
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

    // Upload file to GCS
    const objectPath = folder ? `${folder}/${file_name}` : file_name;
    const fileBuffer = Uint8Array.from(atob(file_data), c => c.charCodeAt(0));
    
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${gcsBucketName}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': file_type,
      },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('GCS Upload Error:', errorText);
      throw new Error(`GCS upload failed: ${uploadResponse.status}`);
    }

    const uploadResult = await uploadResponse.json();
    
    // Generate public URL
    const publicUrl = `https://storage.googleapis.com/${gcsBucketName}/${objectPath}`;

    // Log the upload action
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'gcs_file_upload',
      target_type: 'gcs_file',
      details: { 
        file_name: objectPath, 
        file_type,
        bucket: gcsBucketName,
        size: fileBuffer.length
      },
    });

    console.log(`File uploaded to GCS: ${objectPath}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        url: publicUrl,
        object: uploadResult
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