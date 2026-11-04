import type { PoolClient } from 'pg';
import type { ArtistDto, ArtistListQuery, ArtistPatch, ArtistDeletionRequestDto } from './contracts.js';

const projection = `u.id, ap.id AS profile_id, roster.id AS catalog_artist_id, roster.label_id AS label_user_id,
  p.full_name, p.phone, p.address, u.status, COALESCE(ap.artist_name, p.full_name) AS artist_name,
  COALESCE(ap.artist_type, 'solo') AS artist_type, ap.bio, ap.genre, ap.legal_name, ap.country,
  ap.city, ap.language, ap.gender, to_char(ap.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
  ap.profile_image_url, COALESCE(ap.social_links, '{}'::jsonb) AS social_links,
  COALESCE(ap.verified, false) AS verified,
  to_char(ap.verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS verified_at,
  COALESCE(p.artist_profile_completed, false) AS artist_profile_completed,
  to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(GREATEST(u.updated_at, p.updated_at, ap.updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;
const joins = `FROM soundpub.backend_users u JOIN soundpub.profiles p ON p.id = u.id
  LEFT JOIN soundpub.artist_profiles ap ON ap.user_id = u.id
  LEFT JOIN soundpub.artists roster ON roster.artist_user_id = u.id
    AND roster.label_id = p.parent_label_id AND roster.verified_at IS NOT NULL`;
const isArtist = `EXISTS (SELECT 1 FROM soundpub.user_roles r WHERE r.user_id = u.id
  AND r.role = 'artist' AND r.tenant_id IS NULL AND r.verified_at IS NOT NULL)`;
const requestProjection = `id, artist_id, label_id, reason, status,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;

export function artistsRepository(db: PoolClient) {
  return {
    async find(id: string) {
      return (await db.query<ArtistDto>(`SELECT ${projection} ${joins} WHERE u.id = $1 AND ${isArtist}`, [id])).rows[0] ?? null;
    },
    async lockRoster(id: string) {
      await db.query('SELECT id FROM soundpub.artists WHERE artist_user_id = $1 FOR UPDATE', [id]);
    },
    async list(actorId: string, admin: boolean, label: boolean, query: ArtistListQuery, cursorId: string | null, limit: number) {
      return (await db.query<ArtistDto>(`SELECT ${projection} ${joins} WHERE ${isArtist}
        AND ($2::boolean OR u.id = $1 OR ($3::boolean AND roster.label_id = $1
          AND NOT EXISTS (SELECT 1 FROM soundpub.user_roles privileged WHERE privileged.user_id=u.id
            AND privileged.tenant_id IS NULL AND privileged.role IN ('admin','superadmin'))))
        AND ($4::text IS NULL OR strpos(lower(COALESCE(ap.artist_name, p.full_name)), lower($4)) > 0)
        AND ($5::text IS NULL OR u.status = $5) AND ($6::uuid IS NULL OR u.id > $6)
        ORDER BY u.id LIMIT $7`, [actorId, admin, label, query.search ?? null, query.status ?? null, cursorId, limit + 1])).rows;
    },
    async createUser(id: string, labelId: string | null, input: ArtistPatch & { artist_name: string }) {
      await db.query("INSERT INTO soundpub.backend_users(id, status) VALUES ($1, 'active')", [id]);
      await db.query(`INSERT INTO soundpub.profiles(id, full_name, phone, address, parent_label_id)
        VALUES ($1,$2,$3,$4,$5)`, [id, input.full_name ?? input.artist_name, input.phone ?? null, input.address ?? null, labelId]);
      await db.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'artist',now())", [id]);
      if (labelId) await db.query(`INSERT INTO soundpub.artists(label_id, artist_user_id, name, verified_at)
        VALUES ($1,$2,$3,now())`, [labelId, id, input.artist_name]);
    },
    async update(id: string, patch: ArtistPatch) {
      const { full_name, phone, address, ...metadata } = patch;
      // Keys originate in strict Zod contracts; all values remain bound parameters.
      const entries = Object.entries(metadata).map(([key, value]) => [key, key === 'social_links' ? value ?? {} : value] as const);
      await db.query(`INSERT INTO soundpub.artist_profiles(user_id, artist_name)
        SELECT id, full_name FROM soundpub.profiles WHERE id=$1 ON CONFLICT (user_id) DO NOTHING`, [id]);
      if (entries.length) await db.query(`UPDATE soundpub.artist_profiles SET
        ${entries.map(([key], i) => `${key}=$${i + 2}`).join(',')}, updated_at=now() WHERE user_id=$1`,
      [id, ...entries.map(([key, value]) => key === 'social_links' ? JSON.stringify(value) : value)]);
      const contacts = Object.entries({ full_name, phone, address }).filter(([, value]) => value !== undefined);
      if (contacts.length) await db.query(`UPDATE soundpub.profiles SET
        ${contacts.map(([key], i) => `${key}=$${i + 2}`).join(',')}, updated_at=now() WHERE id=$1`, [id, ...contacts.map(([, value]) => value)]);
      if (patch.artist_name !== undefined) await db.query(`UPDATE soundpub.artists SET name=$2, updated_at=now()
        WHERE artist_user_id=$1`, [id, patch.artist_name]);
      await db.query(`UPDATE soundpub.profiles p SET artist_profile_completed = EXISTS (
        SELECT 1 FROM soundpub.artist_profiles ap WHERE ap.user_id=p.id
          AND NULLIF(btrim(ap.artist_name),'') IS NOT NULL AND NULLIF(btrim(ap.artist_type),'') IS NOT NULL
          AND NULLIF(btrim(ap.genre),'') IS NOT NULL AND NULLIF(btrim(ap.country),'') IS NOT NULL
          AND NULLIF(btrim(p.phone),'') IS NOT NULL), updated_at=now() WHERE p.id=$1`, [id]);
    },
    async detach(id: string, labelId: string) {
      await db.query('DELETE FROM soundpub.artists WHERE artist_user_id=$1 AND label_id=$2', [id, labelId]);
      const result = await db.query(`UPDATE soundpub.profiles SET parent_label_id=NULL, updated_at=now()
        WHERE id=$1 AND parent_label_id=$2`, [id, labelId]);
      return result.rowCount === 1;
    },
    async requestDeletion(id: string, labelId: string, reason: string) {
      return (await db.query<ArtistDeletionRequestDto>(`INSERT INTO soundpub.artist_deletion_requests(artist_id,label_id,reason)
        VALUES ($1,$2,$3) ON CONFLICT (artist_id) WHERE status='pending' DO NOTHING RETURNING ${requestProjection}`,
      [id, labelId, reason])).rows[0] ?? null;
    },
    async deletionRequests(actorId: string, admin: boolean, cursorId: string | null, limit: number) {
      return (await db.query<ArtistDeletionRequestDto>(`SELECT ${requestProjection} FROM soundpub.artist_deletion_requests
        WHERE ($2::boolean OR label_id=$1) AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4`,
      [actorId, admin, cursorId, limit + 1])).rows;
    },
    async deletionRequest(id: string, lock = false) {
      return (await db.query<ArtistDeletionRequestDto>(`SELECT ${requestProjection} FROM soundpub.artist_deletion_requests
        WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0] ?? null;
    },
    async reviewDeletion(id: string, status: 'approved' | 'rejected') {
      return (await db.query<ArtistDeletionRequestDto>(`UPDATE soundpub.artist_deletion_requests SET status=$2, updated_at=now()
        WHERE id=$1 AND status='pending' RETURNING ${requestProjection}`, [id, status])).rows[0] ?? null;
    },
  };
}
