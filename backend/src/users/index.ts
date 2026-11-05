import type { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal, type Role } from '../auth/index.js';
import { withTransaction } from '../db/pool.js';
import { hashPassword } from '../auth/local-crypto.js';
import { composerCodePut, listQuery, passwordReset, profilePatch, rolesPut, statusPatch, userCreate,
  whitelabelArtistCreate, type ComposerCodePut, type ListQuery, type PasswordReset, type ProfilePatch,
  type RolesPut, type UserCreate, type WhitelabelArtistCreate } from './contracts.js';
import { usersRepository } from './repository.js';

const allows = createAuthorizer();
const cursorSchema = z.strictObject({ createdAt: z.iso.datetime().refine(value => !value.startsWith('0000-')), id: z.uuid(), filter: z.string() });
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'BAD_REQUEST');
  return result.data;
}
function requirePolicy(actor: Principal | undefined, policy: 'authenticated' | 'admin') {
  if (!allows(actor ?? null, policy)) throw new ApiError(403, 'FORBIDDEN');
}
function requireWhitelabel(actor: Principal | undefined): asserts actor is Principal {
  if (!allows(actor ?? null, 'authenticated') || !actor?.roles.includes('whitelabel')) throw new ApiError(403, 'FORBIDDEN');
}
export function canManageUser(actor: Principal, targetId: string, targetRoles: readonly Role[], nextRoles: readonly Role[] = []) {
  const protectedRoles = actor.roles.includes('superadmin') ? [] : ['admin', 'superadmin'];
  return allows(actor, 'admin') && actor.id !== targetId &&
    ![...targetRoles, ...nextRoles].some(role => protectedRoles.includes(role));
}
export function canCreateUser(actor: Principal, input: Pick<UserCreate, 'role' | 'parentLabelId'>) {
  if (!allows(actor, 'authenticated')) return false;
  if (allows(actor, 'admin')) return canManageUser(actor, 'new-user', [], [input.role]);
  return actor.roles.some(role => role === 'label' || role === 'whitelabel')
    && input.role === 'artist' && input.parentLabelId === actor.id;
}

