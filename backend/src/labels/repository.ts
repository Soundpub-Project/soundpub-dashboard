import type { PoolClient } from 'pg';
import type { LabelDto, RosterItem, RosterQuery } from './contracts.js';

export function labelsRepository(db: PoolClient) {
  return {
    async labels(actorId: string, admin: boolean, query: RosterQuery, after: string | null, limit: number, id: string | null = null) {
      return (await db.query<LabelDto>(`SELECT p.id, p.id AS "ownerId", p.full_name,
        p.logo_url, p.logo_url_light, p.logo_url_dark, u.status,
        ARRAY(SELECT r.role FROM soundpub.user_roles r WHERE r.user_id = p.id AND r.role IN ('label', 'whitelabel')
          AND r.tenant_id IS NULL AND r.verified_at IS NOT NULL ORDER BY r.role) AS roles
        FROM soundpub.profiles p JOIN soundpub.backend_users u ON u.id = p.id
        WHERE ($2::boolean OR p.id = $1 OR EXISTS (
          SELECT 1 FROM soundpub.artists a JOIN soundpub.profiles ap ON ap.id = a.artist_user_id
          WHERE a.artist_user_id = $1 AND a.label_id = p.id AND ap.parent_label_id = p.id AND a.verified_at IS NOT NULL
            AND EXISTS (SELECT 1 FROM soundpub.user_roles ar WHERE ar.user_id = $1 AND ar.role = 'artist'
              AND ar.tenant_id IS NULL AND ar.verified_at IS NOT NULL)))
          AND EXISTS (SELECT 1 FROM soundpub.user_roles r WHERE r.user_id = p.id AND r.role IN ('label', 'whitelabel')
            AND r.tenant_id IS NULL AND r.verified_at IS NOT NULL)
          AND ($3::uuid IS NULL OR p.id > $3) AND ($4::text IS NULL OR u.status = $4)
          AND ($5::text IS NULL OR strpos(lower(p.full_name), lower($5)) > 0)
          AND ($6::uuid IS NULL OR p.id = $6)
        ORDER BY p.id LIMIT $7`, [actorId, admin, after, query.status ?? null, query.search ?? null, id, limit + 1])).rows;
    },
    async artist(id: string, write: boolean) {
      return (await db.query<{
        id: string; full_name: string; artist_name: string; parent_label_id: string | null; parent_label_reference_id: string | null;
      }>(`SELECT id, full_name, parent_label_id, parent_label_reference_id,
        COALESCE((SELECT artist_name FROM soundpub.artist_profiles WHERE user_id = soundpub.profiles.id), full_name) AS artist_name
        FROM soundpub.profiles
        WHERE id = $1 FOR ${write ? 'UPDATE' : 'SHARE'}`, [id])).rows[0] ?? null;
    },
    async membership(artistId: string) {
      return (await db.query<{ id: string; label_id: string; verified_at: Date | null }>(
        'SELECT id, label_id, verified_at FROM soundpub.artists WHERE artist_user_id = $1', [artistId])).rows[0] ?? null;
    },
    async roster(labelId: string, query: RosterQuery, after: string | null, limit: number) {
      return (await db.query<RosterItem>(`SELECT a.id AS "membershipId", p.id AS "artistId",
        a.label_id AS "labelId", a.name, p.full_name AS "fullName", u.status
        FROM soundpub.artists a JOIN soundpub.profiles p ON p.id = a.artist_user_id AND p.parent_label_id = a.label_id
        JOIN soundpub.backend_users u ON u.id = p.id
        WHERE a.label_id = $1 AND a.verified_at IS NOT NULL AND ($2::uuid IS NULL OR a.id > $2)
          AND ($3::text IS NULL OR u.status = $3)
          AND ($4::text IS NULL OR strpos(lower(a.name || ' ' || p.full_name), lower($4)) > 0)
          AND EXISTS (SELECT 1 FROM soundpub.user_roles r WHERE r.user_id = p.id
            AND r.role = 'artist' AND r.tenant_id IS NULL AND r.verified_at IS NOT NULL)
        ORDER BY a.id LIMIT $5`, [labelId, after, query.status ?? null, query.search ?? null, limit + 1])).rows;
    },
    async setParent(artistId: string, labelId: string | null, expected: string | null) {
      const result = await db.query(`UPDATE soundpub.profiles SET parent_label_id = $2, updated_at = now()
        WHERE id = $1 AND parent_label_id IS NOT DISTINCT FROM $3::uuid AND parent_label_reference_id IS NULL`,
      [artistId, labelId, expected]);
      return result.rowCount === 1;
    },
    async assign(artistId: string, labelId: string, name: string) {
      return (await db.query<{ id: string }>(`INSERT INTO soundpub.artists(artist_user_id, label_id, name, verified_at)
        VALUES ($1, $2, $3, now()) RETURNING id`, [artistId, labelId, name])).rows[0]!.id;
    },
    async move(membershipId: string, labelId: string) {
      await db.query('UPDATE soundpub.artists SET label_id = $2, updated_at = now() WHERE id = $1', [membershipId, labelId]);
    },
    async remove(membershipId: string) {
      await db.query('DELETE FROM soundpub.artists WHERE id = $1', [membershipId]);
    },
  };
}
