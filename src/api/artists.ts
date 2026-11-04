import { apiRequest } from './client';

export interface ArtistAccount {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  address: string | null;
  status: string;
  created_at: string | null;
  parent_label_id?: string | null;
  avatar_url?: string | null;
  artist_profile_completed?: boolean | null;
  artist_profile?: { artist_name: string; social_links?: Record<string, string | boolean> | null; profile_image_url?: string | null } | null;
}

export interface BackendArtist {
  id: string;
  profile_id: string | null;
  catalog_artist_id: string | null;
  label_user_id: string | null;
  full_name: string;
  phone: string | null;
  address: string | null;
  status: 'active' | 'inactive' | 'suspended';
  artist_name: string;
  artist_type: string;
  legal_name: string | null;
  profile_image_url: string | null;
  country: string | null;
  city: string | null;
  language: string | null;
  gender: string | null;
  date_of_birth: string | null;
  genre: string | null;
  bio: string | null;
  social_links: Record<string, string | boolean> | null;
  verified: boolean;
  verified_at: string | null;
  artist_profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

export type ArtistPatch = Partial<Pick<BackendArtist, 'artist_name' | 'artist_type' | 'full_name' | 'phone' | 'address' |
  'bio' | 'genre' | 'legal_name' | 'country' | 'city' | 'language' | 'gender' | 'date_of_birth' | 'social_links'>>;
export type ArtistCreate = ArtistPatch & { artist_name: string; label_user_id?: string };
export interface ArtistDeletionRequest {
  id: string;
  artist_id: string;
  label_id: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  artist?: { full_name: string | null; email: string | null } | null;
}

export const artistsApi = {
  list: (cursor?: string) => apiRequest<{ items: BackendArtist[]; nextCursor: string | null }>(
    `/api/v1/artists?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  ),
  detail: (id: string) => apiRequest<BackendArtist>(`/api/v1/artists/${encodeURIComponent(id)}`),
  create: (body: ArtistCreate) => apiRequest<BackendArtist>('/api/v1/artists', { method: 'POST', body }),
  update: (id: string, body: ArtistPatch) => apiRequest<BackendArtist>(`/api/v1/artists/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  requestDeletion: (id: string, reason: string) => apiRequest<ArtistDeletionRequest>(
    `/api/v1/artists/${encodeURIComponent(id)}/deletion-requests`, { method: 'POST', body: { reason } },
  ),
  reviewDeletion: (id: string, status: 'approved' | 'rejected') => apiRequest<ArtistDeletionRequest>(
    `/api/v1/artist-deletion-requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } },
  ),
  deletionRequests: (cursor?: string) => apiRequest<{ items: ArtistDeletionRequest[]; nextCursor: string | null }>(
    `/api/v1/artist-deletion-requests?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  ),
};

