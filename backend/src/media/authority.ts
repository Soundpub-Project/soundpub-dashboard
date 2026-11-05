import type { PoolClient } from 'pg';
import { ApiError } from '../api/types.js';
import { createAuthorizer, type Principal } from '../auth/index.js';
import { usersRepository } from '../users/repository.js';
import { canManageUser } from '../users/index.js';
import { canManageArtist } from '../artists/index.js';
import { artistsRepository } from '../artists/repository.js';
import { SETTINGS_MEDIA_RESOURCE_ID, type UploadInput } from './contracts.js';

const allows = createAuthorizer();
export async function mediaAuthority(db: PoolClient, actor: Principal,
  binding: { resource_type: UploadInput['resource_type']; resource_id: string; category: string;
    document_type?: UploadInput['document_type'] | null; copyright_document_type?: UploadInput['document_type'] | null }, write: boolean) {
  if (!actor || !allows(actor, 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
  const { resource_type: type, resource_id: id } = binding;
  if (type === 'copyright_registration') {
    const current = (await usersRepository(db).lock([actor.id], true)).get(actor.id);
    if (!current || !allows(current, 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
    const registration = (await db.query<{ owner_id: string; status: string }>(
      'SELECT owner_id,status FROM soundpub.copyright_registrations WHERE id=$1 FOR UPDATE', [id])).rows[0];
    const admin = allows(current, 'admin');
    if (!registration || !(admin || registration.owner_id === current.id)) throw new ApiError(404, 'NOT_FOUND');
    const documentType = binding.document_type ?? binding.copyright_document_type;
    const contractDocument = documentType?.startsWith('CONTRACT_') ?? false;
    if (write && (contractDocument
      ? !admin || !['APPROVED','CONTRACT_GENERATED','STAMPING_PENDING','STAMPED','CONTRACT_SIGNED'].includes(registration.status)
      : !['DRAFT','REVISION_REQUESTED'].includes(registration.status))) throw new ApiError(409, 'MEDIA_RESOURCE_LOCKED');
    return { current, releaseId: null };
  }
  let releaseId: string | null = type === 'release' ? id : null;
  if (type === 'track') {
    releaseId = (await db.query('SELECT release_id FROM soundpub.tracks WHERE id=$1', [id])).rows[0]?.release_id ?? null;
    if (!releaseId) throw new ApiError(404, 'NOT_FOUND');
  }
  const initial = releaseId ? (await db.query('SELECT artist_id, artist_user_id FROM soundpub.releases WHERE id=$1', [releaseId])).rows[0] : null;
  const catalog = initial?.artist_id ? (await db.query('SELECT * FROM soundpub.artists WHERE id=$1', [initial.artist_id])).rows[0] : null;
  if (releaseId && !catalog) throw new ApiError(404, 'NOT_FOUND');
  const targetId: string | null = releaseId ? (catalog.management_mode === 'LABEL_CUSTOM_MANAGED' ? catalog.label_id : catalog.artist_user_id) : id;
  const users = usersRepository(db);
  const principals = await users.lock([actor.id, ...(targetId && type !== 'takedown' ? [targetId] : [])], true);
  const current = principals.get(actor.id);
  if (!current || !allows(current, 'authenticated')) throw new ApiError(403, 'FORBIDDEN');
  if (type === 'takedown') {
    const request = (await db.query<{ requester_id: string; label_id: string; status: string }>(
      'SELECT requester_id,label_id,status FROM soundpub.takedown_requests WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!request || !(allows(current, 'admin') || request.requester_id === current.id || request.label_id === current.id)
      || write && ['COMPLETED','REJECTED','CANCELLED'].includes(request.status)) throw new ApiError(404, 'NOT_FOUND');
    return { current, releaseId: null };
  }
  if (type === 'settings') {
    if (id !== SETTINGS_MEDIA_RESOURCE_ID || !allows(current, 'admin')) throw new ApiError(404, 'NOT_FOUND');
    await db.query('SELECT id FROM soundpub.application_settings WHERE id=true FOR UPDATE');
    return { current, releaseId: null };
  }
  const target = targetId ? principals.get(targetId) : undefined;
  if (releaseId) {
    const custom = catalog.management_mode === 'LABEL_CUSTOM_MANAGED';
    // User/role locks precede unit, artist, release and track locks, matching lifecycle writes.
    const unit = custom ? (await db.query('SELECT * FROM soundpub.label_custom_units WHERE id=$1 FOR UPDATE',
      [catalog.label_custom_unit_id])).rows[0] : null;
    const canonical = (await db.query('SELECT * FROM soundpub.artists WHERE id=$1 FOR UPDATE', [initial.artist_id])).rows[0];
    if (!canonical || canonical.management_mode !== catalog.management_mode || canonical.artist_user_id !== catalog.artist_user_id
      || (custom && canonical.label_id !== catalog.label_id) || canonical.label_custom_unit_id !== catalog.label_custom_unit_id) throw new ApiError(409, 'CONFLICT');
    if (custom) {
      if (!unit || unit.status !== 'active' || unit.owner_user_id !== canonical.label_id || !canonical.verified_at
        || canonical.artist_user_id !== null || !target || target.status !== 'active' || !target.roles.includes('label_custom')
        || !(allows(current, 'admin') || (current.id === unit.owner_user_id && current.roles.includes('label_custom')))) throw new ApiError(404, 'NOT_FOUND');
      if (allows(current, 'admin') && write && current.id !== target.id
        && !canManageUser(current, target.id, await users.allRoles(target.id))) throw new ApiError(404, 'NOT_FOUND');
    } else {
      const artist = targetId ? await artistsRepository(db).find(targetId) : null;
      if (!(allows(current, 'admin') && (!write || !target)) && (!target || !artist || !canManageArtist(current,
        { ...target, roles: await users.allRoles(target.id) }, artist.label_user_id, write))) throw new ApiError(404, 'NOT_FOUND');
    }
    const release = (await db.query('SELECT * FROM soundpub.releases WHERE id=$1 FOR UPDATE', [releaseId])).rows[0];
    if (!release || release.artist_id !== canonical.id || release.artist_user_id !== canonical.artist_user_id) throw new ApiError(409, 'CONFLICT');
    if (write && (release.archived_at || !['draft', 'rejected'].includes(release.status))) throw new ApiError(409, 'MEDIA_RESOURCE_LOCKED');
    if (type === 'track' && !(await db.query('SELECT id FROM soundpub.tracks WHERE id=$1 AND release_id=$2 AND artist_id=$3 FOR UPDATE', [id, releaseId, canonical.id])).rowCount) throw new ApiError(404, 'NOT_FOUND');
  } else {
    if (!target) throw new ApiError(404, 'NOT_FOUND');
    const targetRoles = await users.allRoles(target.id);
    if (type === 'user' && current.id !== target.id) throw new ApiError(404, 'NOT_FOUND');
    if (type === 'label' && (!target.roles.some(r => r === 'label' || r === 'whitelabel' || r === 'label_custom')
      || !(current.id === target.id || (allows(current, 'admin') && (!write || canManageUser(current, target.id, targetRoles)))))) throw new ApiError(404, 'NOT_FOUND');
    if (type === 'label' && target.roles.includes('label_custom')) {
      const unit = (await db.query('SELECT * FROM soundpub.label_custom_units WHERE owner_user_id=$1 FOR UPDATE', [target.id])).rows[0];
      if (!unit || unit.status !== 'active' || target.status !== 'active') throw new ApiError(404, 'NOT_FOUND');
    }
    if (!(await db.query('SELECT id FROM soundpub.profiles WHERE id=$1 FOR UPDATE', [id])).rowCount) throw new ApiError(404, 'NOT_FOUND');
  }
  return { current, releaseId };
}