export function createUsersService(pool: Pool) {
  return {
    async profile(actor: Principal) {
      return withTransaction(pool, async db => {
        const repo = usersRepository(db);
        requirePolicy((await repo.lock([actor.id], false)).get(actor.id), 'authenticated');
        const user = await repo.find(actor.id);
        if (!user) throw new ApiError(404, 'NOT_FOUND');
        const { roles, ...profile } = user;
        return { profile, roles };
      });
    },
    async updateProfile(actor: Principal, input: ProfilePatch, requestId: string) {
      const patch = parse(profilePatch, input);
      return withTransaction(pool, async db => {
        const repo = usersRepository(db);
        requirePolicy((await repo.lock([actor.id], true)).get(actor.id), 'authenticated');
        await repo.ensureProfile(actor.id);
        await repo.updateProfile(actor.id, patch);
        await repo.audit(actor.id, actor.id, requestId, 'profile.updated', { fields: Object.keys(patch) });
        const { roles, ...profile } = (await repo.find(actor.id))!;
        return { profile, roles };
      });
    },
    async list(actor: Principal, input: ListQuery) {
      requirePolicy(actor, 'admin');
      const query = parse(listQuery, input);
      const filter = createHash('sha256').update(JSON.stringify([
        query.status ?? null, query.role ?? null, query.search ?? null,
      ])).digest('base64url');
      let cursor: z.infer<typeof cursorSchema> | null = null;
      if (query.cursor) {
        try {
          if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error('Invalid cursor');
          cursor = parse(cursorSchema, JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')));
          if (cursor.filter !== filter) throw new Error('Invalid cursor');
        } catch { throw new ApiError(400, 'BAD_REQUEST'); }
      }
      const limit = Number(query.limit ?? 50);
      return withTransaction(pool, async db => {
        const repo = usersRepository(db);
        requirePolicy((await repo.lock([actor.id], false)).get(actor.id), 'admin');
        const rows = await repo.list(query, cursor, limit);
        const items = rows.slice(0, limit);
        const last = items.at(-1);
        return { items, nextCursor: rows.length > limit && last
          ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id, filter })).toString('base64url') : null };
      });
    },
    async create(actor: Principal, input: UserCreate, requestId: string) {
      requirePolicy(actor, 'authenticated');
      if (!allows(actor, 'admin') && !actor.roles.some(role => role === 'label' || role === 'whitelabel')) throw new ApiError(403, 'FORBIDDEN');
      const value = parse(userCreate, input);
      const id = randomUUID();
      const passwordHash = await hashPassword(value.password);
      try {
        return await withTransaction(pool, async db => {
          const repo = usersRepository(db);
          const principalIds = [...new Set([actor.id, ...(value.parentLabelId ? [value.parentLabelId] : [])])];
          const principals = await repo.lock(principalIds, true);
          const current = principals.get(actor.id);
          if (!current || !canCreateUser(current, value)) throw new ApiError(403, 'FORBIDDEN');
          if (value.role === 'artist') {
            const parent = value.parentLabelId ? principals.get(value.parentLabelId) : undefined;
            if (!parent || !allows(parent, 'authenticated') ||
                !parent.roles.some(role => role === 'label' || role === 'whitelabel')) throw new ApiError(400, 'BAD_REQUEST');
          } else if (value.parentLabelId != null) throw new ApiError(400, 'BAD_REQUEST');
          const duplicate = await db.query(`SELECT 1 FROM soundpub.backend_users WHERE lower(email)=lower($1)
            UNION ALL SELECT 1 FROM soundpub.local_auth_credentials WHERE lower(login_email)=lower($1) LIMIT 1`, [value.email]);
          if (duplicate.rowCount) throw new ApiError(409, 'CONFLICT');
          await repo.createAccount(id, value, passwordHash);
          await repo.audit(current!.id, id, requestId, 'user.created', {
            role: value.role, parentLabelId: value.parentLabelId ?? null,
          });
          return (await repo.find(id))!;
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'CONFLICT');
        throw error;
      }
    },
    async whitelabelDashboard(actor: Principal) {
      return withTransaction(pool, async db => {
        const repo = usersRepository(db);
        const current = (await repo.lock([actor.id], false)).get(actor.id);
        requireWhitelabel(current);
        const row = (await db.query<{
          subscription_status: string | null; total_artists: number; total_releases: number;
          total_revenue: string; artists_with_access: number; artists_without_access: number;
        }>(`SELECT p.subscription_status,
          (SELECT count(*)::int FROM soundpub.artists a
            JOIN soundpub.profiles artist_profile ON artist_profile.id=a.artist_user_id AND artist_profile.parent_label_id=a.label_id
            JOIN soundpub.backend_users artist_user ON artist_user.id=a.artist_user_id AND artist_user.status='active'
            WHERE a.label_id=$1 AND a.verified_at IS NOT NULL
              AND EXISTS (SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=a.artist_user_id
                AND role.role='artist' AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL)) AS total_artists,
          (SELECT count(*)::int FROM soundpub.releases release WHERE release.label_id=$1) AS total_releases,
          (SELECT COALESCE(sum(CASE WHEN correction.id IS NULL THEN entry.net_amount ELSE 0 END),0)::numeric(24,2)::text
            FROM soundpub.royalty_import_entries entry
            LEFT JOIN soundpub.royalty_import_corrections correction ON correction.batch_id=entry.batch_id
            WHERE entry.label_owner_user_id=$1) AS total_revenue,
          (SELECT count(*)::int FROM soundpub.artists a JOIN soundpub.profiles artist_profile
            ON artist_profile.id=a.artist_user_id AND artist_profile.parent_label_id=a.label_id
            JOIN soundpub.backend_users artist_user ON artist_user.id=a.artist_user_id AND artist_user.status='active'
            WHERE a.label_id=$1 AND a.verified_at IS NOT NULL AND artist_profile.password_set=true
              AND EXISTS (SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=a.artist_user_id
                AND role.role='artist' AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL)
              AND EXISTS (SELECT 1 FROM soundpub.local_auth_credentials credential WHERE credential.user_id=a.artist_user_id)) AS artists_with_access,
          (SELECT count(*)::int FROM soundpub.artists a JOIN soundpub.profiles artist_profile
            ON artist_profile.id=a.artist_user_id AND artist_profile.parent_label_id=a.label_id
            JOIN soundpub.backend_users artist_user ON artist_user.id=a.artist_user_id AND artist_user.status='active'
            WHERE a.label_id=$1 AND a.verified_at IS NOT NULL
              AND EXISTS (SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=a.artist_user_id
                AND role.role='artist' AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL)
              AND NOT (artist_profile.password_set=true
              AND EXISTS (SELECT 1 FROM soundpub.local_auth_credentials credential WHERE credential.user_id=a.artist_user_id))) AS artists_without_access
          FROM soundpub.profiles p WHERE p.id=$1`, [current.id])).rows[0];
        if (!row) throw new ApiError(404, 'NOT_FOUND');
        return { label_id: current.id, currency: 'IDR' as const, ...row };
      });
    },
    async createWhitelabelArtist(actor: Principal, input: WhitelabelArtistCreate, requestId: string) {
      const value = parse(whitelabelArtistCreate, input);
      const id = randomUUID();
      try {
        return await withTransaction(pool, async db => {
          const repo = usersRepository(db);
          const current = (await repo.lock([actor.id], true)).get(actor.id);
          requireWhitelabel(current);
          if ((await db.query(`SELECT 1 FROM soundpub.backend_users WHERE lower(email)=lower($1)
            UNION ALL SELECT 1 FROM soundpub.local_auth_credentials WHERE lower(login_email)=lower($1) LIMIT 1`, [value.email])).rowCount) {
            throw new ApiError(409, 'CONFLICT');
          }
          await repo.createWhitelabelArtist(id, current.id, { ...value, phone: value.phone ?? null });
          await repo.audit(current.id, id, requestId, 'whitelabel.artist_created', { parentLabelId: current.id, loginEnabled: false });
          return (await repo.find(id))!;
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'CONFLICT');
        throw error;
      }
    },
    async setWhitelabelArtistPassword(actor: Principal, id: string, input: PasswordReset, requestId: string) {
      requireWhitelabel(actor);
      parse(z.uuid(), id);
      const value = parse(passwordReset, input);
      const passwordHash = await hashPassword(value.newPassword);
      return withTransaction(pool, async db => {
        const repo = usersRepository(db);
        const principals = await repo.lock([actor.id, id], true);
        const current = principals.get(actor.id);
        requireWhitelabel(current);
        const target = principals.get(id);
        if (!target) throw new ApiError(404, 'NOT_FOUND');
        const ownership = (await db.query<{ email: string | null; subscription_status: string | null; password_set: boolean | null }>(`SELECT artist.email,pic.subscription_status,profile.password_set
          FROM soundpub.backend_users artist JOIN soundpub.profiles profile ON profile.id=artist.id
          JOIN soundpub.artists membership ON membership.artist_user_id=artist.id AND membership.label_id=$1
            AND membership.verified_at IS NOT NULL
          JOIN soundpub.profiles pic ON pic.id=$1
          WHERE artist.id=$2 AND profile.parent_label_id=$1
            AND EXISTS (SELECT 1 FROM soundpub.user_roles role WHERE role.user_id=artist.id
              AND role.role='artist' AND role.tenant_id IS NULL AND role.verified_at IS NOT NULL)`, [current.id,id])).rows[0];
        if (!ownership) throw new ApiError(404, 'NOT_FOUND');
        if (ownership.subscription_status !== 'active') throw new ApiError(409, 'WHITELABEL_SUBSCRIPTION_REQUIRED');
        if (!ownership.email || ownership.password_set === true || (await db.query(
          'SELECT 1 FROM soundpub.local_auth_credentials WHERE user_id=$1', [id])).rowCount) throw new ApiError(409, 'CONFLICT');
        if ((await db.query('SELECT 1 FROM soundpub.local_auth_credentials WHERE lower(login_email)=lower($1) AND user_id<>$2',
          [ownership.email,id])).rowCount) throw new ApiError(409, 'CONFLICT');
        await db.query(`INSERT INTO soundpub.local_auth_credentials(user_id,login_email,password_hash)
          VALUES ($1,lower($2),$3)`, [id,ownership.email,passwordHash]);
        await db.query('UPDATE soundpub.profiles SET password_set=true,updated_at=now() WHERE id=$1', [id]);
        await repo.audit(current.id, id, requestId, 'whitelabel.artist_login_enabled', {});
        return { status: 'ok' as const };
      });
    },
    async setStatus(actor: Principal, id: string, input: { status: Principal['status'] }, requestId: string, reason?: string) {
      requirePolicy(actor, 'admin');
      parse(z.uuid(), id);
      const { status } = parse(statusPatch, input);
      if (reason !== undefined) parse(z.string().trim().min(1).max(500), reason);
      return withTransaction(pool, async db => {
        const repo = usersRepository(db);
        const principals = await repo.lock([actor.id, id], true);
        const current = principals.get(actor.id);
        requirePolicy(current, 'admin');
        const target = principals.get(id);
        if (!target) throw new ApiError(404, 'NOT_FOUND');
        if (!canManageUser(current!, id, await repo.allRoles(id))) throw new ApiError(403, 'FORBIDDEN');
        await repo.setStatus(id, status);
        await repo.audit(actor.id, id, requestId, status === 'suspended' ? 'user.suspended' : 'user.status_changed',
          { previousStatus: target.status, status, ...(reason === undefined ? {} : { reason }) });
        if (reason !== undefined && status === 'suspended') await repo.suspensionNotification(id, reason, requestId);
        return { status };
      });
    },
    async resetPassword(actor: Principal, id: string, input: PasswordReset, requestId: string) {
      requirePolicy(actor, 'admin');
      parse(z.uuid(), id);
      const value = parse(passwordReset, input);
      const passwordHash = await hashPassword(value.newPassword);
      return withTransaction(pool, async db => {
        const repo = usersRepository(db);
        const principals = await repo.lock([actor.id, id], true);
        const current = principals.get(actor.id);
        requirePolicy(current, 'admin');
        const target = principals.get(id);
        if (!target) throw new ApiError(404, 'NOT_FOUND');
        if (!canManageUser(current!, id, await repo.allRoles(id))) throw new ApiError(403, 'FORBIDDEN');
        const user = await repo.find(id);
        if (!user?.email) throw new ApiError(409, 'CONFLICT');
        const duplicate = await db.query('SELECT 1 FROM soundpub.local_auth_credentials WHERE lower(login_email)=lower($1) AND user_id<>$2',
          [user.email, id]);
        if (duplicate.rowCount) throw new ApiError(409, 'CONFLICT');
        await db.query(`INSERT INTO soundpub.local_auth_credentials(user_id,login_email,password_hash)
          VALUES ($1,lower($2),$3) ON CONFLICT (user_id) DO UPDATE SET login_email=excluded.login_email,
          password_hash=excluded.password_hash,password_changed_at=now(),failed_attempts=0,locked_until=NULL,
          requires_password_reset=false,updated_at=now()`, [id, user.email, passwordHash]);
        await db.query('UPDATE soundpub.auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
        await repo.audit(actor.id, id, requestId, 'auth.password_reset', {});
        return { status: 'ok' as const };
      });
    },
    async deleteUser(actor: Principal, id: string, requestId: string) {
      requirePolicy(actor, 'admin');
      parse(z.uuid(), id);
      try {
        return await withTransaction(pool, async db => {
          const repo = usersRepository(db);
          const principals = await repo.lock([actor.id, id], true);
          const current = principals.get(actor.id);
          requirePolicy(current, 'admin');
          if (!current!.roles.includes('superadmin')) throw new ApiError(403, 'FORBIDDEN');
          const target = principals.get(id);
          if (!target) throw new ApiError(404, 'NOT_FOUND');
          const targetRoles = await repo.allRoles(id);
          if (id === current!.id) throw new ApiError(403, 'FORBIDDEN');
          if (target.status !== 'inactive') throw new ApiError(409, 'CONFLICT');
          await repo.audit(current!.id, id, requestId, 'user.deleted', { roles: targetRoles });
          await repo.deleteAccount(id);
          return { deleted: true as const };
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23503') throw new ApiError(409, 'CONFLICT');
        throw error;
      }
    },
    async setComposerCode(actor: Principal, id: string, input: ComposerCodePut, requestId: string) {
      requirePolicy(actor, 'admin');
      parse(z.uuid(), id);
      const value = parse(composerCodePut, input);
      try {
        return await withTransaction(pool, async db => {
          const repo = usersRepository(db);
          const principals = await repo.lock([actor.id, id], true);
          const current = principals.get(actor.id);
          requirePolicy(current, 'admin');
          const target = principals.get(id);
          if (!target) throw new ApiError(404, 'NOT_FOUND');
          const targetRoles = await repo.allRoles(id);
          if (!canManageUser(current!, id, targetRoles)) throw new ApiError(403, 'FORBIDDEN');
          if (!targetRoles.includes('copyright')) throw new ApiError(409, 'CONFLICT');
          await repo.ensureProfile(id);
          await repo.setComposerCode(id, value.composerCode);
          await repo.audit(current!.id, id, requestId, 'user.composer_code_changed', { cleared: value.composerCode === null });
          return { composerCode: value.composerCode };
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'CONFLICT');
        throw error;
      }
    },
    async setRoles(actor: Principal, id: string, input: RolesPut, requestId: string) {
      requirePolicy(actor, 'admin');
      parse(z.uuid(), id);
      const change = parse(rolesPut, input);
      return withTransaction(pool, async db => {
        const repo = usersRepository(db);
        const ids = [actor.id, id, ...(change.parentLabelId ? [change.parentLabelId] : [])];
        const principals = await repo.lock(ids, true);
        const current = principals.get(actor.id);
        requirePolicy(current, 'admin');
        if (!principals.has(id)) throw new ApiError(404, 'NOT_FOUND');
        const previousRoles = await repo.allRoles(id);
        if (!canManageUser(current!, id, previousRoles, change.roles)) throw new ApiError(403, 'FORBIDDEN');
        const previousProfile = await repo.find(id);
        const previousParentLabelId = previousProfile?.parent_label_id ?? null;
        const addingArtist = !previousRoles.includes('artist') && change.roles.includes('artist');
        const changingParent = change.parentLabelId !== undefined && previousParentLabelId !== change.parentLabelId;
        const promotingArtist = addingArtist && previousParentLabelId === null && change.parentLabelId != null;
        // Existing artist moves remain in Labels so ownership history and royalty guards stay centralized.
        if (changingParent && !promotingArtist) throw new ApiError(409, 'CONFLICT');
        if (addingArtist && !promotingArtist) throw new ApiError(400, 'BAD_REQUEST');
        if (await repo.hasRoleDependencies(id, change.roles)) throw new ApiError(409, 'CONFLICT');
        if (change.parentLabelId) {
          const parent = principals.get(change.parentLabelId);
          if (!change.roles.includes('artist') || id === change.parentLabelId || !parent ||
              !allows(parent, 'authenticated') || !parent.roles.some(role => role === 'label' || role === 'whitelabel')) {
            throw new ApiError(400, 'BAD_REQUEST');
          }
        }
        await repo.ensureProfile(id);
        if (promotingArtist && !await repo.promoteToArtist(id, change.parentLabelId!)) throw new ApiError(409, 'CONFLICT');
        await repo.setRoles(id, change.roles);
        await repo.audit(actor.id, id, requestId, 'user.roles_changed', {
          previousRoles, roles: change.roles, previousParentLabelId,
          ...(change.parentLabelId === undefined ? {} : { parentLabelId: change.parentLabelId }),
        });
        return { roles: change.roles, parentLabelId: change.parentLabelId ?? previousParentLabelId };
      });
    },
  };
}
export type UsersService = ReturnType<typeof createUsersService>;
