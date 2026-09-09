import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

interface UpdateSettingsRequest {
  settings: Array<{ key: string; value: string | null }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createSoundpubClient(supabaseUrl, supabaseServiceKey);

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
      throw new Error('Only superadmins can update app settings');
    }

    const body: UpdateSettingsRequest = await req.json();
    const { settings } = body;

    if (!settings || !Array.isArray(settings) || settings.length === 0 || settings.length > 50) {
      throw new Error('Settings array must contain 1-50 items');
    }

    // Whitelist allowed setting keys
    const ALLOWED_KEYS = ['dashboard_logo', 'dashboard_logo_light', 'dashboard_logo_dark', 'favicon', 'ga4_enabled', 'gcs_enabled', 'ga4_measurement_id', 'gcs_bucket_name', 'gcs_project_id', 'storage_provider', 'release_pricing_mode', 'release_price_per_track', 'release_price_single', 'release_price_ep', 'release_price_album', 'release_price_custom_label', 'min_payout_amount', 'iccn_service_desc', 'iccn_service_photos', 'auth_notice_config'];

    for (const setting of settings) {
      if (!setting.key || !ALLOWED_KEYS.includes(setting.key)) {
        throw new Error(`Invalid setting key: ${setting.key}`);
      }
      const maxValueLength = setting.key === 'iccn_service_photos' ? 20000 : 5000;
      if (setting.value && setting.value.length > maxValueLength) {
        throw new Error(`Value too long for key: ${setting.key}`);
      }
    }

    // Update each setting
    for (const setting of settings) {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ 
          key: setting.key, 
          value: setting.value,
          updated_at: new Date().toISOString()
        }, { 
          onConflict: 'key' 
        });

      if (error) {
        console.error(`Error updating setting ${setting.key}:`, error);
        throw new Error(`Failed to update setting: ${setting.key}`);
      }
    }

    // Log the update action
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'app_settings_update',
      target_type: 'app_settings',
      details: { updated_keys: settings.map(s => s.key) },
    });

    console.log(`App settings updated by ${user.id}:`, settings.map(s => s.key));

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Update App Settings Error:', error);
    const SAFE_MESSAGES = ['No authorization', 'Unauthorized', 'Only superadmins', 'Settings array', 'Invalid setting key', 'Value too long']
    let safeMessage = 'Failed to update settings'
    if (error instanceof Error && SAFE_MESSAGES.some(m => error.message.startsWith(m) || error.message.includes(m))) {
      safeMessage = error.message
    }
    return new Response(
      JSON.stringify({ error: safeMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
