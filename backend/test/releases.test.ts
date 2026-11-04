import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { ApiError } from '../src/api/types.js';
import type { Principal, Role } from '../src/auth/index.js';
import { createReleasesService, releaseCreate, releasePatch, releaseDto,
  type ReleaseDto, type ReleaseStatus } from '../src/releases/index.js';

const labelId = '00000000-0000-4000-8000-000000000001';
const artistId = '00000000-0000-4000-8000-000000000002';
const releaseId = '00000000-0000-4000-8000-000000000003';
const otherId = '00000000-0000-4000-8000-000000000004';
const principal = (id: string, roles: Role[]): Principal => ({ id, roles, status: 'active' });
const label = principal(labelId, ['label']);
const artist = principal(artistId, ['artist']);
const admin = principal(otherId, ['admin']);
const fail = (status: number) => (error: unknown) => error instanceof ApiError && error.statusCode === status;
const row: ReleaseDto = {
  id: releaseId, artist_id: null, label_id: labelId, label_name: 'Historic Label', artist_user_id: artistId, created_by: labelId,
  title: 'Synthetic', artist_name: 'Artist', release_type: 'single', genre: null, release_date: null,
  cover_url: 'https://example.invalid/synthetic-cover.png', upc: null, status: 'draft', rejection_reason: null, archived_at: null, version: 1,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};
const input = { title: 'Synthetic', artist_name: 'Artist', release_type: 'single' as const, artist_user_id: artistId };

function fixture(current: Principal = label, options: {
  currentLabel?: string | null; status?: ReleaseStatus; auditFailure?: boolean; conflict?: boolean;
  targetRoles?: Role[]; missing?: boolean; orphan?: boolean; listRows?: ReleaseDto[];
} = {}) {
  const queries: { sql: string; values: unknown[] }[] = [];
  let state = { ...row, status: options.status ?? row.status, artist_user_id: options.orphan ? null : artistId };
  let snapshot = { ...state };
  let released = false;
  const client = {
    async query(sql: string, values: unknown[] = []) {
      queries.push({ sql, values });
      let rows: unknown[] = [];
      if (sql === 'BEGIN') snapshot = { ...state };
      if (sql === 'ROLLBACK') state = { ...snapshot };
      if (sql.includes('AS missing_audio')) rows = [{ count: 1, missing_audio: 0 }];
      if (sql.includes('SELECT id, status FROM soundpub.backend_users')) {
        rows = [current, ...(current.id === artistId ? [] : [principal(artistId, options.targetRoles ?? ['artist'])])]
          .filter(user => (values[0] as string[]).includes(user.id)).map(({ id, status }) => ({ id, status }));
      } else if (sql.includes('SELECT user_id, role')) {
        rows = [current, ...(current.id === artistId ? [] : [principal(artistId, options.targetRoles ?? ['artist'])])]
          .filter(user => (values[0] as string[]).includes(user.id))
          .flatMap(user => user.roles.map(role => ({ user_id: user.id, role })));
      } else if (sql.startsWith('SELECT role FROM soundpub.user_roles')) rows = (options.targetRoles ?? ['artist']).map(role => ({ role }));
      else if (sql.startsWith('SELECT id, artist_user_id, management_mode')) rows = [{ id: otherId, artist_user_id: artistId, management_mode: 'LOGIN_ACCOUNT' }];
      else if (sql.startsWith('SELECT id, artist_user_id, label_id, management_mode,')) rows = [{ id: otherId, artist_user_id: artistId, management_mode: 'LOGIN_ACCOUNT', label_custom_unit_id: null }];
      else if (sql.startsWith('SELECT u.id, ap.id')) rows = [{ id: artistId,
        label_user_id: options.currentLabel === undefined ? labelId : options.currentLabel }];
      else if (sql.startsWith('SELECT r.id')) rows = options.missing ? [] : sql.includes('ORDER BY r.id') ? options.listRows ?? [state] : [state];
      else if (sql.startsWith('INSERT INTO soundpub.releases')) {
        state = { ...row, id: values[0] as string, label_id: values[1] as string | null,
          created_by: values[3] as string, status: values[11] as ReleaseStatus };
      } else if (sql.startsWith('UPDATE soundpub.releases')) {
        if (options.conflict) return { rows: [], rowCount: 0 };
        const assignments = [...sql.matchAll(/(\w+)=\$(\d+)/g)].filter(([, key]) => key !== 'id' && key !== 'version');
        for (const [, key, index] of assignments) Object.assign(state, { [key!]: values[Number(index) - 1] });
        state.version++;
        rows = [{ id: state.id }];
      } else if (sql.startsWith('INSERT INTO soundpub.audit_logs') && options.auditFailure) throw new Error('synthetic audit failure');
      return { rows, rowCount: rows.length };
    },
    release() { released = true; },
  };
  return { service: createReleasesService({ connect: async () => client } as unknown as Pool), queries,
    state: () => state, released: () => released };
}

