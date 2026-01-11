import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    if (!settings || !Array.isArray(settings)) {
      throw new Error('Settings array is required');
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Update App Settings Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});