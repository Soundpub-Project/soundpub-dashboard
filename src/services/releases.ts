import { releasesApi, type BackendRelease, type CursorPage } from '@/api/releases';
import { usesBackendDomain } from '@/api/routing';

export const usesBackendReleases = () => usesBackendDomain('releases');
export const releaseWorkflowUnavailable = 'Mode backend: metadata release dan track tersedia. Upload media, pembayaran, aktivasi, refund, penghapusan dan bulk action belum tersedia.';

export async function collectReleasePages<T>(load: (cursor?: string) => Promise<CursorPage<T>>): Promise<T[]> {
  if (!usesBackendReleases()) throw new Error('Backend releases mode required');
  const items: T[] = [];
  const visited = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await load(cursor ?? undefined);
    if (!page || !Array.isArray(page.items) || !(page.nextCursor === null || typeof page.nextCursor === 'string')) {
      throw new Error('Invalid releases API pagination');
    }
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor !== null) {
      if (!cursor || visited.has(cursor)) throw new Error('Invalid releases API cursor');
      visited.add(cursor);
    }
  } while (cursor !== null);
  return items;
}

export const listBackendReleases = async () => (await collectReleasePages(releasesApi.list)).sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id));
export function getBackendRelease(id: string) {
  if (!usesBackendReleases()) throw new Error('Backend releases mode required');
  return releasesApi.detail(id);
}

// Archive/restore keeps history and uses the version shown to the user.
export function archiveBackendRelease(release: Pick<BackendRelease, 'id' | 'version' | 'archived_at'>) {
  if (!usesBackendReleases()) throw new Error('Backend releases mode required');
  return releasesApi.update(release.id, {
    version: release.version,
    archived_at: release.archived_at ? null : new Date().toISOString(),
    ...(release.archived_at ? {} : { status: 'inactive' as const }),
  });
}
