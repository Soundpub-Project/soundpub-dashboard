import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createPool, withTransaction } from '../db/pool.js';

interface Row {
  id: string;
  user_id: string;
  artist_user_id: string;
  label_id: string;
  parent_label_id: string | null;
  parent_label_reference_id: string | null;
  artist_name: string;
  status: string;
  role: string;
  tenant_id: string | null;
  verified_at: Date | null;
}
export interface OrphanIssue { type: string; entity: string; status: 'DETERMINISTIC_REPAIR' | 'AMBIGUOUS_REPAIR' }
export interface RepairOptions {
  databaseUrl: string;
  apply?: boolean;
  actor?: string;
  reason?: string;
  rollbackBatch?: string;
}

export function validateOrphanTarget(raw: string): void {
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^\/soundpub_test_orphan_[a-z0-9_]+$/.test(url.pathname) ||
      !url.username || !url.password || url.search || url.hash) {
    throw new Error('ISOLATED_SYNTHETIC_TARGET_REQUIRED');
  }
}

async function inventory(db: PoolClient) {
  const users: Row[] = (await db.query('SELECT * FROM soundpub.backend_users ORDER BY id')).rows;
  const profiles: Row[] = (await db.query('SELECT * FROM soundpub.profiles ORDER BY id')).rows;
  const artists: Row[] = (await db.query('SELECT * FROM soundpub.artist_profiles ORDER BY id')).rows;
  const links: Row[] = (await db.query('SELECT * FROM soundpub.artists ORDER BY id')).rows;
  const roles: Row[] = (await db.query('SELECT * FROM soundpub.user_roles ORDER BY id')).rows;
  const user = new Map(users.map(row => [row.id, row]));
  const profile = new Map(profiles.map(row => [row.id, row]));
  const hasRole = (id: string, names: string[]) => roles.some(row => row.user_id === id &&
    names.includes(row.role) && row.tenant_id === null && row.verified_at !== null);
  const validLabel = (id: string) => !!profile.has(id) && user.get(id)?.status === 'active' && hasRole(id, ['label', 'whitelabel']);
  const validArtist = (id: string) => !!profile.has(id) && user.get(id)?.status === 'active' &&
    hasRole(id, ['artist']) && !hasRole(id, ['admin', 'superadmin', 'label', 'whitelabel']) &&
    artists.filter(row => row.user_id === id).length === 1;
  const issues: OrphanIssue[] = [];
  const repairs: { artistId: string; labelId: string; name: string }[] = [];
  const add = (type: string, entity: string, deterministic = false) => issues.push({ type, entity,
    status: deterministic ? 'DETERMINISTIC_REPAIR' : 'AMBIGUOUS_REPAIR' });
  for (const row of artists) {
    if (!user.has(row.user_id) || !profile.has(row.user_id)) add('MISSING_ARTIST_OWNER', row.id);
    if (artists.filter(other => other.user_id === row.user_id).length > 1) add('DUPLICATE_ARTIST_OWNER', row.id);
  }
  for (const row of profiles) {
    if (!user.has(row.id)) add('MISSING_PROFILE_OWNER', row.id);
    if (row.parent_label_reference_id !== null) add('UNRESOLVED_PARENT_REFERENCE', row.id);
    if (row.parent_label_id !== null) {
      if (!profile.has(row.parent_label_id) || !user.has(row.parent_label_id)) add('MISSING_LABEL', row.id);
      else if (!validLabel(row.parent_label_id) || !validArtist(row.id) || row.parent_label_id === row.id)
        add('INVALID_CURRENT_PARENT', row.id);
      const memberships = links.filter(link => link.artist_user_id === row.id);
      if (memberships.length === 0 && validArtist(row.id) && validLabel(row.parent_label_id) &&
          row.parent_label_reference_id === null && row.parent_label_id !== row.id) {
        add('MISSING_CURRENT_MEMBERSHIP', row.id, true);
        repairs.push({ artistId: row.id, labelId: row.parent_label_id,
          name: artists.find(artist => artist.user_id === row.id)!.artist_name });
      }
    }
  }
  for (const row of links) {
    if (!user.has(row.artist_user_id)) add('MEMBERSHIP_MISSING_USER', row.id);
    if (!profile.has(row.artist_user_id) || !artists.some(artist => artist.user_id === row.artist_user_id))
      add('RELATION_MISSING_ARTIST', row.id);
    if (!profile.has(row.label_id) || !user.has(row.label_id)) add('MISSING_LABEL', row.id);
    if (!validArtist(row.artist_user_id) || !validLabel(row.label_id) || row.verified_at === null ||
        profile.get(row.artist_user_id)?.parent_label_id !== row.label_id ||
        profile.get(row.artist_user_id)?.parent_label_reference_id !== null || row.artist_user_id === row.label_id)
      add('INVALID_CURRENT_PARENT', row.id);
    if (links.filter(other => other.artist_user_id === row.artist_user_id).length > 1)
      add('CONFLICTING_CURRENT_OWNERSHIP', row.id);
  }
  return { issues, repairs };
}

