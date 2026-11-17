import type { PoolClient } from 'pg';
import type { Principal, Role } from '../auth/index.js';
import type { ListQuery, ProfileDto, ProfilePatch, UserCreate } from './contracts.js';

// Explicit projection: provider bindings, provenance and historical references stay private.
const projection = `u.id, u.email, u.account_kind, COALESCE(p.full_name, '') AS full_name,
  p.phone, p.address, p.avatar_url, p.logo_url, p.logo_url_light, p.logo_url_dark,
  p.parent_label_id, lp.full_name AS parent_label_name, p.composer_code,
  COALESCE(p.balance, 0)::numeric(20,2)::text AS balance, u.status,
  (u.email_verified_at IS NOT NULL) AS email_verified, p.password_set,
  p.subscription_status, to_char(p.subscription_upgraded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS subscription_upgraded_at, p.sso_provider,
  p.artist_profile_completed, to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(GREATEST(p.updated_at, u.updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
  ARRAY(SELECT r.role FROM soundpub.user_roles r WHERE r.user_id = u.id
    AND r.tenant_id IS NULL AND r.verified_at IS NOT NULL ORDER BY r.role) AS roles`;
const joins = `FROM soundpub.backend_users u LEFT JOIN soundpub.profiles p ON p.id = u.id
  LEFT JOIN soundpub.profiles lp ON lp.id = p.parent_label_id`;
export type UserDto = ProfileDto & { roles: Role[] };

