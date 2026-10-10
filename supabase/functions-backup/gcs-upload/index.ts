/**
 * GCS Upload Edge Function
 * 
 * STATUS: DISABLED
 * Reason: Migrated to Supabase Storage for all uploads
 * Date: January 2026
 * 
 * This function is preserved for reference but will return a disabled message.
 * Use Supabase Storage buckets instead:
 * - release-covers: for cover images
 * - track-audio: for full audio files
 * - audio-clips: for audio clips
 * - label-logos: for logo images
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
const getDatabaseSchema = () => Deno.env.get('DATABASE_SCHEMA') || Deno.env.get('SUPABASE_DB_SCHEMA') || 'Soundpub'

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

// GCS Upload is disabled - use Supabase Storage instead
const GCS_DISABLED = true;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Return disabled message
  if (GCS_DISABLED) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'GCS upload is disabled. Please use Supabase Storage instead.',
        code: 'GCS_DISABLED',
        migration_info: {
          message: 'This endpoint has been deprecated in favor of Supabase Storage.',
          buckets: {
            covers: 'release-covers',
            audio: 'track-audio',
            clips: 'audio-clips',
            logos: 'label-logos',
          },
          example: 'supabase.storage.from("release-covers").upload(path, file)',
        },
      }),
      { 
        status: 503, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  // Original implementation has been removed to reduce file size
  // If you need to re-enable GCS, set GCS_DISABLED = false
  // and restore the original implementation from version control
  return new Response(
    JSON.stringify({ error: 'Not implemented' }),
    { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