export async function repairOrphans(options: RepairOptions) {
  validateOrphanTarget(options.databaseUrl);
  if (options.apply !== undefined && typeof options.apply !== 'boolean') throw new Error('EXPLICIT_APPLY_REQUIRED');
  if (options.apply && (!options.actor?.trim() || !options.reason?.trim() ||
      options.actor.length > 200 || options.reason.length > 2000)) throw new Error('ACTOR_AND_REASON_REQUIRED');
  if (options.rollbackBatch && !/^[0-9a-f-]{36}$/.test(options.rollbackBatch)) throw new Error('INVALID_BATCH');
  const pool = createPool({ connectionString: options.databaseUrl, max: 1 });
  try {
    return await withTransaction(pool, async db => {
      await db.query(options.apply ? 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE' :
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL lock_timeout = '5s'");
      const marker = await db.query(`SELECT shobj_description(oid, 'pg_database') AS marker
        FROM pg_database WHERE datname = current_database()`);
      if (marker.rows[0]?.marker !== 'soundpub synthetic orphan repair') throw new Error('DISPOSABLE_MARKER_REQUIRED');
      if (options.apply) await db.query(`LOCK TABLE soundpub.backend_users, soundpub.profiles,
        soundpub.artist_profiles, soundpub.artists, soundpub.user_roles, soundpub.audit_logs
        IN SHARE ROW EXCLUSIVE MODE`);
      const batch = randomUUID();
      const audit = async (action: string, entity: string, oldState: Row | null, newState: Row | null) => {
        await db.query(`INSERT INTO soundpub.audit_logs(action, resource_type, resource_id, metadata)
          VALUES ($1, 'artist_membership', $2, $3::jsonb)`, [action, entity, JSON.stringify({
          batch, processActor: options.actor, reason: options.reason, oldState, newState,
          rollbackOf: options.rollbackBatch ?? null,
        })]);
      };
      if (options.rollbackBatch) {
        const entries = (await db.query(`SELECT resource_id, metadata FROM soundpub.audit_logs
          WHERE action = 'orphan.membership_restored' AND metadata->>'batch' = $1 ORDER BY resource_id`,
        [options.rollbackBatch])).rows;
        if (!entries.length) throw new Error('UNKNOWN_REPAIR_BATCH');
        const prior = await db.query(`SELECT 1 FROM soundpub.audit_logs
          WHERE action = 'orphan.repair_rolled_back' AND metadata->>'rollbackOf' = $1`, [options.rollbackBatch]);
        if (prior.rowCount) return { mode: options.apply ? 'apply' : 'dry-run', batch, issues: [], repairs: [], rolledBack: 0 };
        for (const entry of entries) {
          const current = await db.query('SELECT to_jsonb(a) AS state FROM soundpub.artists a WHERE id = $1', [entry.resource_id]);
          if (JSON.stringify(current.rows[0]?.state) !== JSON.stringify(entry.metadata.newState)) throw new Error('ROLLBACK_CONFLICT');
          if (options.apply) {
            await db.query('DELETE FROM soundpub.artists WHERE id = $1', [entry.resource_id]);
            await audit('orphan.repair_rolled_back', entry.resource_id, entry.metadata.newState, null);
          }
        }
        return { mode: options.apply ? 'apply' : 'dry-run', batch, issues: [], repairs: [], rolledBack: options.apply ? entries.length : 0 };
      }
      const result = await inventory(db);
      if (options.apply && result.issues.some(issue => issue.status === 'AMBIGUOUS_REPAIR'))
        return { mode: 'apply', batch, ...result, applied: 0, status: 'AMBIGUOUS_REPAIR' };
      if (options.apply) {
        for (const repair of result.repairs) {
          const inserted = await db.query(`INSERT INTO soundpub.artists(artist_user_id, label_id, name, verified_at)
            VALUES ($1, $2, $3, now()) RETURNING to_jsonb(artists) AS state`, [repair.artistId, repair.labelId, repair.name]);
          const state = inserted.rows[0]!.state;
          await audit('orphan.membership_restored', state.id, null, state);
        }
      }
      return { mode: options.apply ? 'apply' : 'dry-run', batch, ...result, applied: options.apply ? result.repairs.length : 0,
        status: result.issues.some(issue => issue.status === 'AMBIGUOUS_REPAIR') ? 'AMBIGUOUS_REPAIR' : 'OK' };
    });
  } finally { await pool.end(); }
}
