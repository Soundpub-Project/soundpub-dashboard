import { apiRequest } from './client';

export type LabelCustomStatus = 'active' | 'archived';
export interface LabelCustomOwnerScope { owner_user_id?: string }
export interface LabelCustomUnit {
  id: string;
  owner_user_id: string;
  unit_code: string;
  name: string;
  status: LabelCustomStatus;
  created_at: string;
  updated_at: string;
}
export interface LabelCustomArtist {
  id: string;
  label_id: string;
  artist_user_id: null;
  label_custom_unit_id: string;
  management_mode: 'LABEL_CUSTOM_MANAGED';
  name: string;
  contact_email: string;
  contact_phone: string;
  status: LabelCustomStatus;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface LabelCustomUnitCreate { name: string }
export type LabelCustomUnitPatch = Partial<Pick<LabelCustomUnit, 'name' | 'status'>>;
export type LabelCustomArtistCreate = Pick<LabelCustomArtist, 'name' | 'contact_email' | 'contact_phone'>;
export type LabelCustomArtistPatch = Partial<LabelCustomArtistCreate>;
export interface LabelCustomArtistQuery {
  limit?: number;
  cursor?: string;
  search?: string;
  status?: LabelCustomStatus;
}
export interface LabelCustomArtistPage { items: LabelCustomArtist[]; nextCursor: string | null }

function path(resource: string, scope: LabelCustomOwnerScope = {}, query: LabelCustomArtistQuery = {}) {
  const params = new URLSearchParams();
  if (scope.owner_user_id !== undefined) params.set('owner_user_id', scope.owner_user_id);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.cursor !== undefined) params.set('cursor', query.cursor);
  if (query.search !== undefined) params.set('search', query.search);
  if (query.status !== undefined) params.set('status', query.status);
  const suffix = params.toString();
  return `/api/v1/label-custom/${resource}${suffix ? `?${suffix}` : ''}`;
}

export const labelCustomApi = {
  getUnit: (scope?: LabelCustomOwnerScope) => apiRequest<LabelCustomUnit>(path('unit', scope)),
  createUnit: (body: LabelCustomUnitCreate, scope?: LabelCustomOwnerScope) =>
    apiRequest<LabelCustomUnit>(path('unit', scope), { method: 'POST', body }),
  updateUnit: (body: LabelCustomUnitPatch, scope?: LabelCustomOwnerScope) =>
    apiRequest<LabelCustomUnit>(path('unit', scope), { method: 'PATCH', body }),
  listArtists: (query: LabelCustomArtistQuery = {}, scope?: LabelCustomOwnerScope) =>
    apiRequest<LabelCustomArtistPage>(path('artists', scope, { limit: 100, ...query })),
  getArtist: (id: string, scope?: LabelCustomOwnerScope) =>
    apiRequest<LabelCustomArtist>(path(`artists/${encodeURIComponent(id)}`, scope)),
  createArtist: (body: LabelCustomArtistCreate, idempotencyKey: string, scope?: LabelCustomOwnerScope) =>
    apiRequest<LabelCustomArtist>(path('artists', scope), { method: 'POST', body, idempotencyKey }),
  updateArtist: (id: string, body: LabelCustomArtistPatch, scope?: LabelCustomOwnerScope) =>
    apiRequest<LabelCustomArtist>(path(`artists/${encodeURIComponent(id)}`, scope), { method: 'PATCH', body }),
  // DELETE archives the managed artist; it does not delete a login account.
  archiveArtist: (id: string, scope?: LabelCustomOwnerScope) =>
    apiRequest<LabelCustomArtist>(path(`artists/${encodeURIComponent(id)}`, scope), { method: 'DELETE' }),
};
