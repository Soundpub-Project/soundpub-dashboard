import type { PoolClient } from 'pg';
import type { ReleaseCreate, ReleaseDto, ReleaseListQuery, ReleasePatch } from './contracts.js';

const projection = `r.id, r.artist_id, r.label_id, (SELECT p.full_name FROM soundpub.profiles p WHERE p.id=r.label_id) AS label_name, r.artist_user_id, r.created_by, r.title, r.artist_name,
  r.release_type, r.genre, to_char(r.release_date, 'YYYY-MM-DD') AS release_date,
  CASE WHEN EXISTS (SELECT 1 FROM soundpub.media_objects media WHERE media.id=r.cover_media_id
    AND media.status='ACTIVE' AND media.category='RELEASE_COVER') THEN r.cover_url ELSE NULL END AS cover_url,
  r.upc, r.status, r.rejection_reason, r.version,
  to_char(r.archived_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS archived_at,
  to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(r.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;

export function releasesRepository(db: PoolClient) {
  return {
    async find(id: string, lock = false) {
      return (await db.query<ReleaseDto>(`SELECT ${projection} FROM soundpub.releases r
        WHERE r.id=$1 ${lock ? 'FOR UPDATE OF r' : ''}`, [id])).rows[0] ?? null;
    },
    async list(actorId: string, admin: boolean, label: boolean, artist: boolean,
      query: ReleaseListQuery, cursor: string | null, limit: number, custom = false) {
      return (await db.query<ReleaseDto>(`SELECT ${projection} FROM soundpub.releases r
        WHERE (($2::boolean AND NOT EXISTS (SELECT 1 FROM soundpub.artists ca WHERE ca.id=r.artist_id AND ca.management_mode='LABEL_CUSTOM_MANAGED')) OR
          ($9::boolean AND EXISTS (SELECT 1 FROM soundpub.artists ca JOIN soundpub.label_custom_units cu ON cu.id=ca.label_custom_unit_id
            WHERE ca.id=r.artist_id AND ca.management_mode='LABEL_CUSTOM_MANAGED' AND cu.owner_user_id=$1 AND cu.status='active')) OR (($4::boolean AND r.artist_user_id=$1 OR $3::boolean AND EXISTS (
          SELECT 1 FROM soundpub.artists a JOIN soundpub.profiles p ON p.id=a.artist_user_id
          WHERE a.artist_user_id=r.artist_user_id AND a.label_id=$1 AND p.parent_label_id=a.label_id
            AND a.verified_at IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM soundpub.user_roles privileged WHERE privileged.user_id=a.artist_user_id
                AND privileged.tenant_id IS NULL AND privileged.role IN ('admin','superadmin'))))
          AND EXISTS (SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=r.artist_user_id
            AND role.role='artist' AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL)))
        AND ($5::text IS NULL OR strpos(lower(r.title || ' ' || r.artist_name),lower($5))>0)
        AND ($6::text IS NULL OR r.status=$6) AND ($7::uuid IS NULL OR r.id>$7)
        ORDER BY r.id LIMIT $8`,
      [actorId, admin, label, artist, query.search ?? null, query.status ?? null, cursor, limit + 1, custom])).rows;
    },
    async create(id: string, actorId: string, labelId: string | null, input: ReleaseCreate,
      snapshot: { price_per_track_snapshot: string | null; total_payment_snapshot: string | null } | null = null) {
      await db.query(`INSERT INTO soundpub.releases
        (id,label_id,artist_user_id,created_by,title,artist_name,release_type,genre,release_date,cover_url,upc,status,
          price_per_track_snapshot,total_payment_snapshot,artist_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [id, labelId, input.artist_user_id, actorId, input.title, input.artist_name, input.release_type,
        input.genre ?? null, input.release_date ?? null, input.cover_url ?? null, input.upc ?? null, input.status ?? 'draft',
        snapshot?.price_per_track_snapshot ?? null, snapshot?.total_payment_snapshot ?? null, input.artist_id ?? null]);
    },
    async update(id: string, input: ReleasePatch & {
      price_per_track_snapshot?: string | null; total_payment_snapshot?: string | null;
    }) {
      const { version, ...patch } = input;
      // Keys originate in strict contracts; ownership never enters this patch.
      const entries = Object.entries(patch);
      return (await db.query(`UPDATE soundpub.releases SET
        ${entries.map(([key], index) => `${key}=$${index + 3}`).join(',')}, updated_at=now()
        WHERE id=$1 AND version=$2 RETURNING id`, [id, version, ...entries.map(([, value]) => value)])).rowCount === 1;
    },
    async audit(actorId: string, id: string, requestId: string, action: string, metadata: unknown) {
      await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
        VALUES ($1,$2,'release',$3,$4,$5::jsonb)`, [actorId, action, id, requestId, JSON.stringify(metadata)]);
    },
  };
}