test('strict contracts protect history, payment and server fields', () => {
  for (const value of [{}, { version: 1 }, { version: 0, title: 'Title' }, { version: 1, title: ' ' },
    { version: 1, label_id: otherId }, { version: 1, artist_user_id: otherId }, { version: 1, created_by: otherId },
    { version: 1, owner_user_id: otherId }, { version: 1, refund: true }, { version: 1, id: otherId },
    { version: 1, cover_url: 'https://user:secret@example.test/a' }, { version: 1, release_date: '2026-02-30' },
    { version: 1, status: 'paid' }, { version: 1, upc: 'invalid' }]) assert.equal(releasePatch.safeParse(value).success, false);
  for (const value of [{ ...input, label_id: labelId }, { ...input, created_by: otherId },
    { ...input, status: 'pending_paid' }, { ...input, version: 1 }]) assert.equal(releaseCreate.safeParse(value).success, false);
  assert.deepEqual(releaseDto.parse(row), row);
});

test('invalid input fails before transaction; stale DB status overrides supplied actor', async () => {
  const f = fixture();
  await assert.rejects(f.service.get(label, 'invalid'), fail(400));
  await assert.rejects(f.service.update(label, releaseId, { title: 'Title' } as never, 'request'), fail(400));
  assert.equal(f.queries.length, 0);
  const stale = fixture({ ...label, status: 'suspended' });
  await assert.rejects(stale.service.get(label, releaseId), fail(403));
  assert.equal(stale.queries.at(-1)?.sql, 'ROLLBACK');
  assert.equal(stale.released(), true);
});

test('current roster grants access; historical owner and creator never grant access', async () => {
  for (const currentLabel of [null, otherId]) {
    const old = fixture(label, { currentLabel });
    await assert.rejects(old.service.get(label, releaseId), fail(404));
    await assert.rejects(old.service.update(label, releaseId, { version: 1, title: 'Denied' }, 'request'), fail(404));
    assert.equal(old.queries.some(query => query.sql.startsWith('UPDATE soundpub.releases')), false);
  }
  const transferred = fixture(principal(otherId, ['label']), { currentLabel: otherId });
  const result = await transferred.service.update(principal(otherId, ['label']), releaseId, { version: 1, title: 'New' }, 'request');
  assert.equal(result.label_id, labelId);
  assert.equal(result.created_by, labelId);
  assert.equal(result.version, 2);
  const write = transferred.queries.find(query => query.sql.startsWith('UPDATE soundpub.releases'))!;
  assert.doesNotMatch(write.sql, /label_id=|artist_user_id=|created_by=/);
  assert.match(write.sql, /WHERE id=\$1 AND version=\$2/);
});

test('DB role revocation, protected artist hierarchy, and orphan references fail closed', async () => {
  const revoked = fixture(principal(labelId, ['user']));
  await assert.rejects(revoked.service.get(label, releaseId), fail(404));
  const protectedArtist = fixture(admin, { targetRoles: ['artist', 'admin'] });
  await assert.rejects(protectedArtist.service.update(admin, releaseId, { version: 1, title: 'No' }, 'request'), fail(404));
  const orphan = fixture(label, { orphan: true });
  await assert.rejects(orphan.service.get(label, releaseId), fail(404));
  assert.equal((await fixture(admin, { orphan: true }).service.get(admin, releaseId)).id, releaseId);
  assert.equal((await fixture(artist, { currentLabel: null }).service.get(artist, releaseId)).id, releaseId);
});

