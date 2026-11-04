import { artistsApi, type ArtistAccount, type ArtistDeletionRequest, type ArtistCreate, type ArtistPatch } from '@/api/artists';
import { supabase } from '@/integrations/supabase/client';
import { usesBackendArtistLabels, requireArtistLabelApi } from './labels';

export { usesBackendArtistLabels, artistAuthUnavailable, artistMediaUnavailable } from './labels';

export async function getArtist(id: string) {
  if (!usesBackendArtistLabels()) throw new Error('Backend artist mode required');
  requireArtistLabelApi();
  return artistsApi.detail(id);
}

export async function createArtist(input: ArtistCreate) {
  if (!usesBackendArtistLabels()) throw new Error('Backend artist mode required');
  requireArtistLabelApi();
  return artistsApi.create(input);
}

export async function saveArtistProfile(id: string, patch: ArtistPatch) {
  if (!usesBackendArtistLabels()) throw new Error('Backend artist mode required');
  requireArtistLabelApi();
  return artistsApi.update(id, patch);
}

export async function updateArtistAccount(id: string, patch: Pick<ArtistAccount, 'full_name' | 'phone' | 'address' | 'status'>) {
  if (usesBackendArtistLabels()) {
    requireArtistLabelApi();
    const { full_name, phone, address } = patch;
    return artistsApi.update(id, { full_name, phone, address });
  }
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}

export async function requestArtistDeletion(id: string, reason: string) {
  if (usesBackendArtistLabels()) { requireArtistLabelApi(); return artistsApi.requestDeletion(id, reason); }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { error } = await (supabase as any).from('artist_deletion_requests').insert({ artist_id: id, label_id: user.id, reason, status: 'pending' });
  if (error) throw error;
}

export async function listArtistDeletionRequests(): Promise<ArtistDeletionRequest[]> {
  if (usesBackendArtistLabels()) {
    requireArtistLabelApi();
    const items: ArtistDeletionRequest[] = [];
    const visited = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await artistsApi.deletionRequests(cursor ?? undefined);
      items.push(...page.items);
      cursor = page.nextCursor;
      if (cursor && visited.has(cursor)) throw new Error('Invalid deletion requests pagination');
      if (cursor) visited.add(cursor);
    } while (cursor);
    return items;
  }
  const { data, error } = await (supabase as any).from('artist_deletion_requests')
    .select('id, reason, status, created_at, artist:profiles!artist_id(full_name, email)').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ArtistDeletionRequest[];
}


