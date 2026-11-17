import { apiRequest } from './client';

export interface AuthNoticeSettings {
  enabled: boolean; title: string; badge: string; message: string; detail: string; buttonText: string; revision: string;
}
export interface PublicSettings {
  dashboard_logo_light: string | null;
  dashboard_logo_dark: string | null;
  favicon: string | null;
  auth_notice_config: AuthNoticeSettings;
}
export interface UserSettings {
  email_notif_payout: boolean; email_notif_release: boolean; email_notif_payment: boolean; email_notif_announcement: boolean;
}
export type AdminSettings = PublicSettings & { maintenance_enabled: boolean; min_payout_amount: string | null; release_pricing_mode: 'per_track' | 'per_category'; release_price_per_track: string | null; release_price_single: string | null; release_price_ep: string | null; release_price_album: string | null; release_price_custom_label: string | null };
export type VersionedSettings<T> = { settings: T; version: number };
export const settingsApi = {
  public: () => apiRequest<{ settings: PublicSettings }>('/api/v1/settings/public', { authenticated: false }),
  user: () => apiRequest<VersionedSettings<UserSettings>>('/api/v1/settings/me'),
  updateUser: (version: number, settings: Partial<UserSettings>) => apiRequest<VersionedSettings<UserSettings>>('/api/v1/settings/me', { method: 'PATCH', body: { version, settings } }),
  admin: () => apiRequest<VersionedSettings<AdminSettings>>('/api/v1/admin/settings'),
  updateAdmin: (version: number, settings: Partial<AdminSettings>) => apiRequest<VersionedSettings<AdminSettings>>('/api/v1/admin/settings', { method: 'PATCH', body: { version, settings } }),
};