test('create derives historic owner from locked roster and audits transactionally', async () => {
  const f = fixture(principal(otherId, ['label']), { currentLabel: otherId });
  const created = await f.service.create(principal(otherId, ['label']), input, 'request');
  assert.equal(created.label_id, otherId);
  assert.equal(created.created_by, otherId);
  assert.equal(created.version, 1);
  assert.equal(created.status, 'draft');
  const audit = f.queries.find(query => query.sql.startsWith('INSERT INTO soundpub.audit_logs'))!;
  assert.match(audit.sql, /'release'/);
  assert.equal(audit.values[1], 'release.created');
  assert.equal(f.queries.at(-1)?.sql, 'COMMIT');
});

test('optimistic version mismatch and conditional update race both roll back', async () => {
  for (const conflict of [false, true]) {
    const f = fixture(label, { conflict });
    await assert.rejects(f.service.update(label, releaseId, { version: conflict ? 1 : 2, title: 'No' }, 'request'), fail(409));
    assert.equal(f.queries.at(-1)?.sql, 'ROLLBACK');
    assert.equal(f.queries.some(query => query.sql.startsWith('INSERT INTO soundpub.audit_logs')), false);
    assert.equal(f.state().version, 1);
  }
});

test('audit failure rolls back mutation and releases client', async () => {
  const f = fixture(label, { auditFailure: true });
  await assert.rejects(f.service.update(label, releaseId, { version: 1, title: 'New' }, 'request'), /synthetic audit failure/);
  assert.equal(f.state().title, row.title);
  assert.equal(f.state().version, 1);
  assert.equal(f.queries.at(-1)?.sql, 'ROLLBACK');
  assert.equal(f.released(), true);
});

test('frontend transitions allow review, rejection and archive but not submission bypasses', async () => {
  for (const [from, to, actor] of [
    ['pending_paid', 'processing', admin], ['revision_submitted', 'processing', admin],
    ['processing', 'rejected', admin], ['active', 'inactive', admin],
  ] as const) {
    const f = fixture(actor, { status: from });
    const result = await f.service.update(actor, releaseId, { version: 1, status: to,
      ...(to === 'rejected' ? { rejection_reason: 'Synthetic reason' } : {}) }, 'request');
    assert.equal(result.status, to);
    assert.equal(result.version, 2);
  }
  for (const [from, to, actor] of [
    ['draft', 'pending', label], ['rejected', 'revision_submitted', artist], ['inactive', 'pending', admin],
  ] as const) {
    await assert.rejects(fixture(actor, { status: from }).service.update(actor, releaseId,
      { version: 1, status: to }, 'request'), fail(409));
  }
});

test('payment bypasses, unsupported jumps, activation and customer paid edits deny', async () => {
  for (const [from, to] of [['pending', 'pending_paid'], ['draft', 'active'], ['rejected', 'processing'], ['processing', 'active']] as const) {
    const f = fixture(admin, { status: from });
    await assert.rejects(f.service.update(admin, releaseId, { version: 1, status: to }, 'request'), fail(409));
  }
  for (const status of ['pending_paid', 'processing', 'active', 'revision_submitted', 'inactive'] as const) {
    const f = fixture(label, { status });
    await assert.rejects(f.service.update(label, releaseId, { version: 1, title: 'No' }, 'request'), fail(403));
  }
  await assert.rejects(fixture(admin, { status: 'processing' }).service.update(admin, releaseId,
    { version: 1, status: 'rejected' }, 'request'), fail(400));
  await assert.rejects(fixture(admin, { status: 'pending_paid' }).service.update(admin, releaseId,
    { version: 1, title: 'Paid metadata locked' }, 'request'), fail(403));
  await assert.rejects(fixture(admin, { status: 'pending_paid' }).service.update(admin, releaseId,
    { version: 1, status: 'processing', upc: '123456789012' }, 'request'), fail(403));
});

