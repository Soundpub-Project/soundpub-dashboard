import type { PoolClient } from 'pg';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { usersRepository } from '../users/repository.js';
import { canManageUser } from '../users/index.js';
import { ApiError } from '../api/types.js';

const allows = createAuthorizer();

export interface CatalogIdentity {
  id: string; artist_user_id: string | null; label_id: string | null;
  management_mode: string; label_custom_unit_id: string | null; verified_at: unknown;
}
export async function catalogIdentity(db: PoolClient, id: string | undefined, userId?: string | null) {
  if (!id && !userId) throw new ApiError(400, 'BAD_REQUEST');
  const rows = (await db.query<CatalogIdentity>(`SELECT id, artist_user_id, label_id, management_mode,
    label_custom_unit_id, verified_at FROM soundpub.artists
    WHERE ($1::uuid IS NOT NULL AND id=$1) OR ($1::uuid IS NULL AND artist_user_id=$2)`, [id ?? null, userId ?? null])).rows;
  const artist = rows.length === 1 ? rows[0] : undefined;
  if (!artist) throw new ApiError(404, 'NOT_FOUND');
  if (userId && artist.artist_user_id !== userId) throw new ApiError(400, 'BAD_REQUEST');
  return artist;
}

// User/role locks precede unit and catalog locks, matching custom artist lifecycle.
export async function customAuthority(db: PoolClient, actor: Principal, initial: CatalogIdentity, write: boolean) {
  const users = usersRepository(db);
  const ownerId = initial.label_id;
  if (!ownerId) throw new ApiError(404, 'NOT_FOUND');
  const principals = await users.lock([actor.id, ownerId], write);
  const current = principals.get(actor.id);
  const owner = principals.get(ownerId);
  if (!current || current.status !== 'active') throw new ApiError(403, 'FORBIDDEN');
  const ownsUnit = current.id === ownerId && current.roles.includes('label_custom');
  const admin = allows(current, 'admin');
  if (!ownsUnit && (!admin || !owner || owner.status !== 'active' || write &&
    !canManageUser(current, owner.id, await users.allRoles(owner.id)))) throw new ApiError(404, 'NOT_FOUND');
  const unit = (await db.query<{ id: string; status: string }>(`SELECT id, status FROM soundpub.label_custom_units
    WHERE owner_user_id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`, [ownerId])).rows[0];
  if (!unit || unit.status !== 'active' || unit.id !== initial.label_custom_unit_id) throw new ApiError(404, 'NOT_FOUND');
  const artist = (await db.query<CatalogIdentity>(`SELECT id, artist_user_id, label_id, management_mode,
    label_custom_unit_id, verified_at FROM soundpub.artists WHERE id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`, [initial.id])).rows[0];
  if (!artist || artist.management_mode !== 'LABEL_CUSTOM_MANAGED' || artist.artist_user_id !== null ||
      artist.label_custom_unit_id !== unit.id || artist.label_id !== ownerId || (write && !artist.verified_at))
    throw new ApiError(404, 'NOT_FOUND');
  return { current, artist: { ...artist, label_user_id: ownerId } };
}