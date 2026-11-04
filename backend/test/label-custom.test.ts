import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { ApiError } from '../src/api/types.js';
import { createLabelCustomService, customManagedArtistCreate, customManagedArtistDto,
  customManagedArtistListQuery, customManagedArtistPatch, labelCustomOwnerScope,
  labelCustomUnitCreate, labelCustomUnitDto, labelCustomUnitPatch,
  type CustomManagedArtistDto, type LabelCustomActor, type LabelCustomUnitDto } from '../src/label-custom/index.js';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const ownerId = id(1), otherOwnerId = id(2), adminId = id(3), unitId = id(10), otherUnitId = id(11), artistId = id(20);
const timestamp = '2026-11-03T00:00:00.000000Z';
const artistInput = { name: 'Artist', contact_email: 'artist@example.test', contact_phone: '+62 812 1234' };
const fails = (status: number) => (error: unknown) => error instanceof ApiError && error.statusCode === status;
type StoredArtist = Omit<CustomManagedArtistDto, 'management_mode' | 'artist_user_id'> & {
  management_mode: 'LOGIN_ACCOUNT' | 'LABEL_CUSTOM_MANAGED'; artist_user_id: string | null;
};
type Profile = { artist_id: string; user_id: string | null; artist_name: string };

// Strict transactional SQL transport double. Unknown SQL fails, including identity
// provisioning; snapshots prove audit/profile failure rolls catalog changes back.
function setup() {
  const unit = (owner: string, unit: string): LabelCustomUnitDto => ({
    id: unit, owner_user_id: owner, unit_code: `LC-${unit}`, name: 'Unit',
    status: 'active', created_at: timestamp, updated_at: timestamp,
  });
  const artist = (value: number, owner = ownerId, unit = unitId): StoredArtist => ({
    ...artistInput, id: id(value), label_id: owner, label_custom_unit_id: unit, artist_user_id: null,
    management_mode: 'LABEL_CUSTOM_MANAGED', status: 'active', verified_at: timestamp,
    created_at: timestamp, updated_at: timestamp,
  });
  const state = {
    principals: [
      { id: ownerId, roles: ['label_custom'], status: 'active' },
      { id: otherOwnerId, roles: ['label_custom'], status: 'active' },
      { id: adminId, roles: ['admin'], status: 'active' },
    ] as { id: string; roles: LabelCustomActor['roles'][number][]; status: LabelCustomActor['status'] }[],
    units: [unit(ownerId, unitId), unit(otherOwnerId, otherUnitId)],
    artists: [artist(20), artist(21), artist(22, otherOwnerId, otherUnitId)],
    profiles: [20, 21, 22].map(value => ({ artist_id: id(value), user_id: null, artist_name: 'Artist' })) as Profile[],
    idempotency: [] as { scope: string; key: string; request_hash: string; status: 'processing' | 'completed'; response_body: unknown }[],
    audits: [] as { actor: string; action: string; resourceType: string; resourceId: string; requestId: string; metadata: Record<string, unknown> }[],
  };
  const queries: { sql: string; values: unknown[] }[] = [];
  let snapshot: typeof state | undefined;
  let auditFailure = false, profileFailure = false, unitConflict = false;
  let released = 0;
  const client = {
    async query(sql: string, values: unknown[] = []) {
      queries.push({ sql, values });
      const result = (rows: unknown[] = [], rowCount = rows.length) => ({ rows: structuredClone(rows), rowCount });
      if (sql === 'BEGIN') { snapshot = structuredClone(state); return result(); }
      if (sql === 'COMMIT') { snapshot = undefined; return result(); }
      if (sql === 'ROLLBACK') { if (snapshot) Object.assign(state, snapshot); snapshot = undefined; return result(); }
      if (sql.includes('SELECT id, status FROM soundpub.backend_users')) {
        assert.match(sql, /ORDER BY id FOR (UPDATE|SHARE)/);
        return result(state.principals.filter(row => (values[0] as string[]).includes(row.id))
          .map(({ id, status }) => ({ id, status })));
      }
      if (sql.includes('pg_advisory_xact_lock')) return result();
      if (sql.includes('SELECT user_id, role')) {
        assert.match(sql, /tenant_id IS NULL/);
        assert.match(sql, /verified_at IS NOT NULL/);
        return result(state.principals.filter(row => (values[0] as string[]).includes(row.id))
          .flatMap(row => row.roles.map(role => ({ user_id: row.id, role }))));
      }
      if (sql.startsWith('INSERT INTO soundpub.idempotency_keys')) {
        const existing = state.idempotency.find(row => row.scope === values[0] && row.key === values[1]);
        if (existing) return result();
        state.idempotency.push({ scope: String(values[0]), key: String(values[1]), request_hash: String(values[2]),
          status: 'processing', response_body: null });
        return result([{ status: 'processing' }]);
      }
      if (sql.startsWith('SELECT request_hash,status,response_body FROM soundpub.idempotency_keys')) {
        const row = state.idempotency.find(row => row.scope === values[0] && row.key === values[1]);
        return result(row ? [row] : []);
      }
      if (sql.startsWith('UPDATE soundpub.idempotency_keys')) {
        const row = state.idempotency.find(row => row.scope === values[0] && row.key === values[1] && row.status === 'processing');
        if (!row) return result([], 0);
        row.status = 'completed'; row.response_body = JSON.parse(String(values[2]));
        return result([], 1);
      }
      if (sql.startsWith('SELECT') && sql.includes('FROM soundpub.label_custom_units')) {
        assert.match(sql, /owner_user_id = \$1 FOR (UPDATE|SHARE)/);
        return result(state.units.filter(row => row.owner_user_id === values[0]));
      }
      if (sql.startsWith('INSERT INTO soundpub.label_custom_units')) {
        assert.match(sql, /ON CONFLICT \(owner_user_id\) DO NOTHING/);
        if (unitConflict || state.units.some(row => row.owner_user_id === values[1])) return result();
        const row = { ...unit(String(values[1]), String(values[0])), unit_code: String(values[2]), name: String(values[3]) };
        state.units.push(row);
        return result([row]);
      }
      if (sql.startsWith('UPDATE soundpub.label_custom_units')) {
        const row = state.units.find(row => row.id === values[0] && row.owner_user_id === values[1]);
        if (!row) return result();
        if (values[2] !== null) row.name = String(values[2]);
        if (values[3] !== null) row.status = values[3] as LabelCustomUnitDto['status'];
        return result([row]);
      }
      if ((sql.startsWith('SELECT') || sql.startsWith('UPDATE')) && sql.includes('soundpub.artists')) {
        assert.match(sql, /label_id = \$1 AND label_custom_unit_id = \$2/);
        assert.match(sql, /artist_user_id IS NULL AND management_mode = 'LABEL_CUSTOM_MANAGED'/);
        const rows = state.artists.filter(row => row.label_id === values[0] && row.label_custom_unit_id === values[1] &&
          row.artist_user_id === null && row.management_mode === 'LABEL_CUSTOM_MANAGED');
        if (sql.includes('ORDER BY id LIMIT')) {
          return result(rows.filter(row => (!values[2] || row.id > String(values[2])) && row.status === values[3] &&
            (!values[4] || row.name.toLowerCase().includes(String(values[4]).toLowerCase())))
            .sort((a, b) => a.id.localeCompare(b.id)).slice(0, Number(values[5])));
        }
        const row = rows.find(row => row.id === values[2]);
        if (!row) return result();
        if (sql.startsWith('SELECT')) {
          assert.match(sql, /FOR (UPDATE|SHARE)/);
          return result([row]);
        }
        assert.match(sql, /AND verified_at IS NOT NULL/);
        if (row.verified_at === null) return result();
        if (sql.includes('SET verified_at=NULL')) { row.verified_at = null; row.status = 'archived'; }
        else {
          if (values[3] !== null) row.name = String(values[3]);
          if (values[4] !== null) row.contact_email = String(values[4]);
          if (values[5] !== null) row.contact_phone = String(values[5]);
        }
        return result([row]);
      }
      if (sql.startsWith('INSERT INTO soundpub.artists')) {
        assert.match(sql, /VALUES \(\$1,\$2,NULL,\$3,'LABEL_CUSTOM_MANAGED',\$4,\$5,\$6,now\(\)\)/);
        const row = { ...artist(99), id: String(values[0]), label_id: String(values[1]),
          label_custom_unit_id: String(values[2]), name: String(values[3]),
          contact_email: String(values[4]), contact_phone: String(values[5]) };
        state.artists.push(row);
        return result([row]);
      }
      if (sql.startsWith('INSERT INTO soundpub.artist_profiles')) {
        if (profileFailure) throw new Error('Synthetic profile failure');
        assert.match(sql, /VALUES \(\$1,NULL,\$2\)/);
        state.profiles.push({ artist_id: String(values[0]), user_id: null, artist_name: String(values[1]) });
        return result([], 1);
      }
      if (sql.startsWith('UPDATE soundpub.artist_profiles')) {
        if (profileFailure) throw new Error('Synthetic profile failure');
        assert.match(sql, /WHERE artist_id=\$1 AND user_id IS NULL/);
        const row = state.profiles.find(row => row.artist_id === values[0] && row.user_id === null);
        if (row) row.artist_name = String(values[1]);
        return result([], row ? 1 : 0);
      }
      if (sql.startsWith('INSERT INTO soundpub.audit_logs')) {
        if (auditFailure) throw new Error('Synthetic audit failure');
        state.audits.push({ actor: String(values[0]), action: String(values[1]), resourceType: String(values[2]),
          resourceId: String(values[3]), requestId: String(values[4]), metadata: JSON.parse(String(values[5])) });
        return result([], 1);
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() { released++; },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const principal = (id = ownerId) => structuredClone(state.principals.find(row => row.id === id)!);
  return { state, queries, service: createLabelCustomService(pool), principal, released: () => released,
    rejectAudit: () => { auditFailure = true; }, rejectProfile: () => { profileFailure = true; },
    conflictUnit: () => { unitConflict = true; } };
}

test('strict contracts require contacts, reject mass assignment, and bound list queries', () => {
  for (const value of [{ name: 'X' }, { ...artistInput, contact_email: '' }, { ...artistInput, contact_email: 'bad' },
    { ...artistInput, contact_phone: ' ' }, { ...artistInput, contact_email: null }, { ...artistInput, contact_phone: null }]) {
    assert.equal(customManagedArtistCreate.safeParse(value).success, false, JSON.stringify(value));
  }
  for (const [field, value] of Object.entries({ id: artistId, artist_id: artistId, label_id: otherOwnerId,
    owner_user_id: otherOwnerId, label_custom_unit_id: otherUnitId, artist_user_id: ownerId,
    user_id: ownerId, management_mode: 'LOGIN_ACCOUNT', verified_at: timestamp,
    status: 'archived', password: 'secret', email: 'login@example.test', roles: ['artist'], balance: '50' })) {
    assert.equal(customManagedArtistCreate.safeParse({ ...artistInput, [field]: value }).success, false, field);
    assert.equal(customManagedArtistPatch.safeParse({ name: 'X', [field]: value }).success, false, field);
  }
  for (const value of [{}, { name: undefined }, { contact_phone: '' }, { contact_email: null }]) {
    assert.equal(customManagedArtistPatch.safeParse(value).success, false);
  }
  for (const value of [{}, { name: ' ' }, { name: 'Unit', owner_user_id: ownerId }, { name: 'Unit', unit_code: 'FORGED' }]) {
    assert.equal(labelCustomUnitCreate.safeParse(value).success, false);
  }
  for (const value of [{}, { name: undefined }, { owner_user_id: ownerId }, { unit_code: 'FORGED' }, { status: 'inactive' }]) {
    assert.equal(labelCustomUnitPatch.safeParse(value).success, false);
  }
  for (const value of [{ limit: '0' }, { limit: '101' }, { limit: '1.5' }, { cursor: '' }, { search: ' ' },
    { status: 'deleted' }, { owner_user_id: otherOwnerId }]) assert.equal(customManagedArtistListQuery.safeParse(value).success, false);
  assert.equal(labelCustomOwnerScope.safeParse({ unit_id: unitId }).success, false);
  assert.deepEqual(customManagedArtistCreate.parse({ name: ' Artist ', contact_email: ' artist@example.test ', contact_phone: ' 123 ' }),
    { name: 'Artist', contact_email: 'artist@example.test', contact_phone: '123' });
});

test('invalid identifiers, payloads, request IDs and scope reject before DB work', async () => {
  const f = setup(), actor = f.principal();
  await assert.rejects(f.service.getArtist(actor, 'bad'), fails(400));
  await assert.rejects(f.service.createArtist(actor, { name: 'X' } as never, 'request'), fails(400));
  await assert.rejects(f.service.updateArtist(actor, artistId, { label_id: otherOwnerId } as never, 'request'), fails(400));
  await assert.rejects(f.service.createUnit(actor, { name: 'X' }, ''), fails(400));
  await assert.rejects(f.service.archiveArtist(actor, artistId, ' '), fails(400));
  await assert.rejects(f.service.getUnit(actor, { owner_user_id: 'bad' }), fails(400));
  await assert.rejects(f.service.listArtists(actor, { limit: '101' }), fails(400));
  assert.equal(f.queries.length, 0);
});

test('only active label_custom or explicit administrators can operate; current DB authority wins', async () => {
  for (const role of ['user', 'artist', 'label', 'whitelabel', 'copyright'] as const) {
    const f = setup(), actor = { ...f.principal(), roles: [role] };
    await assert.rejects(f.service.getUnit(actor), fails(403));
    await assert.rejects(f.service.createArtist(actor, artistInput, 'request'), fails(403));
    assert.equal(f.queries.length, 0);
  }
  for (const status of ['inactive', 'suspended'] as const) {
    const f = setup(), actor = f.principal();
    f.state.principals[0]!.status = status;
    await assert.rejects(f.service.getUnit(actor), fails(403));
    assert.equal(f.queries.at(-1)?.sql, 'ROLLBACK');
    assert.equal(f.released(), 1);
  }
  const f = setup(), stale = f.principal();
  f.state.principals[0]!.roles = ['label'];
  await assert.rejects(f.service.createArtist(stale, artistInput, 'request'), fails(403));
  assert.equal(f.state.audits.length, 0);
  const g = setup(), forged = { ...g.principal(ownerId), roles: ['admin'] as const };
  await assert.rejects(g.service.getUnit(forged, { owner_user_id: otherOwnerId }), fails(403));
});

test('unit get/create/update derives owner/code and enforces one unit per owner, including archived units', async () => {
  const f = setup(), actor = f.principal();
  assert.deepEqual(labelCustomUnitDto.parse(await f.service.getUnit(actor)), f.state.units[0]);
  await assert.rejects(f.service.createUnit(actor, { name: 'Duplicate' }, 'request'), fails(409));
  f.state.units[0]!.status = 'archived';
  await assert.rejects(f.service.createUnit(actor, { name: 'Replacement' }, 'request'), fails(409));
  const updated = await f.service.updateUnit(actor, { name: ' Renamed ', status: 'active' }, 'rename');
  assert.equal(updated.name, 'Renamed');
  assert.equal(updated.status, 'active');
  assert.equal(updated.unit_code, `LC-${unitId}`);
  f.state.units = f.state.units.filter(row => row.owner_user_id !== ownerId);
  await assert.rejects(f.service.getUnit(actor), fails(404));
  const created = await f.service.createUnit(actor, { name: ' New Unit ' }, 'create');
  assert.equal(created.owner_user_id, ownerId);
  assert.match(created.unit_code, /^LC-[0-9A-F]{32}$/);
  assert.equal(created.name, 'New Unit');
  assert.equal(f.state.units.filter(row => row.owner_user_id === ownerId).length, 1);
  assert.equal(f.state.audits.at(-1)?.resourceType, 'label_custom_unit');
  assert.equal(f.state.audits.at(-1)?.requestId, 'create');
  assert.equal(f.queries.at(-1)?.sql, 'COMMIT');
  const g = setup();
  g.state.units = [];
  g.conflictUnit();
  await assert.rejects(g.service.createUnit(g.principal(), { name: 'Race' }, 'request'), fails(409));
  assert.equal(g.state.audits.length, 0);
});

test('admin/superadmin require explicit eligible owner for every operation', async () => {
  for (const role of ['admin', 'superadmin'] as const) {
    const f = setup();
    f.state.principals[2]!.roles = [role];
    const actor = f.principal(adminId), scope = { owner_user_id: ownerId };
    const operations = [
      () => f.service.getUnit(actor),
      () => f.service.createUnit(actor, { name: 'X' }, 'request'),
      () => f.service.updateUnit(actor, { name: 'X' }, 'request'),
      () => f.service.listArtists(actor),
      () => f.service.getArtist(actor, artistId),
      () => f.service.createArtist(actor, artistInput, 'request'),
      () => f.service.updateArtist(actor, artistId, { name: 'X' }, 'request'),
      () => f.service.archiveArtist(actor, artistId, 'request'),
    ];
    for (const operation of operations) await assert.rejects(operation(), fails(400));
    assert.equal((await f.service.getUnit(actor, scope)).owner_user_id, ownerId);
    const created = await f.service.createArtist(actor, artistInput, 'admin-create', scope);
    assert.equal(created.label_id, ownerId);
    assert.equal(f.state.audits.at(-1)?.actor, adminId);
    assert.equal((await f.service.listArtists(actor, {}, scope)).items.length, 3);
    assert.equal((await f.service.updateArtist(actor, created.id, { name: 'Admin rename' }, 'admin-update', scope)).name, 'Admin rename');
    assert.equal((await f.service.archiveArtist(actor, created.id, 'admin-archive', scope)).status, 'archived');
    assert.equal((await f.service.updateUnit(actor, { name: 'Admin unit' }, 'admin-unit', scope)).name, 'Admin unit');
    f.state.units = f.state.units.filter(row => row.owner_user_id !== otherOwnerId);
    assert.equal((await f.service.createUnit(actor, { name: 'Other unit' }, 'admin-create-unit',
      { owner_user_id: otherOwnerId })).owner_user_id, otherOwnerId);
    await assert.rejects(f.service.getArtist(actor, id(22), scope), fails(404));
    for (const invalidOwner of [adminId, id(99)]) {
      await assert.rejects(f.service.getUnit(actor, { owner_user_id: invalidOwner }), fails(400));
    }
    f.state.principals[0]!.status = 'suspended';
    await assert.rejects(f.service.getUnit(actor, scope), fails(400));
  }
});

test('ordinary admin cannot mutate a protected Label Custom owner', async () => {
  const f = setup();
  f.state.principals[0]!.roles = ['label_custom', 'superadmin'];
  const admin = f.principal(adminId), scope = { owner_user_id: ownerId };
  assert.equal((await f.service.getUnit(admin, scope)).owner_user_id, ownerId);
  for (const operation of [
    () => f.service.createUnit(admin, { name: 'Blocked' }, 'protected-create', scope),
    () => f.service.updateUnit(admin, { status: 'archived' }, 'protected-update', scope),
    () => f.service.createArtist(admin, artistInput, 'protected-artist', scope),
    () => f.service.updateArtist(admin, artistId, { name: 'Blocked' }, 'protected-artist-update', scope),
    () => f.service.archiveArtist(admin, artistId, 'protected-artist-archive', scope),
  ]) await assert.rejects(operation(), fails(404));
  assert.equal(f.state.units[0]!.status, 'active');
  assert.equal(f.state.artists[0]!.status, 'active');
  assert.equal(f.state.audits.length, 0);
});

test('owner/unit/artist bindings prevent IDOR and exclude login accounts or malformed managed bindings', async () => {
  const f = setup(), actor = f.principal();
  await assert.rejects(f.service.getUnit(actor, { owner_user_id: otherOwnerId }), fails(403));
  await assert.rejects(f.service.createArtist(actor, artistInput, 'request', { owner_user_id: otherOwnerId }), fails(403));
  await assert.rejects(f.service.listArtists(actor, {}, { owner_user_id: otherOwnerId }), fails(403));
  for (const candidate of [id(22), id(99)]) {
    await assert.rejects(f.service.getArtist(actor, candidate), fails(404));
    await assert.rejects(f.service.updateArtist(actor, candidate, { name: 'Stolen' }, 'request'), fails(404));
    await assert.rejects(f.service.archiveArtist(actor, candidate, 'request'), fails(404));
  }
  for (const scenario of ['unit', 'mode', 'user', 'label'] as const) {
    const g = setup(), row = g.state.artists[0]!;
    if (scenario === 'unit') row.label_custom_unit_id = otherUnitId;
    if (scenario === 'mode') row.management_mode = 'LOGIN_ACCOUNT';
    if (scenario === 'user') row.artist_user_id = ownerId;
    if (scenario === 'label') row.label_id = otherOwnerId;
    await assert.rejects(g.service.getArtist(g.principal(), artistId), fails(404));
    await assert.rejects(g.service.updateArtist(g.principal(), artistId, { name: 'Stolen' }, 'request'), fails(404));
    await assert.rejects(g.service.archiveArtist(g.principal(), artistId, 'request'), fails(404));
    assert.ok(!(await g.service.listArtists(g.principal())).items.some(row => row.id === artistId));
    assert.equal(g.state.audits.length, 0);
  }
  assert.equal(f.state.audits.length, 0);
});

test('managed creation inserts catalog/profile only; update keeps profile name in same transaction', async () => {
  const f = setup(), actor = f.principal();
  const created = await f.service.createArtist(actor, artistInput, 'create');
  assert.deepEqual(customManagedArtistDto.parse(created), created);
  assert.equal(created.artist_user_id, null);
  assert.equal(created.label_id, ownerId);
  assert.equal(created.label_custom_unit_id, unitId);
  assert.equal(created.management_mode, 'LABEL_CUSTOM_MANAGED');
  assert.deepEqual(f.state.profiles.at(-1), { artist_id: created.id, user_id: null, artist_name: 'Artist' });
  const updated = await f.service.updateArtist(actor, created.id,
    { name: 'Renamed', contact_email: 'new@example.test', contact_phone: '555' }, 'update');
  assert.equal(updated.name, 'Renamed');
  assert.equal(updated.contact_email, 'new@example.test');
  assert.equal(updated.contact_phone, '555');
  assert.equal(f.state.profiles.at(-1)?.artist_name, 'Renamed');
  assert.deepEqual(f.state.audits.map(row => row.action), ['label_custom.artist_created', 'label_custom.artist_updated']);
  assert.equal(f.state.audits[0]?.resourceType, 'artist');
  assert.equal(f.state.audits[0]?.resourceId, created.id);
  assert.ok(f.queries.filter(row => /^(INSERT|UPDATE|DELETE)/.test(row.sql))
    .every(row => /^(INSERT INTO|UPDATE) soundpub\.(artists|artist_profiles|audit_logs|idempotency_keys)\b/.test(row.sql)));
  assert.ok(f.queries.every(row => !/local_auth|external_identit|session|soundpub\.(releases|tracks|royalties|payouts)/.test(row.sql)));
  assert.equal(f.released(), 2);
});

test('managed artist creation replays one result and rejects changed payload for the same key', async () => {
  const f = setup(), actor = f.principal();
  const created = await f.service.createArtist(actor, artistInput, 'stable-retry-key');
  const replay = await f.service.createArtist(actor, artistInput, 'stable-retry-key');
  assert.equal(replay.id, created.id);
  assert.equal(f.state.artists.filter(row => row.id === created.id).length, 1);
  assert.equal(f.state.profiles.filter(row => row.artist_id === created.id).length, 1);
  assert.equal(f.state.audits.filter(row => row.requestId === 'stable-retry-key').length, 1);
  await assert.rejects(f.service.createArtist(actor, { ...artistInput, name: 'Changed' }, 'stable-retry-key'), fails(409));
});

test('missing unit rejects artist work; archived unit rejects creation; archive preserves rows and is idempotent', async () => {
  const f = setup(), actor = f.principal();
  f.state.units[0]!.status = 'archived';
  await assert.rejects(f.service.createArtist(actor, artistInput, 'blocked'), fails(409));
  const beforeArtists = f.state.artists.length, beforeProfiles = structuredClone(f.state.profiles);
  const archived = await f.service.archiveArtist(actor, artistId, 'archive');
  assert.equal(archived.status, 'archived');
  assert.equal(archived.verified_at, null);
  assert.equal(f.state.artists.length, beforeArtists);
  assert.deepEqual(f.state.profiles, beforeProfiles);
  assert.equal((await f.service.getArtist(actor, artistId)).status, 'archived');
  assert.ok(!(await f.service.listArtists(actor)).items.some(row => row.id === artistId));
  assert.deepEqual((await f.service.listArtists(actor, { status: 'archived' })).items.map(row => row.id), [artistId]);
  assert.deepEqual(await f.service.archiveArtist(actor, artistId, 'repeat'), archived);
  assert.equal(f.state.audits.length, 1);
  await assert.rejects(f.service.updateArtist(actor, artistId, { name: 'Reactivated' }, 'update'), fails(409));
  assert.ok(f.queries.every(row => !row.sql.startsWith('DELETE')));
  f.state.units = [];
  await assert.rejects(f.service.createArtist(actor, artistInput, 'missing'), fails(404));
  await assert.rejects(f.service.getArtist(actor, artistId), fails(404));
  await assert.rejects(f.service.listArtists(actor), fails(404));
});

test('every mutation rolls back atomically on audit failure and releases transaction client', async () => {
  for (const operation of ['createUnit', 'updateUnit', 'createArtist', 'updateArtist', 'archiveArtist'] as const) {
    const f = setup(), actor = f.principal();
    if (operation === 'createUnit') f.state.units = [];
    const before = structuredClone(f.state);
    f.rejectAudit();
    const actions = {
      createUnit: () => f.service.createUnit(actor, { name: 'New' }, 'request'),
      updateUnit: () => f.service.updateUnit(actor, { status: 'archived' }, 'request'),
      createArtist: () => f.service.createArtist(actor, artistInput, 'request'),
      updateArtist: () => f.service.updateArtist(actor, artistId, { name: 'Renamed' }, 'request'),
      archiveArtist: () => f.service.archiveArtist(actor, artistId, 'request'),
    };
    await assert.rejects(actions[operation](), /Synthetic audit failure/);
    assert.deepEqual(f.state, before, operation);
    assert.equal(f.queries.at(-1)?.sql, 'ROLLBACK');
    assert.equal(f.released(), 1);
    assert.equal(f.queries.some(row => row.sql === 'COMMIT'), false);
  }
});

test('profile insert/update failure rolls catalog changes back', async () => {
  for (const create of [true, false]) {
    const f = setup(), actor = f.principal(), before = structuredClone(f.state);
    f.rejectProfile();
    await assert.rejects(create ? f.service.createArtist(actor, artistInput, 'request')
      : f.service.updateArtist(actor, artistId, { name: 'Renamed' }, 'request'), /Synthetic profile failure/);
    assert.deepEqual(f.state, before);
    assert.equal(f.queries.at(-1)?.sql, 'ROLLBACK');
  }
});

test('pagination binds domain, actor, owner and filters; search remains a bound literal', async () => {
  const f = setup(), actor = f.principal();
  const page = await f.service.listArtists(actor, { limit: '1', search: 'Artist' });
  assert.deepEqual(page.items.map(row => row.id), [artistId]);
  assert.ok(page.nextCursor);
  const next = await f.service.listArtists(actor, { limit: '1', search: 'Artist', cursor: page.nextCursor });
  assert.deepEqual(next.items.map(row => row.id), [id(21)]);
  assert.equal(next.nextCursor, null);
  for (const input of [{ cursor: page.nextCursor }, { cursor: page.nextCursor, search: 'Changed' },
    { cursor: page.nextCursor, search: 'Artist', status: 'archived' }, { cursor: 'garbage' }, { cursor: 'e30' }, { cursor: '+++' }]) {
    await assert.rejects(f.service.listArtists(actor, input), fails(400));
  }
  await assert.rejects(f.service.listArtists(f.principal(otherOwnerId), { cursor: page.nextCursor, search: 'Artist' }), fails(400));
  const admin = f.principal(adminId), scope = { owner_user_id: ownerId };
  const adminPage = await f.service.listArtists(admin, { limit: '1' }, scope);
  assert.ok(adminPage.nextCursor);
  await assert.rejects(f.service.listArtists(admin, { cursor: adminPage.nextCursor }, { owner_user_id: otherOwnerId }), fails(400));
  assert.equal((await f.service.listArtists(actor, { search: "%' OR 1=1" })).items.length, 0);
  const sql = f.queries.findLast(row => row.sql.includes('ORDER BY id LIMIT'))!;
  assert.equal(sql.values[4], "%' OR 1=1");
  assert.ok(!sql.sql.includes("%' OR 1=1"));
});
