import type { PoolClient } from 'pg';
import { ApiError } from '../api/types.js';

// Mirrors legacy remove-artist-from-label: submitted or active releases retain label authority.
// Older rows can lack artist_user_id, so match their recorded display name to the profile snapshot.
export async function assertArtistCanDetachFromLabel(db: PoolClient, artistUserId: string): Promise<void> {
  const blocking = await db.query<{ id: string }>(`SELECT release.id
    FROM soundpub.releases release
    JOIN soundpub.profiles artist ON artist.id=$1
    WHERE release.status IN ('pending','pending_paid','processing','revision_submitted','active')
      AND (release.artist_user_id=$1 OR (release.artist_user_id IS NULL AND release.artist_name=artist.full_name))
    ORDER BY release.id LIMIT 1 FOR KEY SHARE OF release`, [artistUserId]);
  if (blocking.rows[0]) throw new ApiError(409, 'CONFLICT');
}