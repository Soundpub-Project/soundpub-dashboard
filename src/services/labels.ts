import { usesBackendDomain } from '@/api/routing';
import { labelsApi } from '@/api/labels';
import type { ArtistAccount } from '@/api/artists';
import { supabase } from '@/integrations/supabase/client';
import { listLabels as listLegacyLabels } from './users';

// Shared profile/relationship writes must not cross the Users migration boundary.
export const usesBackendArtistLabels = () => ['users', 'artists', 'labels'].some(usesBackendDomain);
export const artistLabelApiReady = () => ['users', 'artists', 'labels'].every(usesBackendDomain);
export const requireArtistLabelApi = () => { if (!artistLabelApiReady()) throw new Error('Artist/Label backend belum tersedia'); };
export const artistAuthUnavailable = 'Pembuatan akun dan penghapusan permanen artis belum tersedia melalui backend.';
export const artistMediaUnavailable = 'Upload foto, logo, dan integrasi Spotify belum tersedia melalui backend.';

export async function listLabels() {
  if (!usesBackendArtistLabels()) return listLegacyLabels();
  requireArtistLabelApi();
  const items: Awaited<ReturnType<typeof labelsApi.list>>['items'] = [];
  const visited = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await labelsApi.list(cursor ?? undefined);
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor && visited.has(cursor)) throw new Error('Invalid labels pagination');
    if (cursor) visited.add(cursor);
  } while (cursor);
  return items.filter(item => item.status === 'active').map(item => ({
    id: item.id, full_name: `${item.full_name}${item.roles.includes('whitelabel') ? ' (Whitelabel)' : ''}`,
  }));
}

export async function listLabelArtists(labelId: string): Promise<ArtistAccount[]> {
  if (usesBackendArtistLabels()) {
    requireArtistLabelApi();
    const items: ArtistAccount[] = [];
    const visited = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await labelsApi.artists(labelId, cursor ?? undefined);
      items.push(...page.items.map(item => ({
        id: item.artistId, full_name: item.fullName, status: item.status, parent_label_id: item.labelId,
        email: null, phone: null, address: null, created_at: null, artist_profile: { artist_name: item.name },
      })));
      cursor = page.nextCursor;
      if (cursor && visited.has(cursor)) throw new Error('Invalid artists pagination');
      if (cursor) visited.add(cursor);
    } while (cursor);
    return items;
  }
  const { data: profiles, error } = await supabase.from('profiles').select('*')
    .eq('parent_label_id', labelId).order('created_at', { ascending: false });
  if (error) throw error;
  if (!profiles?.length) return [];
  const { data: artistProfiles, error: artistError } = await supabase.from('artist_profiles').select('*')
    .in('user_id', profiles.map(profile => profile.id));
  if (artistError) throw artistError;
  return profiles.map(profile => ({ ...profile, artist_profile: artistProfiles?.find(artist => artist.user_id === profile.id) ?? null })) as ArtistAccount[];
}

export async function removeLabelArtist(labelId: string, artistId: string) {
  if (usesBackendArtistLabels()) { requireArtistLabelApi(); return labelsApi.remove(artistId, labelId); }
  const { data, error } = await supabase.functions.invoke('remove-artist-from-label', { body: { artist_id: artistId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}



