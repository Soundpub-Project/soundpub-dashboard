import type { PoolClient } from 'pg';
import type { TrackDto } from './contracts.js';

export interface TrackParent {
  id: string; artist_id?: string | null; artist_user_id: string | null; label_id: string | null; status: string; version: number;
  archived_at?: string | null; payment_priced?: boolean;
}
const projection = `id, artist_id, release_id, title, artist_name, position, version, genre, composer,
  lyricist, lyrics, isrc, duration::double precision AS duration, explicit_lyrics,
  CASE WHEN EXISTS (SELECT 1 FROM soundpub.media_objects media WHERE media.id=audio_media_id
    AND media.status='ACTIVE' AND media.category='TRACK_AUDIO') THEN audio_url ELSE NULL END AS audio_url,
  CASE WHEN EXISTS (SELECT 1 FROM soundpub.media_objects media WHERE media.id=clip_media_id
    AND media.status='ACTIVE' AND media.category='TRACK_CLIP') THEN clip_url ELSE NULL END AS clip_url,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;

export function tracksRepository(db: PoolClient) {
  return {
    async parent(id: string, write: boolean | null) {
      return (await db.query<TrackParent>(`SELECT r.id, r.artist_id, r.artist_user_id, r.label_id, r.status, r.version, r.archived_at,
          (r.price_per_track_snapshot IS NOT NULL OR r.total_payment_snapshot IS NOT NULL OR
            EXISTS (SELECT 1 FROM soundpub.payment_invoices invoice WHERE invoice.business_id=r.id)) AS payment_priced
        FROM soundpub.releases r WHERE r.id=$1 ${write === null ? '' : `FOR ${write ? 'UPDATE' : 'SHARE'}`}`, [id])).rows[0] ?? null;
    },
    async verifiedArtist(artistId: string, actorId: string, write: boolean) {
      await db.query(`SELECT id FROM soundpub.artists WHERE artist_user_id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`, [artistId]);
      await db.query(`SELECT id FROM soundpub.profiles WHERE id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`, [artistId]);
      return (await db.query<{ verified: boolean; label_id: string | null }>(`SELECT
        EXISTS (SELECT 1 FROM soundpub.user_roles WHERE user_id=$1 AND role='artist'
          AND tenant_id IS NULL AND verified_at IS NOT NULL) AS verified,
        (SELECT a.label_id FROM soundpub.artists a JOIN soundpub.profiles p ON p.id=a.artist_user_id
          WHERE a.artist_user_id=$1 AND a.label_id=p.parent_label_id AND a.verified_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM soundpub.user_roles privileged WHERE privileged.user_id=$1
            AND privileged.tenant_id IS NULL AND privileged.role IN ('admin','superadmin'))
          AND a.label_id=$2) AS label_id`, [artistId, actorId])).rows[0];
    },
    async parentId(id: string) {
      return (await db.query<{ release_id: string }>('SELECT release_id FROM soundpub.tracks WHERE id=$1', [id])).rows[0]?.release_id ?? null;
    },
    async list(releaseId: string) {
      return (await db.query<TrackDto>(`SELECT ${projection} FROM soundpub.tracks
        WHERE release_id=$1 ORDER BY position, id`, [releaseId])).rows;
    },
    async find(id: string, releaseId: string) {
      return (await db.query<TrackDto>(`SELECT ${projection} FROM soundpub.tracks WHERE id=$1 AND release_id=$2`, [id, releaseId])).rows[0] ?? null;
    },
    async create(id: string, releaseId: string, fields: Record<string, unknown>) {
      const entries = Object.entries(fields);
      await db.query(`INSERT INTO soundpub.tracks(id,release_id,position,${entries.map(([key]) => key).join(',')})
        SELECT $1,$2,COALESCE(MAX(position),0)+1,${entries.map((_, i) => `$${i + 3}`).join(',')}
        FROM soundpub.tracks WHERE release_id=$2`, [id, releaseId, ...entries.map(([, value]) => value)]);
    },
    async update(id: string, releaseId: string, version: number, fields: Record<string, unknown>) {
      const entries = Object.entries(fields);
      return (await db.query(`UPDATE soundpub.tracks SET ${entries.map(([key], i) => `${key}=$${i + 4}`).join(',')},
        updated_at=now() WHERE id=$1 AND release_id=$2 AND version=$3`,
      [id, releaseId, version, ...entries.map(([, value]) => value)])).rowCount === 1;
    },
    async delete(id: string, releaseId: string, version: number) {
      return (await db.query('DELETE FROM soundpub.tracks WHERE id=$1 AND release_id=$2 AND version=$3', [id, releaseId, version])).rowCount === 1;
    },
    async reorder(releaseId: string, ids: string[]) {
      // Schema's deferred unique constraint permits swaps; trigger increments each version once.
      await db.query(`UPDATE soundpub.tracks t SET position=ordered.position::integer,
        updated_at=now() FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered(id,position)
        WHERE t.release_id=$1 AND t.id=ordered.id`, [releaseId, ids]);
    },
    async bumpParent(id: string, version: number) {
      return (await db.query(`UPDATE soundpub.releases SET updated_at=now()
        WHERE id=$1 AND version=$2`, [id, version])).rowCount === 1;
    },
    async audit(actorId: string, id: string, requestId: string, action: string, metadata: unknown) {
      await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
        VALUES ($1,$2,'track',$3,$4,$5::jsonb)`, [actorId, action, id, requestId, JSON.stringify(metadata)]);
    },
  };
}
