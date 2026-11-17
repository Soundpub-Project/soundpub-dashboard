import { tracksApi } from '@/api/tracks';
import { usesBackendReleases, listBackendReleases } from './releases';

export async function listBackendTracks(releaseId?: string | string[]) {
  if (!usesBackendReleases()) throw new Error('Backend releases mode required');
  const ids = releaseId === undefined
    ? (await listBackendReleases()).map(release => release.id)
    : Array.isArray(releaseId) ? releaseId : [releaseId];
  const items = [];
  for (let offset = 0; offset < ids.length; offset += 8) {
    const pages = await Promise.all(ids.slice(offset, offset + 8).map(id => tracksApi.list(id)));
    items.push(...pages.flatMap(page => page.items));
  }
  return items;
}