test('delete stays fail closed for every legacy status and admin; never deletes or refunds', async () => {
  for (const status of ['draft', 'pending', 'pending_paid', 'processing', 'active', 'rejected', 'revision_submitted', 'inactive'] as const) {
    const f = fixture(admin, { status });
    await assert.rejects(f.service.delete(admin, releaseId, 'request'), fail(409));
    assert.equal(f.queries.at(-1)?.sql, 'ROLLBACK');
    assert.equal(f.queries.some(query => /^(DELETE|UPDATE|INSERT)/.test(query.sql)), false);
  }
});

test('list uses DB privileges and verified current roster, binds filters and scopes cursor', async () => {
  const f = fixture(label, { listRows: [row, { ...row, id: otherId }] });
  const page = await f.service.list(label, { limit: '1', search: 'Synthetic', status: 'draft' });
  assert.equal(page.items.length, 1);
  assert.ok(page.nextCursor);
  const query = f.queries.find(query => query.sql.includes('ORDER BY r.id'))!;
  assert.deepEqual(query.values.slice(0, 6), [labelId, false, true, false, 'Synthetic', 'draft']);
  assert.match(query.sql, /p.parent_label_id=a.label_id/);
  assert.match(query.sql, /a.verified_at IS NOT NULL/);
  assert.doesNotMatch(query.sql, /r.label_id=\$1|r.created_by=\$1/);
  await f.service.list(label, { limit: '1', search: 'Synthetic', status: 'draft', cursor: page.nextCursor });
  for (const value of [{ cursor: page.nextCursor }, { cursor: 'invalid!' }]) {
    await assert.rejects(f.service.list(label, value), fail(400));
  }
  const stale = fixture(principal(labelId, ['user']));
  await stale.service.list(label);
  assert.deepEqual(stale.queries.find(query => query.sql.includes('ORDER BY r.id'))!.values.slice(1, 4), [false, false, false]);
});