export function usersRepository(db: PoolClient) {
  return {
    async lock(ids: string[], write: boolean): Promise<Map<string, Principal>> {
      const users = await db.query<{ id: string; status: Principal['status'] }>(
        `SELECT id, status FROM soundpub.backend_users WHERE id = ANY($1::uuid[])
         ORDER BY id FOR ${write ? 'UPDATE' : 'SHARE'}`, [ids]);
      await db.query(`SELECT pg_advisory_xact_lock(hashtextextended(id::text, 0))
        FROM unnest($1::uuid[]) AS ids(id) ORDER BY id`, [[...new Set(ids)].sort()]);
      const roles = await db.query<{ user_id: string; role: Role }>(`SELECT user_id, role
        FROM soundpub.user_roles WHERE user_id = ANY($1::uuid[]) AND tenant_id IS NULL
        AND verified_at IS NOT NULL ORDER BY role`, [ids]);
      return new Map(users.rows.map(user => [user.id,
        { ...user, roles: roles.rows.filter(role => role.user_id === user.id).map(role => role.role) }]));
    },
    async find(id: string): Promise<UserDto | null> {
      return (await db.query<UserDto>(`SELECT ${projection} ${joins} WHERE u.id = $1`, [id])).rows[0] ?? null;
    },
    async list(query: ListQuery, cursor: { createdAt: string; id: string } | null, limit: number) {
      return (await db.query<UserDto>(`SELECT ${projection} ${joins}
        WHERE ($1::text IS NULL OR u.status = $1)
          AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM soundpub.user_roles r
            WHERE r.user_id = u.id AND r.role = $2 AND r.tenant_id IS NULL AND r.verified_at IS NOT NULL))
          AND ($3::text IS NULL OR strpos(lower(COALESCE(u.email, '') || ' ' || COALESCE(p.full_name, '')), lower($3)) > 0)
          AND ($4::timestamptz IS NULL OR (u.created_at, u.id) < ($4::timestamptz, $5::uuid))
        ORDER BY u.created_at DESC, u.id DESC LIMIT $6`,
      [query.status ?? null, query.role ?? null, query.search ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1])).rows;
    },
    async ensureProfile(id: string) {
      await db.query('INSERT INTO soundpub.profiles(id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [id]);
    },
    async createAccount(id: string, input: UserCreate, passwordHash: string) {
      await db.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
      await db.query('UPDATE soundpub.backend_users SET email=$2,updated_at=now() WHERE id=$1', [id, input.email]);
      await db.query(`INSERT INTO soundpub.profiles(id,full_name,phone,parent_label_id,password_set)
        VALUES ($1,$2,$3,$4,true)`, [id, input.fullName, input.phone ?? null, input.parentLabelId ?? null]);
      await db.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id, input.role]);
      await db.query(`INSERT INTO soundpub.local_auth_credentials(user_id,login_email,password_hash)
        VALUES ($1,$2,$3)`, [id, input.email, passwordHash]);
      if (input.role === 'artist') {
        await db.query('INSERT INTO soundpub.artist_profiles(user_id,artist_name) VALUES ($1,$2)', [id, input.fullName]);
        await db.query(`INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at)
          VALUES ($1,$2,$3,now())`, [input.parentLabelId, id, input.fullName]);
      }
    },
    async createWhitelabelArtist(id: string, labelId: string,
      input: { email: string; fullName: string; phone?: string | null }) {
      await db.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
      await db.query('UPDATE soundpub.backend_users SET email=lower($2),updated_at=now() WHERE id=$1', [id,input.email]);
      await db.query(`INSERT INTO soundpub.profiles(id,full_name,phone,parent_label_id,password_set)
        VALUES ($1,$2,$3,$4,false)`, [id, input.fullName, input.phone ?? null, labelId]);
      await db.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'artist',now())", [id]);
      await db.query('INSERT INTO soundpub.artist_profiles(user_id,artist_name) VALUES ($1,$2)', [id, input.fullName]);
      await db.query(`INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at)
        VALUES ($1,$2,$3,now())`, [labelId, id, input.fullName]);
    },
    async updateProfile(id: string, patch: ProfilePatch) {
      // Keys come only from validated profilePatch; values always use bound parameters.
      const entries = Object.entries(patch);
      await db.query(`UPDATE soundpub.profiles SET ${entries.map(([key], i) => `${key} = $${i + 2}`).join(', ')},
        updated_at = now() WHERE id = $1`, [id, ...entries.map(([, value]) => value)]);
    },
    async allRoles(id: string) {
      return (await db.query<{ role: Role }>(`SELECT role FROM soundpub.user_roles
        WHERE user_id = $1 AND tenant_id IS NULL ORDER BY role`, [id])).rows.map(row => row.role);
    },
    async hasRoleDependencies(id: string, roles: Role[]): Promise<boolean> {
      return (await db.query<{ blocked: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM soundpub.profiles WHERE id = $1
          AND (parent_label_id IS NOT NULL OR parent_label_reference_id IS NOT NULL)
          AND NOT ('artist' = ANY($2::text[]))
        UNION ALL
        SELECT 1 FROM soundpub.profiles WHERE parent_label_id = $1
          AND NOT ($2::text[] && ARRAY['label', 'whitelabel']::text[])
        UNION ALL
        SELECT 1 FROM soundpub.artist_profiles WHERE user_id = $1
          AND NOT ('artist' = ANY($2::text[]))
        UNION ALL
        SELECT 1 FROM soundpub.artists WHERE artist_user_id = $1
          AND NOT ('artist' = ANY($2::text[]))
        UNION ALL
        SELECT 1 FROM soundpub.artists WHERE label_id = $1
          AND artist_user_id IS NOT NULL
          AND NOT ($2::text[] && ARRAY['label', 'whitelabel']::text[])
        UNION ALL
        SELECT 1 FROM soundpub.label_custom_units WHERE owner_user_id = $1
          AND NOT ('label_custom' = ANY($2::text[]))
      ) AS blocked`, [id, roles])).rows[0]!.blocked;
    },
    async setRoles(id: string, roles: Role[]) {
      await db.query('DELETE FROM soundpub.user_roles WHERE user_id = $1 AND tenant_id IS NULL', [id]);
      await db.query(`INSERT INTO soundpub.user_roles(user_id, role, verified_at)
        SELECT $1, role, now() FROM unnest($2::text[]) AS roles(role)`, [id, roles]);
    },
    async promoteToArtist(id: string, parentLabelId: string) {
      const profile = (await db.query<{ full_name: string }>(`UPDATE soundpub.profiles
        SET parent_label_id=$2,artist_profile_completed=false,updated_at=now()
        WHERE id=$1 AND parent_label_id IS NULL RETURNING full_name`, [id, parentLabelId])).rows[0];
      if (!profile) return false;
      await db.query(`INSERT INTO soundpub.artist_profiles(user_id,artist_name)
        VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING`, [id, profile.full_name]);
      await db.query(`INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at)
        VALUES ($1,$2,$3,now())`, [parentLabelId, id, profile.full_name]);
      return true;
    },
    async deleteAccount(id: string) {
      await db.query(`UPDATE soundpub.auth_sessions SET revoked_at=now()
        WHERE user_id=$1 AND revoked_at IS NULL`, [id]);
      await db.query(`UPDATE soundpub.auth_impersonations SET ended_at=now(),ended_reason='invalidated'
        WHERE ended_at IS NULL AND (actor_user_id=$1 OR target_user_id=$1)`, [id]);
      await db.query('DELETE FROM soundpub.external_identities WHERE application_user_id=$1', [id]);
      await db.query('DELETE FROM soundpub.user_roles WHERE user_id=$1', [id]);
      await db.query('DELETE FROM soundpub.profiles WHERE id=$1', [id]);
      await db.query('DELETE FROM soundpub.backend_users WHERE id=$1', [id]);
    },
    async setComposerCode(id: string, composerCode: string | null) {
      await db.query('UPDATE soundpub.profiles SET composer_code=$2,updated_at=now() WHERE id=$1', [id, composerCode]);
    },
    async setStatus(id: string, status: Principal['status']) {
      await db.query('UPDATE soundpub.backend_users SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
    },
    async audit(actorId: string, id: string, requestId: string, action: string, metadata: unknown) {
      await db.query(`INSERT INTO soundpub.audit_logs(actor_user_id, action, resource_type, resource_id, request_id, metadata)
        VALUES ($1, $2, 'backend_user', $3, $4, $5::jsonb)`, [actorId, action, id, requestId, JSON.stringify(metadata)]);
    },
    async suspensionNotification(id: string, reason: string, requestId: string) {
      await db.query(`INSERT INTO soundpub.outbox_events(topic,payload,idempotency_key)
        VALUES ('audit.notification',$1::jsonb,$2) ON CONFLICT (idempotency_key) DO NOTHING`,
      [JSON.stringify({ userId: id, reason }), `suspend:${requestId}`]);
    },
  };
}

