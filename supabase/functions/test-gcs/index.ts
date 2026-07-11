import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const getDatabaseSchema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'soundpub'

const createSoundpubClient = (supabaseUrl: string, supabaseKey: string, options: any = {}) => {
  const existingDb = options.db || {}
  return createClient(supabaseUrl, supabaseKey, {
    ...options,
    db: { ...existingDb, schema: getDatabaseSchema() },
  })
}


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createSoundpubClient(supabaseUrl, supabaseServiceKey);

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

    const configStatus = {
      projectId: !!gcsProjectId,
      bucketName: !!gcsBucketName,
      serviceAccountKey: !!gcsServiceAccountKey,
    };

    if (!gcsProjectId || !gcsBucketName || !gcsServiceAccountKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'GCS configuration incomplete',
          configStatus,
          details: {
            projectId: gcsProjectId ? 'Configured' : 'Missing',
            bucketName: gcsBucketName ? 'Configured' : 'Missing',
            serviceAccountKey: gcsServiceAccountKey ? 'Configured' : 'Missing',
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to authenticate with GCS
    try {
      const serviceAccount = JSON.parse(gcsServiceAccountKey);
      
      // Create JWT for authentication
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 3600;

      const header = { alg: 'RS256', typ: 'JWT' };
      const payload = {
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/devstorage.read_write',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: exp,
      };

      const encoder = new TextEncoder();
      const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      
      const signatureInput = `${headerB64}.${payloadB64}`;
      
      // Import private key
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
        throw new Error('Failed to get access token');
      }

      // Test bucket access by listing objects
      const listResponse = await fetch(
        `https://storage.googleapis.com/storage/v1/b/${gcsBucketName}/o?maxResults=1`,
        {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
          },
        }
      );

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        throw new Error(`Bucket access failed: ${errorText}`);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'GCS connection successful',
          details: {
            projectId: gcsProjectId,
            bucketName: gcsBucketName,
            serviceAccountEmail: serviceAccount.client_email,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (gcsError: any) {
      console.error('GCS test error:', gcsError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: gcsError.message || 'GCS connection failed',
          configStatus,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: any) {
    console.error('Test GCS error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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
