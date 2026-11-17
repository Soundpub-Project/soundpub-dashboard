import { apiRequest } from './client';
export interface BackendTrack {
  audio_url?: string | null;
  clip_url?: string | null;
  id: string; artist_id: string | null; release_id: string; title: string; artist_name: string; position: number; version: number;
  genre: string | null; composer: string | null; lyricist: string | null; lyrics: string | null;
  isrc: string | null; duration: number | null; explicit_lyrics: boolean; created_at: string; updated_at: string;
}
export type TrackMetadata = Pick<BackendTrack, 'title' | 'artist_name'> & Partial<Pick<BackendTrack, 'genre' | 'composer' | 'lyricist' | 'lyrics' | 'isrc' | 'duration' | 'explicit_lyrics'>>;
export const tracksApi = {
  list: (releaseId: string) => apiRequest<{ items: BackendTrack[]; release_version: number }>(`/api/v1/releases/${encodeURIComponent(releaseId)}/tracks`),
  create: (releaseId: string, body: TrackMetadata & { release_version: number }) => apiRequest<{ track: BackendTrack; release_version: number }>(`/api/v1/releases/${encodeURIComponent(releaseId)}/tracks`, { method: 'POST', body }),
  update: (id: string, body: TrackMetadata & { version: number; release_version: number }) => apiRequest<{ track: BackendTrack; release_version: number }>(`/api/v1/tracks/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  delete: (id: string, body: { version: number; release_version: number }) => apiRequest<{ id: string; release_version: number }>(`/api/v1/tracks/${encodeURIComponent(id)}`, { method: 'DELETE', body }),
  reorder: (releaseId: string, body: { release_version: number; track_ids: string[] }) => apiRequest<{ items: BackendTrack[]; release_version: number }>(`/api/v1/releases/${encodeURIComponent(releaseId)}/tracks/reorder`, { method: 'POST', body }),
};
