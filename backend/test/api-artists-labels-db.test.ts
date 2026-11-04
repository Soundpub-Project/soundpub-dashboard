import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import { createPool, migrate } from '../src/db/index.js';
import { createArtistsService } from '../src/artists/index.js';
import { createLabelsService } from '../src/labels/index.js';
import type { Principal } from '../src/auth/index.js';

const ownerUrl = process.env.ARTISTS_DB_TEST_URL;
const runtimeUrl = process.env.ARTISTS_DB_RUNTIME_URL;
test('Phase 3B API, migration, restricted login, roster and transfer use disposable PostgreSQL',
  { skip: !ownerUrl }, async () => {
    assert.ok(runtimeUrl, 'ARTISTS_DB_RUNTIME_URL required');
    for (const value of [ownerUrl!, runtimeUrl!]) {
      const url = new URL(value);
      assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
      assert.match(url.pathname, /^\/soundpub_test_artists[a-zA-Z0-9_]*$/);
      assert.equal(url.search, '');
    }
    const owner = createPool({ connectionString: ownerUrl });
    const runtime = createPool({ connectionString: runtimeUrl });
    const ids = ['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102',
      '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000104'] as const;
    const [labelA, labelB, admin, outsider] = ids;
    const principals = new Map<string, Principal>([
      ['labelA', { id: labelA, roles: ['label'], status: 'active' }],
      ['labelB', { id: labelB, roles: ['label'], status: 'active' }],
      ['admin', { id: admin, roles: ['admin'], status: 'active' }],
      ['outsider', { id: outsider, roles: ['user'], status: 'active' }],
    ]);
    const app = buildApp({ artists: createArtistsService(runtime), labels: createLabelsService(runtime),
      auth: { authenticate: async token => principals.get(token) ?? null },
      readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
      admin: { suspendUser: async () => {} }, webhooks: { receive: async () => false } });
    const request = (token: string, method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object) => app.inject({
      url: `/api/v1${path}`, method, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}),
    });
    try {
      await owner.query('DROP SCHEMA IF EXISTS soundpub CASCADE');
      assert.ok((await migrate(owner)).includes('0007_artists_labels.sql'));
      assert.deepEqual(await migrate(owner), []);
      for (const [index, id] of ids.entries()) {
        await owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
        await owner.query('INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,$2)', [id, `Synthetic ${index}`]);
        await owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())',
          [id, index < 2 ? 'label' : index === 2 ? 'admin' : 'user']);
      }
      assert.equal((await runtime.query('SELECT current_user')).rows[0].current_user, 'soundpub_app');
      await assert.rejects(runtime.query('CREATE TABLE soundpub.unsafe(id integer)'), /permission denied/);
      assert.equal((await request('outsider', 'POST', '/artists', { artist_name: 'No' })).statusCode, 403);
      const created = await request('labelA', 'POST', '/artists', { artist_name: 'Synthetic Artist', genre: 'pop' });
      assert.equal(created.statusCode, 200, created.body);
      const artist = created.json();
      assert.equal(artist.label_user_id, labelA);
      assert.equal((await request('labelA', 'GET', `/labels/${labelA}/artists`)).json().items[0].artistId, artist.id);
      assert.equal((await request('outsider', 'GET', `/artists/${artist.id}`)).statusCode, 404);
      assert.equal((await request('outsider', 'PATCH', `/artists/${artist.id}`, { artist_name: 'Forged' })).statusCode, 404);
      assert.equal((await request('admin', 'POST', `/artists/${artist.id}/transfer`, {
        labelId: labelB, expectedParentLabelId: labelA, confirmationPhrase: 'PINDAH LABEL', royaltyTransferMode: 'keep_old_label',
      })).statusCode, 200);
      assert.equal((await request('labelA', 'GET', `/labels/${labelA}/artists`)).json().items.length, 0);
      assert.equal((await request('labelB', 'GET', `/labels/${labelB}/artists`)).json().items[0].artistId, artist.id);
      assert.equal((await request('admin', 'POST', `/artists/${artist.id}/transfer`, {
        labelId: labelA, expectedParentLabelId: labelA, confirmationPhrase: 'PINDAH LABEL',
      })).statusCode, 409);
      assert.equal((await request('labelB', 'POST', `/artists/${artist.id}/remove`, { expectedParentLabelId: labelB })).statusCode, 200);
      assert.equal((await owner.query('SELECT parent_label_id FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].parent_label_id, null);
      assert.equal((await owner.query("SELECT count(*)::int AS count FROM soundpub.audit_logs WHERE action IN ('artist.created','label.artist_transferred')")).rows[0].count, 2);
    } finally { await app.close(); await runtime.end(); await owner.query('DROP SCHEMA IF EXISTS soundpub CASCADE'); await owner.end(); }
  });


