import { apiRequest } from './client';

export interface PublicCatalogTrack {
  id: string; title: string; artist_name: string; isrc: string | null; genre: string | null;
  audio_url: null; clip_url: null; duration: number | null;
}
export interface PublicCatalogRelease {
  id: string; title: string; artist_name: string; cover_url: null; genre: string | null;
  release_type: string; release_date: string | null; upc: string | null; tracks: PublicCatalogTrack[];
}
export interface PublicCatalogPage {
  success: true;
  data: PublicCatalogRelease[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}
export const publicCatalogApi = {
  list: ({ limit, offset, search }: { limit: number; offset: number; search?: string }) => {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) query.set('search', search);
    return apiRequest<PublicCatalogPage>(`/api/v1/public/releases?${query}`, { authenticated: false });
  },
  detail: (id: string) => apiRequest<PublicCatalogRelease>(`/api/v1/public/releases/${encodeURIComponent(id)}`, { authenticated: false }),
};
