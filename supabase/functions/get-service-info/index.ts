import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['iccn_service_desc', 'iccn_service_photos']);

    if (error) throw error;

    const settings: Record<string, string | null> = {};
    for (const row of data || []) {
      settings[row.key] = row.value;
    }

    const desc = settings['iccn_service_desc'] || '';
    let photos: string[] = [];
    try {
      photos = JSON.parse(settings['iccn_service_photos'] || '[]');
      if (!Array.isArray(photos)) photos = [];
    } catch {
      photos = [];
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        message: 'Data retrieved successfully',
        data: { desc, photos },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('get-service-info error:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'Failed to retrieve service info',
        data: null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
