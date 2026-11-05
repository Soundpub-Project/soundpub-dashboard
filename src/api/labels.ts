import { apiRequest } from './client';
export interface RosterItem {
  membershipId: string; artistId: string; labelId: string; name: string; fullName: string;
  status: 'active' | 'inactive' | 'suspended';
  email: string | null; phone: string | null; address: string | null; passwordSet: boolean; createdAt: string;
}
export interface ArtistParent { artistId: string; parentLabelId: string | null; membershipId: string | null }
export interface BackendLabel {
  id: string; ownerId: string; full_name: string; status: 'active' | 'inactive' | 'suspended';
  logo_url: string | null; logo_url_light: string | null; logo_url_dark: string | null;
  roles: ('label' | 'whitelabel')[];
}
export const labelsApi = {
  whitelabelDashboard: () => apiRequest<{ label_id: string; subscription_status: string | null; currency: 'IDR';
    total_artists: number; total_releases: number; total_revenue: string; artists_with_access: number;
    artists_without_access: number }>('/api/v1/whitelabel/dashboard'),
  createWhitelabelArtist: (body: { email: string; fullName: string; phone?: string | null }) =>
    apiRequest<import('./users').BackendUser>('/api/v1/whitelabel/artists', { method: 'POST', body }),
  enableWhitelabelArtistLogin: (id: string, newPassword: string) => apiRequest<{ status: 'ok' }>(
    `/api/v1/whitelabel/artists/${encodeURIComponent(id)}/password`, { method: 'PUT', body: { newPassword } }),
  detail: (id: string) => apiRequest<BackendLabel>(`/api/v1/labels/${encodeURIComponent(id)}`),
  list: (cursor?: string) => apiRequest<{ items: BackendLabel[]; nextCursor: string | null }>(
    `/api/v1/labels?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  ),
  artists: (labelId: string, cursor?: string) => apiRequest<{ items: RosterItem[]; nextCursor: string | null }>(
    `/api/v1/labels/${encodeURIComponent(labelId)}/artists?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  ),
  parent: (id: string) => apiRequest<ArtistParent>(`/api/v1/artists/${encodeURIComponent(id)}/parent`),
  assign: (id: string, labelId: string) => apiRequest<ArtistParent>(`/api/v1/artists/${encodeURIComponent(id)}/assign`, {
    method: 'POST', body: { labelId, expectedParentLabelId: null },
  }),
  transfer: (id: string, labelId: string, expectedParentLabelId: string, confirmationPhrase: string) => apiRequest<ArtistParent>(
    `/api/v1/artists/${encodeURIComponent(id)}/transfer`, {
      method: 'POST', body: { labelId, expectedParentLabelId, confirmationPhrase, royaltyTransferMode: 'keep_old_label' },
    },
  ),
  remove: (id: string, expectedParentLabelId: string) => apiRequest<ArtistParent>(`/api/v1/artists/${encodeURIComponent(id)}/remove`, {
    method: 'POST', body: { expectedParentLabelId },
  }),
};
