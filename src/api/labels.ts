import { apiRequest } from './client';
export interface RosterItem {
  membershipId: string; artistId: string; labelId: string; name: string; fullName: string;
  status: 'active' | 'inactive' | 'suspended';
}
export interface ArtistParent { artistId: string; parentLabelId: string | null; membershipId: string | null }
export interface BackendLabel {
  id: string; ownerId: string; full_name: string; status: 'active' | 'inactive' | 'suspended';
  logo_url: string | null; logo_url_light: string | null; logo_url_dark: string | null;
  roles: ('label' | 'whitelabel')[];
}
export const labelsApi = {
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
