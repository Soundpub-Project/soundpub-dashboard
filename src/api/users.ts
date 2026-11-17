import { apiRequest } from './client';

export type AppRole = 'superadmin' | 'admin' | 'label' | 'label_custom' | 'artist' | 'user' | 'copyright' | 'whitelabel';

export interface BackendUser {
  id: string;
  email: string | null;
  account_kind?: 'STANDARD' | 'MANAGED_ARTIST';
  full_name?: string | null;
  phone?: string | null;
  address?: string | null;
  parent_label_id?: string | null;
  parent_label_name?: string | null;
  balance?: number | string;
  logo_url?: string | null;
  logo_url_light?: string | null;
  logo_url_dark?: string | null;
  avatar_url?: string | null;
  password_set?: boolean | null;
  subscription_status?: string | null;
  subscription_upgraded_at?: string | null;
  sso_provider?: string | null;
  artist_profile_completed?: boolean | null;
  email_verified?: boolean | null;
  updated_at?: string;
  composer_code?: string | null;
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
  roles: AppRole[];
}

export interface IccnIdentityBinding {
  provider: 'iccn';
  issuer: string;
  subject: string;
  verifiedAt: string | null;
}

export interface IccnIdentity {
  eligible: boolean;
  issuer: string | null;
  binding: IccnIdentityBinding | null;
}

export const usersApi = {
  create: (body: { email: string; password: string; fullName: string; phone?: string | null; role: AppRole; parentLabelId?: string | null }) =>
    apiRequest<BackendUser>('/api/v1/admin/users', { method: 'POST', body }),
  updateProfile: (body: ProfileUpdate) => apiRequest<{ profile: BackendUser; roles: AppRole[] }>('/api/v1/profile', { method: 'PATCH', body }),
  profile: (signal?: AbortSignal) => apiRequest<{ profile: BackendUser; roles: AppRole[] }>('/api/v1/profile', { signal }),
  list: (cursor?: string, signal?: AbortSignal) => apiRequest<{ items: BackendUser[]; nextCursor: string | null }>(
    `/api/v1/admin/users?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal },
  ),
  dashboardSummary: (signal?: AbortSignal) => apiRequest<{ total_users: number; pending_payouts: number }>(
    '/api/v1/admin/dashboard/summary', { signal },
  ),
  status: (id: string, status: BackendUser['status']) => apiRequest<{ status: BackendUser['status'] }>(
    `/api/v1/admin/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } },
  ),
  roles: (id: string, roles: AppRole[], parentLabelId?: string | null) => apiRequest<{ roles: AppRole[] }>(
    `/api/v1/admin/users/${encodeURIComponent(id)}/roles`, { method: 'PUT', body: { roles, parentLabelId } },
  ),
  resetPassword: (id: string, newPassword: string) => apiRequest<{ status: 'ok' }>(
    `/api/v1/admin/users/${encodeURIComponent(id)}/password`, { method: 'PUT', body: { newPassword } },
  ),
  composerCode: (id: string, composerCode: string | null) => apiRequest<{ composerCode: string | null }>(
    `/api/v1/admin/users/${encodeURIComponent(id)}/composer-code`, { method: 'PUT', body: { composerCode } },
  ),
  iccnIdentity: (id: string, signal?: AbortSignal) => apiRequest<IccnIdentity>(
    `/api/v1/admin/users/${encodeURIComponent(id)}/iccn-identity`, { signal },
  ),
  bindIccnIdentity: (id: string, subject: string) => apiRequest<IccnIdentity>(
    `/api/v1/admin/users/${encodeURIComponent(id)}/iccn-identity`, { method: 'PUT', body: { subject } },
  ),
  unbindIccnIdentity: (id: string, subject: string) => apiRequest<{ deleted: true }>(
    `/api/v1/admin/users/${encodeURIComponent(id)}/iccn-identity`, { method: 'DELETE', body: { subject } },
  ),
  delete: (id: string) => apiRequest<{ deleted: true }>(
    `/api/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' },
  ),
};

export type ProfileUpdate = Partial<Pick<BackendUser, 'full_name' | 'phone' | 'address' | 'avatar_url' | 'logo_url' | 'logo_url_light' | 'logo_url_dark'>>;