// Docker-free PIC integration at repository boundary, including fresh authority and locks.
import { createTracksService } from '../src/tracks/index.js';
const catalogId = '00000000-0000-4000-8000-000000000010';
const unitId = '00000000-0000-4000-8000-000000000011';
function customFixture(options: { role?: Role; status?: Principal['status']; owner?: string; archivedUnit?: boolean;
  archivedArtist?: boolean; auditFailure?: boolean; reviewer?: 'admin' | 'superadmin' } = {}) {
  const queries: string[] = [];
  const identity = { id: catalogId, artist_user_id: null, label_id: options.owner ?? labelId,
    label_custom_unit_id: unitId, management_mode: 'LABEL_CUSTOM_MANAGED', verified_at: options.archivedArtist ? null : '2026-01-01' };
  let stored = { ...row, artist_id: catalogId, artist_user_id: null };
  const client = { release() {}, async query(sql: string, values: unknown[] = []) {
    queries.push(sql);
    let rows: unknown[] = [];
    if (sql.includes('SELECT id, status FROM soundpub.backend_users')) rows = [
      { id: labelId, status: options.status ?? 'active' },
      ...(options.reviewer ? [{ id: otherId, status: 'active' }] : []),
    ];
    else if (sql.includes('SELECT user_id, role')) rows = [
      { user_id: labelId, role: options.role ?? 'label_custom' },
      ...(options.reviewer ? [{ user_id: otherId, role: options.reviewer }] : []),
    ];
    else if (sql.startsWith('SELECT id, artist_user_id')) rows = [identity];
    else if (sql.startsWith('SELECT id, status FROM soundpub.label_custom_units')) rows = options.owner && options.owner !== labelId ? [] : [{ id: unitId, status: options.archivedUnit ? 'archived' : 'active' }];
    else if (sql.startsWith('SELECT r.id')) rows = sql.includes('ORDER BY r.id') ? [stored] : [stored];
    else if (sql.startsWith('INSERT INTO soundpub.releases')) stored = { ...stored, id: values[0] as string };
    else if (sql.startsWith('UPDATE soundpub.releases')) { stored = { ...stored, version: stored.version + 1 }; rows = [{ id: stored.id }]; }
    else if (sql.startsWith('INSERT INTO soundpub.audit_logs') && options.auditFailure) throw new Error('synthetic audit failure');
    return { rows, rowCount: rows.length };
  } };
  const pool = { connect: async () => client } as unknown as Pool;
  return { releases: createReleasesService(pool), tracks: createTracksService(pool), queries };
}
const pic = principal(labelId, ['label_custom']);
const customInput = { title: 'Custom', artist_name: 'Catalog', release_type: 'single' as const, artist_id: catalogId };
test('canonical create accepts PIC catalog identity, rejects mixed identities and missing identity', async () => {
  const f = customFixture();
  const result = await f.releases.create(pic, customInput, 'custom-create');
  assert.equal(result.artist_id, catalogId);
  assert.equal(result.artist_user_id, null);
  assert.equal(result.label_id, labelId);
  assert.ok(f.queries.some(sql => sql.includes('label_custom_units') && sql.includes('FOR UPDATE')));
  assert.ok(f.queries.some(sql => sql.includes('artists WHERE id=$1 FOR UPDATE')));
  assert.equal(f.queries.at(-1), 'COMMIT');
  await assert.rejects(f.releases.create(pic, { ...customInput, artist_user_id: artistId }, 'mismatch'), fail(400));
  await assert.rejects(f.releases.create(pic, { title: 'No', artist_name: 'No', release_type: 'single' }, 'missing'), fail(400));
});
test('PIC release and track authority rejects cross-unit, archived writes and stale role/status', async () => {
  for (const options of [{ owner: otherId }, { archivedUnit: true }, { role: 'user' as const },
    { role: 'admin' as const }, { archivedArtist: true }, { status: 'suspended' as const }]) {
    const f = customFixture(options);
    const status = options.status ? 403 : 404;
    await assert.rejects(f.releases.create(pic, customInput, 'denied'), fail(status));
    await assert.rejects(f.tracks.create(pic, releaseId, { title: 'Song', artist_name: 'Catalog', release_version: 1 }, 'denied'), fail(status));
    assert.equal(f.queries.some(sql => sql.startsWith('INSERT INTO soundpub.releases') || sql.startsWith('INSERT INTO soundpub.tracks')), false);
    assert.equal(f.queries.at(-1), 'ROLLBACK');
  }
  assert.equal((await customFixture({ archivedArtist: true }).releases.get(pic, releaseId)).artist_id, catalogId);
  assert.equal((await customFixture().tracks.list(pic, releaseId)).release_version, 1);
});
test('admin can review a hierarchy-valid custom release without becoming its owner', async () => {
  const f = customFixture({ reviewer: 'admin' });
  const reviewed = await f.releases.get(principal(otherId, ['admin']), releaseId);
  assert.equal(reviewed.artist_id, catalogId);
  assert.equal(reviewed.label_id, labelId);
  assert.ok(f.queries.some(sql => sql.includes('label_custom_units') && sql.includes('FOR SHARE')));
});
test('PIC audit failure rolls back canonical release creation', async () => {
  const f = customFixture({ auditFailure: true });
  await assert.rejects(f.releases.create(pic, customInput, 'audit-fail'), /synthetic audit failure/);
  assert.equal(f.queries.at(-1), 'ROLLBACK');
});

test('PIC archives release without deleting tracks or changing identity', async () => {
  const f = customFixture();
  await f.releases.update(pic, releaseId, { version: 1, status: 'inactive', archived_at: '2026-11-03T00:00:00Z' }, 'archive');
  assert.equal(f.queries.at(-1), 'COMMIT');
  assert.equal(f.queries.some(sql => sql.startsWith('DELETE')), false);
});
