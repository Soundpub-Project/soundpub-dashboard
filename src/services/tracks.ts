import { tracksApi } from '@/api/tracks';
import { usesBackendReleases, listBackendReleases } from './releases';
export async function listBackendTracks(releaseId?: string) {
  if (!usesBackendReleases()) throw new Error('Backend releases mode required');
  const ids = releaseId ? [releaseId] : (await listBackendReleases()).map(release => release.id);
  const items = [];
  for (const id of ids) {
    const page = await tracksApi.list(id);
    items.push(...page.items);
  }
  return items;
}
