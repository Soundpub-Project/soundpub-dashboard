import { settingsApi } from '@/api/settings';
import { usesBackendDomain } from '@/api/routing';
import { supabase } from '@/integrations/supabase/client';

export const brandingVariants = { dashboard_logo_light: 'light', dashboard_logo_dark: 'dark', favicon: 'default' } as const;
export type BrandingKey = keyof typeof brandingVariants;
export const brandingResourceId = '00000000-0000-4000-8000-0000000003d0';
export const brandingUpdatedEvent = 'soundpub:branding-updated';
export function notifyBrandingUpdated() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(brandingUpdatedEvent));
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function publicBrandingUrl(key: string, value: unknown) {
  return Object.prototype.hasOwnProperty.call(brandingVariants, key) && typeof value === 'string' && uuid.test(value)
    ? `/api/v1/settings/public-media/${key}` : null;
}

export async function getPublicSettingsRows(keys: string[]) {
  if (usesBackendDomain('settings')) {
    const { settings } = await settingsApi.public();
    const values: Record<string, string | null> = {
      dashboard_logo: null,
      dashboard_logo_light: publicBrandingUrl('dashboard_logo_light', settings.dashboard_logo_light),
      dashboard_logo_dark: publicBrandingUrl('dashboard_logo_dark', settings.dashboard_logo_dark),
      favicon: publicBrandingUrl('favicon', settings.favicon),
      auth_notice_config: JSON.stringify(settings.auth_notice_config), ga4_enabled: 'false',
    };
    return keys.map(key => ({ key, value: Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null }));
  }
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', keys);
  if (error) throw error;
  return data ?? [];
}
