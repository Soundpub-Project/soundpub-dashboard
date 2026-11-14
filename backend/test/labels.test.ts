import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool, PoolClient } from 'pg';
import { ApiError } from '../src/api/types.js';
import type { Principal, Role } from '../src/auth/index.js';
import { createLabelsService, labelsInTransaction, assignInput, transferInput, removeInput, rosterQuery } from '../src/labels/index.js';

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const admin = id(1), label = id(2), otherLabel = id(3), artist = id(4), otherArtist = id(5), membershipId = id(10);
type Profile = { id: string; full_name: string; parent_label_id: string | null; parent_label_reference_id: string | null };
type Membership = { id: string; artist_user_id: string | null; label_id: string; name: string; verified_at: Date | null };

// Transactional SQL double: exercises service/repository together without server access.
function setup() {
  const state = {
    principals: [
      { id: admin, roles: ['admin'], status: 'active' },
      { id: label, roles: ['label'], status: 'active' },
      { id: otherLabel, roles: ['whitelabel'], status: 'active' },
      { id: artist, roles: ['artist'], status: 'active' },
      { id: otherArtist, roles: ['artist'], status: 'active' },
    ] as { id: string; roles: Role[]; status: Principal['status'] }[],
    profiles: [admin, label, otherLabel, artist, otherArtist].map(userId => ({
      id: userId, full_name: userId === artist || userId === otherArtist ? 'Same Name' : 'Label',
      parent_label_id: userId === artist ? label : null, parent_label_reference_id: null,
    })) as Profile[],
    memberships: [{ id: membershipId, artist_user_id: artist, label_id: label, name: 'Same Name', verified_at: new Date() }] as Membership[],
    audits: [] as { actor: string; artist: string; requestId: string; action: string; metadata: Record<string, unknown> }[],
  };
  const queries: string[] = [];
  let snapshot: typeof state | undefined;
  let rejectAudit = false;
  let released = false;
  const client = {
    async query(sql: string, values: unknown[] = []) {
      queries.push(sql);
      const result = (rows: unknown[] = [], rowCount = rows.length) => ({ rows, rowCount });
      if (sql === 'BEGIN') { snapshot = structuredClone(state); return result(); }
      if (sql === 'COMMIT') { snapshot = undefined; return result(); }
      if (sql === 'ROLLBACK') { if (snapshot) Object.assign(state, snapshot); snapshot = undefined; return result(); }
      if (sql.includes('SELECT id, status FROM soundpub.backend_users')) {
        return result(state.principals.filter(row => (values[0] as string[]).includes(row.id)).map(({ id, status }) => ({ id, status })));
      }
      if (sql.includes('pg_advisory_xact_lock')) return result();
      if (sql.includes('SELECT user_id, role')) {
        return result(state.principals.filter(row => (values[0] as string[]).includes(row.id))
          .flatMap(row => row.roles.map(role => ({ user_id: row.id, role }))));
      }
      if (sql.includes('SELECT role FROM soundpub.user_roles')) {
        return result(state.principals.find(row => row.id === values[0])?.roles.map(role => ({ role })) ?? []);
      }
      if (sql.includes('SELECT id, full_name, parent_label_id')) return result(state.profiles.filter(row => row.id === values[0])
        .map(row => ({ ...row, artist_name: row.full_name })));
      if (sql.startsWith('SELECT id, label_id, verified_at FROM soundpub.artists')) return result(state.memberships.filter(row => row.artist_user_id === values[0]));
      if (sql.startsWith('SELECT p.id, p.id AS')) {
        assert.match(sql, /a\.verified_at IS NOT NULL/);
        assert.match(sql, /ar\.tenant_id IS NULL AND ar\.verified_at IS NOT NULL/);
        return result(state.profiles.flatMap(profile => {
          const user = state.principals.find(row => row.id === profile.id)!;
          const actor = state.principals.find(row => row.id === values[0]);
          const roles = user.roles.filter(role => role === 'label' || role === 'whitelabel');
          const linked = actor?.roles.includes('artist') && state.memberships.some(row => row.artist_user_id === values[0] &&
            row.label_id === profile.id && row.verified_at !== null && state.profiles.find(item => item.id === values[0])?.parent_label_id === profile.id);
          if (!roles.length || (!values[1] && profile.id !== values[0] && !linked) ||
              (values[2] && profile.id <= String(values[2])) || (values[3] && user.status !== values[3]) ||
              (values[4] && !profile.full_name.toLowerCase().includes(String(values[4]).toLowerCase())) ||
              (values[5] && profile.id !== values[5])) return [];
          return [{ id: profile.id, ownerId: profile.id, full_name: profile.full_name,
            logo_url: null, logo_url_light: null, logo_url_dark: null, status: user.status, roles }];
        }).sort((a, b) => a.id.localeCompare(b.id)).slice(0, Number(values[6])));
      }
      if (sql.startsWith('SELECT a.id AS')) {
        assert.match(sql, /p\.parent_label_id = a\.label_id/);
        assert.match(sql, /r\.tenant_id IS NULL AND r\.verified_at IS NOT NULL/);
        return result(state.memberships.flatMap(row => {
          const profile = state.profiles.find(item => item.id === row.artist_user_id);
          const user = state.principals.find(item => item.id === row.artist_user_id);
          if (row.label_id !== values[0] || !row.verified_at || !profile || !user || profile.parent_label_id !== row.label_id ||
              !user.roles.includes('artist') || (values[1] && row.id <= String(values[1])) ||
              (values[2] && user.status !== values[2]) ||
              (values[3] && !(row.name + ' ' + profile.full_name).toLowerCase().includes(String(values[3]).toLowerCase()))) return [];
          return [{ membershipId: row.id, artistId: user.id, labelId: row.label_id, name: row.name, fullName: profile.full_name, status: user.status }];
        }).sort((a, b) => a.membershipId.localeCompare(b.membershipId)).slice(0, Number(values[4])));
      }
      if (sql.includes('FROM soundpub.releases WHERE artist_user_id')) return result([{ releases: 0, tracks: 0, royalties: 0 }]);
      if (sql.startsWith('UPDATE soundpub.profiles SET parent_label_id')) {
        assert.match(sql, /parent_label_id IS NOT DISTINCT FROM \$3::uuid AND parent_label_reference_id IS NULL/);
        const profile = state.profiles.find(row => row.id === values[0] && row.parent_label_id === values[2] && row.parent_label_reference_id === null);
        if (profile) profile.parent_label_id = values[1] as string | null;
        return result([], profile ? 1 : 0);
      }
      if (sql.startsWith('INSERT INTO soundpub.artists')) {
        const row = { id: id(20), artist_user_id: values[0] as string, label_id: values[1] as string, name: values[2] as string, verified_at: new Date() };
        state.memberships.push(row);
        return result([{ id: row.id }]);
      }
      if (sql.startsWith('UPDATE soundpub.artists SET label_id')) {
        state.memberships.find(row => row.id === values[0])!.label_id = values[1] as string;
        return result([], 1);
      }
      if (sql.startsWith('DELETE FROM soundpub.artists')) {
        state.memberships = state.memberships.filter(row => row.id !== values[0]);
        return result([], 1);
      }
      if (sql.startsWith('INSERT INTO soundpub.audit_logs')) {
        if (rejectAudit) throw new Error('Synthetic audit failure');
        state.audits.push({ actor: values[0] as string, action: values[1] as string, artist: values[2] as string,
          requestId: values[3] as string, metadata: JSON.parse(values[4] as string) });
        return result([], 1);
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() { released = true; },
  };
  const db = client as unknown as PoolClient;
  const pool = { connect: async () => db } as unknown as Pool;
  const principal = (userId: string) => state.principals.find(row => row.id === userId)!;
  const profile = (userId: string) => state.profiles.find(row => row.id === userId)!;
  return { state, queries, db, pool, principal, profile, service: createLabelsService(pool),
    rejectAudit: () => { rejectAudit = true; }, released: () => released };
}
const fails = (statusCode: number) => (error: unknown) => error instanceof ApiError && error.statusCode === statusCode;
const transfer = { labelId: otherLabel, expectedParentLabelId: label, confirmationPhrase: 'PINDAH LABEL' as const };

test('label contracts reject forged authority, malformed identifiers, unsafe history transfer and unbounded queries', () => {
  for (const value of [{}, { labelId: label }, { labelId: label, expectedParentLabelId: label },
    { labelId: 'bad', expectedParentLabelId: null }, { labelId: label, expectedParentLabelId: null, actorId: admin }]) {
    assert.equal(assignInput.safeParse(value).success, false);
  }
  for (const value of [{ ...transfer, confirmationPhrase: '' }, { ...transfer, royaltyTransferMode: 'transfer_all_history' },
    { ...transfer, expectedParentLabelId: null }, { ...transfer, actorId: admin }]) assert.equal(transferInput.safeParse(value).success, false);
  assert.equal(removeInput.safeParse({ expectedParentLabelId: null }).success, false);
  for (const value of [{ limit: '0' }, { limit: '101' }, { cursor: '' }, { status: 'deleted' }, { tenantId: label }, { search: ' ' }]) {
    assert.equal(rosterQuery.safeParse(value).success, false);
  }
});

test('label selector/detail scope follows current roles, verified parent membership and active default', async () => {
  const f = setup();
  assert.deepEqual((await f.service.list(f.principal(admin))).items.map(row => row.id), [label, otherLabel]);
  assert.deepEqual((await f.service.list(f.principal(label))).items.map(row => row.id), [label]);
  assert.deepEqual((await f.service.list(f.principal(artist))).items.map(row => row.id), [label]);
  assert.deepEqual((await f.service.list(f.principal(otherArtist))).items, []);
  const detail = await f.service.get(f.principal(artist), label);
  assert.equal(detail.ownerId, label);
  assert.deepEqual(detail.roles, ['label']);
  assert.equal(detail.logo_url_dark, null);
  await assert.rejects(f.service.get(f.principal(artist), otherLabel), fails(404));
  await assert.rejects(f.service.get(f.principal(label), otherLabel), fails(404));
  f.profile(otherArtist).parent_label_id = otherLabel;
  await assert.rejects(f.service.get(f.principal(otherArtist), otherLabel), fails(404));
  f.state.memberships[0]!.verified_at = null;
  assert.deepEqual((await f.service.list(f.principal(artist))).items, []);
  await assert.rejects(f.service.currentParent(f.principal(label), artist), fails(403));
  assert.equal((await f.service.currentParent(f.principal(artist), artist)).membershipId, null);
  f.state.principals.find(row => row.id === otherLabel)!.status = 'inactive';
  assert.deepEqual((await f.service.list(f.principal(admin))).items.map(row => row.id), [label]);
  assert.equal((await f.service.list(f.principal(admin), { status: 'inactive' })).items[0]?.id, otherLabel);
  assert.equal((await f.service.get(f.principal(admin), otherLabel)).status, 'inactive');
  const stale = { ...f.principal(admin) };
  f.state.principals.find(row => row.id === admin)!.roles = ['user'];
  assert.deepEqual((await f.service.list(stale)).items, []);
  await assert.rejects(f.service.get(stale, label), fails(404));
});

test('label selector pagination is bounded and binds cursor to actor and filter', async () => {
  const f = setup();
  const first = await f.service.list(f.principal(admin), { limit: '1' });
  assert.ok(first.nextCursor);
  const second = await f.service.list(f.principal(admin), { limit: '1', cursor: first.nextCursor });
  assert.equal(second.items[0]?.id, otherLabel);
  assert.equal(second.nextCursor, null);
  await assert.rejects(f.service.list(f.principal(label), { cursor: first.nextCursor }), fails(400));
  await assert.rejects(f.service.list(f.principal(admin), { cursor: first.nextCursor, status: 'inactive' }), fails(400));
  await assert.rejects(f.service.list(f.principal(admin), { cursor: 'garbage' }), fails(400));
});

test('roster and current parent require current DB roles and UUID-linked membership; defaults and names grant nothing', async () => {
  const f = setup();
  assert.equal((await f.service.roster(f.principal(label), label)).items[0]?.artistId, artist);
  assert.deepEqual(await f.service.currentParent(f.principal(label), artist), { artistId: artist, parentLabelId: label, membershipId });
  await assert.rejects(f.service.roster(f.principal(otherLabel), label), fails(403));
  await assert.rejects(f.service.currentParent(f.principal(otherLabel), artist), fails(403));
  await assert.rejects(f.service.roster(f.principal(artist), label), fails(403));
  f.profile(otherArtist).parent_label_id = label;
  f.state.memberships.push({ id: id(11), artist_user_id: null, label_id: label, name: 'Same Name', verified_at: null });
  assert.equal((await f.service.roster(f.principal(label), label)).items.length, 1);
  await assert.rejects(f.service.currentParent(f.principal(label), otherArtist), fails(403));
  assert.deepEqual(await f.service.currentParent(f.principal(otherArtist), otherArtist), {
    artistId: otherArtist, parentLabelId: label, membershipId: null,
  });
  const stale = { ...f.principal(label), roles: ['superadmin'] as Role[] };
  f.state.principals.find(row => row.id === label)!.roles = ['user'];
  await assert.rejects(f.service.roster(stale, label), fails(403));
  await assert.rejects(f.service.transfer(stale, artist, transfer, 'stale'), fails(403));
  f.state.principals.find(row => row.id === admin)!.status = 'suspended';
  await assert.rejects(f.service.currentParent({ id: admin, roles: ['admin'], status: 'active' }, artist), fails(403));
});

test('roster pagination binds cursors to label and filters; excludes non-artist rows and exposes no private fields', async () => {
  const f = setup();
  f.profile(otherArtist).parent_label_id = label;
  f.state.memberships.push({ id: id(11), artist_user_id: otherArtist, label_id: label, name: 'Other', verified_at: new Date() });
  const first = await f.service.roster(f.principal(admin), label, { limit: '1' });
  assert.ok(first.nextCursor);
  const second = await f.service.roster(f.principal(admin), label, { limit: '1', cursor: first.nextCursor });
  assert.equal(first.items[0]?.artistId, artist);
  assert.equal(second.items[0]?.artistId, otherArtist);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(Object.keys(first.items[0]!).sort(), ['artistId', 'fullName', 'labelId', 'membershipId', 'name', 'status']);
  await assert.rejects(f.service.roster(f.principal(admin), otherLabel, { cursor: first.nextCursor }), fails(400));
  await assert.rejects(f.service.roster(f.principal(admin), label, { cursor: first.nextCursor, search: 'Other' }), fails(400));
  for (const cursor of ['garbage', 'e30', '+++']) await assert.rejects(f.service.roster(f.principal(admin), label, { cursor }), fails(400));
  assert.equal((await f.service.roster(f.principal(admin), label, { search: "%' OR 1=1" })).items.length, 0);
  f.state.principals.find(row => row.id === otherArtist)!.roles = ['user'];
  assert.equal((await f.service.roster(f.principal(admin), label)).items.length, 1);
});

test('assign creates UUID membership and parent atomically; same-name legacy rows remain untouched', async () => {
  const f = setup();
  f.state.memberships.push({ id: id(11), artist_user_id: null, label_id: label, name: 'Same Name', verified_at: null });
  const result = await f.service.assign(f.principal(admin), otherArtist, { labelId: label, expectedParentLabelId: null }, 'assign');
  assert.deepEqual(result, { artistId: otherArtist, parentLabelId: label, membershipId: id(20), changed: true });
  assert.equal(f.profile(otherArtist).parent_label_id, label);
  assert.equal(f.state.memberships.find(row => row.id === id(11))?.artist_user_id, null);
  assert.equal(f.state.audits[0]?.action, 'label.artist_assigned');
  await assert.rejects(f.service.assign(f.principal(admin), otherArtist, { labelId: otherLabel, expectedParentLabelId: null }, 'repeat'), fails(409));
  assert.ok(f.released());
});

test('transfer preserves stable membership ID, moves operational visibility, checks expected parent and audits together', async () => {
  const f = setup();
  const result = await f.service.transfer(f.principal(admin), artist, transfer, 'transfer');
  assert.deepEqual(result, { artistId: artist, parentLabelId: otherLabel, membershipId, changed: true, affected: { releases: 0, tracks: 0, royalties: 0 } });
  assert.equal(f.profile(artist).parent_label_id, otherLabel);
  assert.equal(f.state.memberships[0]?.label_id, otherLabel);
  assert.equal((await f.service.roster(f.principal(label), label)).items.length, 0);
  assert.equal((await f.service.roster(f.principal(otherLabel), otherLabel)).items[0]?.artistId, artist);
  await assert.rejects(f.service.currentParent(f.principal(label), artist), fails(403));
  assert.equal(f.state.audits[0]?.requestId, 'transfer');
  assert.equal(f.state.audits[0]?.metadata.royaltyTransferMode, 'keep_old_label');
  await assert.rejects(f.service.transfer(f.principal(admin), artist, transfer, 'stale'), fails(409));
  const unchanged = await f.service.transfer(f.principal(admin), artist, { ...transfer, expectedParentLabelId: otherLabel }, 'no-op');
  assert.equal(unchanged.changed, false);
  assert.equal(f.state.audits.length, 1);
  assert.equal(f.queries.filter(sql => sql.includes('FROM soundpub.releases WHERE artist_user_id')).length, 1);
  assert.ok(f.queries.every(sql => !/^(?:UPDATE|DELETE) soundpub\.(?:releases|tracks|royalty_import_entries)/.test(sql)));
});

test('transfer rejects default-only or historical parents, invalid destinations and protected targets', async () => {
  for (const scenario of ['missingMembership', 'unverifiedMembership', 'historical', 'inactiveLabel', 'wrongRole', 'selfLabel', 'protected'] as const) {
    const f = setup();
    let destination = otherLabel;
    if (scenario === 'missingMembership') f.state.memberships = [];
    if (scenario === 'unverifiedMembership') f.state.memberships[0]!.verified_at = null;
    if (scenario === 'historical') { f.profile(artist).parent_label_id = null; f.profile(artist).parent_label_reference_id = id(99); }
    if (scenario === 'inactiveLabel') f.state.principals.find(row => row.id === otherLabel)!.status = 'inactive';
    if (scenario === 'wrongRole') f.state.principals.find(row => row.id === otherLabel)!.roles = ['user'];
    if (scenario === 'selfLabel') destination = artist;
    if (scenario === 'protected') f.state.principals.find(row => row.id === artist)!.roles = ['artist', 'admin'];
    await assert.rejects(f.service.transfer(f.principal(admin), artist, { ...transfer, labelId: destination }, scenario),
      fails(['missingMembership', 'unverifiedMembership', 'historical'].includes(scenario) ? 409 : scenario === 'protected' ? 403 : 400));
    assert.equal(f.state.audits.length, 0);
  }
  const f = setup();
  await assert.rejects(f.service.transfer(f.principal(label), artist, transfer, 'owner-cannot-transfer'), fails(403));
  await assert.rejects(f.service.assign(f.principal(label), otherArtist, { labelId: label, expectedParentLabelId: null }, 'owner-cannot-claim'), fails(403));
});

test('audit failure rolls back parent and membership; transaction-bound API leaves transaction control to artist caller', async () => {
  const f = setup();
  const before = structuredClone(f.state);
  f.rejectAudit();
  await assert.rejects(f.service.transfer(f.principal(admin), artist, transfer, 'rollback'), /Synthetic audit failure/);
  assert.deepEqual(f.state, before);
  assert.equal(f.queries.at(-1), 'ROLLBACK');
  assert.ok(f.released());
  const g = setup();
  await labelsInTransaction(g.db).transfer(g.principal(admin), artist, transfer, 'artist-transaction');
  assert.ok(!g.queries.some(sql => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)));
  assert.equal(g.released(), false);
});

test('removal preserves history and denies unrelated labels or failing optional guard', async () => {
  const f = setup();
  const input = { expectedParentLabelId: label };
  await assert.rejects(f.service.remove(f.principal(otherLabel), artist, input, 'unrelated'), fails(403));
  const blocked = createLabelsService(f.pool, { assertCanRemove: async () => { throw new ApiError(409, 'CONFLICT'); } });
  await assert.rejects(blocked.remove(f.principal(label), artist, input, 'blocked'), fails(409));
  assert.equal(f.profile(artist).parent_label_id, label);
  assert.equal(f.state.memberships.length, 1);
  let checked = false;
  const service = createLabelsService(f.pool, { assertCanRemove: async (db, artistId) => {
    assert.equal(db, f.db);
    assert.equal(artistId, artist);
    assert.equal(f.profile(artist).parent_label_id, label);
    checked = true;
  } });
  assert.deepEqual(await service.remove(f.principal(label), artist, input, 'remove'), {
    artistId: artist, parentLabelId: null, membershipId: null, changed: true,
  });
  assert.ok(checked);
  assert.equal(f.state.memberships.length, 0);
  assert.equal(f.state.audits[0]?.action, 'label.artist_removed');
});


