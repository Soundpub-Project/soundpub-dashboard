import type { PoolClient } from 'pg';
import type { CustomManagedArtistCreate, CustomManagedArtistDto, CustomManagedArtistListQuery,
  CustomManagedArtistPatch, LabelCustomUnitDto, LabelCustomUnitPatch } from './contracts.js';

const timestamp = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const unitProjection = `id, owner_user_id, unit_code, name, status,
  ${timestamp('created_at')} AS created_at, ${timestamp('updated_at')} AS updated_at`;
// The supplied 0023 schema has no artist status/archived_at. NULL verification
// marks an archived managed artist; its catalog and profile rows remain intact.
const artistProjection = `id, label_id, artist_user_id, label_custom_unit_id, management_mode,
  name, contact_email, contact_phone,
  CASE WHEN verified_at IS NULL THEN 'archived' ELSE 'active' END AS status,
  ${timestamp('verified_at')} AS verified_at, ${timestamp('created_at')} AS created_at,
  ${timestamp('updated_at')} AS updated_at`;
const artistScope = `label_id = $1 AND label_custom_unit_id = $2
  AND artist_user_id IS NULL AND management_mode = 'LABEL_CUSTOM_MANAGED'`;

export function labelCustomRepository(db: PoolClient) {
  return {
    async claimArtistCreate(ownerId: string, requestId: string, requestHash: string) {
      const scope = 'label-custom.artist.create:' + ownerId;
      const inserted = await db.query('INSERT INTO soundpub.idempotency_keys(scope,key,request_hash,expires_at) ' +
        "VALUES($1,$2,$3,now()+interval '24 hours') ON CONFLICT (scope,key) DO NOTHING RETURNING status",
      [scope, requestId, requestHash]);
      if (inserted.rowCount) return { state: 'new' as const, scope };
      const row = (await db.query<{ request_hash: string; status: 'processing' | 'completed'; response_body: unknown }>(
        'SELECT request_hash,status,response_body FROM soundpub.idempotency_keys ' +
        'WHERE scope=$1 AND key=$2 AND expires_at>now() FOR UPDATE', [scope, requestId])).rows[0];
      if (!row || row.request_hash !== requestHash || row.status !== 'completed') return { state: 'conflict' as const, scope };
      return { state: 'completed' as const, scope, responseBody: row.response_body };
    },
    async completeArtistCreate(scope: string, requestId: string, responseBody: CustomManagedArtistDto) {
      return (await db.query("UPDATE soundpub.idempotency_keys SET status='completed',response_status=200,response_body=$3::jsonb " +
        "WHERE scope=$1 AND key=$2 AND status='processing' AND expires_at>now()",
      [scope, requestId, JSON.stringify(responseBody)])).rowCount === 1;
    },
    async unit(ownerId: string, write: boolean) {
      return (await db.query<LabelCustomUnitDto>(`SELECT ${unitProjection}
        FROM soundpub.label_custom_units WHERE owner_user_id = $1 FOR ${write ? 'UPDATE' : 'SHARE'}`,
      [ownerId])).rows[0] ?? null;
    },
    async createUnit(id: string, ownerId: string, code: string, name: string) {
      return (await db.query<LabelCustomUnitDto>(`INSERT INTO soundpub.label_custom_units
        (id, owner_user_id, unit_code, name, status) VALUES ($1,$2,$3,$4,'active')
        ON CONFLICT (owner_user_id) DO NOTHING RETURNING ${unitProjection}`,
      [id, ownerId, code, name])).rows[0] ?? null;
    },
    async updateUnit(id: string, ownerId: string, patch: LabelCustomUnitPatch) {
      return (await db.query<LabelCustomUnitDto>(`UPDATE soundpub.label_custom_units
        SET name=COALESCE($3::text,name), status=COALESCE($4::text,status), updated_at=now()
        WHERE id=$1 AND owner_user_id=$2 RETURNING ${unitProjection}`,
      [id, ownerId, patch.name ?? null, patch.status ?? null])).rows[0] ?? null;
    },
    async listArtists(ownerId: string, unitId: string, query: CustomManagedArtistListQuery,
      after: string | null, limit: number) {
      return (await db.query<CustomManagedArtistDto>(`SELECT ${artistProjection} FROM soundpub.artists
        WHERE ${artistScope} AND ($3::uuid IS NULL OR id > $3)
          AND (($4::text = 'active' AND verified_at IS NOT NULL) OR ($4::text = 'archived' AND verified_at IS NULL))
          AND ($5::text IS NULL OR strpos(lower(name),lower($5)) > 0)
        ORDER BY id LIMIT $6`, [ownerId, unitId, after, query.status ?? 'active', query.search ?? null, limit + 1])).rows;
    },
    async artist(ownerId: string, unitId: string, id: string, write: boolean) {
      return (await db.query<CustomManagedArtistDto>(`SELECT ${artistProjection} FROM soundpub.artists
        WHERE ${artistScope} AND id=$3 FOR ${write ? 'UPDATE' : 'SHARE'}`,
      [ownerId, unitId, id])).rows[0] ?? null;
    },
    async createArtist(id: string, ownerId: string, unitId: string, input: CustomManagedArtistCreate) {
      const artist = (await db.query<CustomManagedArtistDto>(`INSERT INTO soundpub.artists
        (id,label_id,artist_user_id,label_custom_unit_id,management_mode,name,contact_email,contact_phone,verified_at)
        VALUES ($1,$2,NULL,$3,'LABEL_CUSTOM_MANAGED',$4,$5,$6,now()) RETURNING ${artistProjection}`,
      [id, ownerId, unitId, input.name, input.contact_email, input.contact_phone])).rows[0];
      if (!artist) return null;
      await db.query(`INSERT INTO soundpub.artist_profiles(artist_id,user_id,artist_name)
        VALUES ($1,NULL,$2)`, [id, input.name]);
      return artist;
    },
    async updateArtist(ownerId: string, unitId: string, id: string, patch: CustomManagedArtistPatch) {
      const artist = (await db.query<CustomManagedArtistDto>(`UPDATE soundpub.artists
        SET name=COALESCE($4::text,name), contact_email=COALESCE($5::text,contact_email),
          contact_phone=COALESCE($6::text,contact_phone), updated_at=now()
        WHERE ${artistScope} AND id=$3 AND verified_at IS NOT NULL RETURNING ${artistProjection}`,
      [ownerId, unitId, id, patch.name ?? null, patch.contact_email ?? null, patch.contact_phone ?? null])).rows[0] ?? null;
      if (artist && patch.name !== undefined) {
        await db.query(`UPDATE soundpub.artist_profiles SET artist_name=$2,updated_at=now()
          WHERE artist_id=$1 AND user_id IS NULL`, [id, patch.name]);
      }
      return artist;
    },
    async archiveArtist(ownerId: string, unitId: string, id: string) {
      return (await db.query<CustomManagedArtistDto>(`UPDATE soundpub.artists SET verified_at=NULL,updated_at=now()
        WHERE ${artistScope} AND id=$3 AND verified_at IS NOT NULL RETURNING ${artistProjection}`,
      [ownerId, unitId, id])).rows[0] ?? null;
    },
    async audit(actorId: string, resourceType: 'label_custom_unit' | 'artist', resourceId: string,
      requestId: string, action: string, metadata: Record<string, unknown>) {
      await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [actorId, action, resourceType, resourceId, requestId, JSON.stringify(metadata)]);
    },
  };
}
