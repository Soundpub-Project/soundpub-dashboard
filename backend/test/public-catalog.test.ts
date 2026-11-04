import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import { createPublicCatalogService } from '../src/public-catalog/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('anonymous catalog filters states, projects safe fields and validates paging on disposable PostgreSQL', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async () => {
  const database = await concurrencyPostgres();
  const app = buildApp({ publicCatalog: createPublicCatalogService(database.runtime),
    auth: { authenticate: async () => { throw new Error('Public route authenticated'); } },
    readiness: { check: async () => true }, admin: { suspendUser: async () => {} },
    webhooks: { receive: async () => false }, rateLimiter: { consume: async () => ({ allowed: true }) } });
  try {
    const label = '00000000-0000-4000-8000-000000000901';
    const artistUser = '00000000-0000-4000-8000-000000000902';
    await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [label]);
    await database.owner.query("INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,'Synthetic Label')", [label]);
    await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [artistUser]);
    await database.owner.query("INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES ($1,'Synthetic Artist',$2)", [artistUser,label]);
    await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'artist',now())", [artistUser]);
    const artistId = (await database.owner.query(`INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at)
      VALUES($1,$2,'Synthetic Artist',now()) RETURNING id`, [label,artistUser])).rows[0].id;
    const hidden: string[] = [];
    let visible = '';
    for (const status of ['draft', 'pending', 'pending_paid', 'processing', 'active', 'rejected', 'revision_submitted', 'inactive']) {
      const result = await database.owner.query(`INSERT INTO soundpub.releases(label_id,artist_id,artist_user_id,title,artist_name,status,genre,cover_url)
        VALUES ($1,$2,$3,$4,'Synthetic Artist',$4,'Jazz','https://private.invalid/secret') RETURNING id`, [label,artistId,artistUser,status]);
      const id = result.rows[0].id;
      if (status === 'active') visible = id; else hidden.push(id);
    }
    const archived = await database.owner.query(`INSERT INTO soundpub.releases(label_id,artist_id,artist_user_id,title,artist_name,status,archived_at)
      VALUES ($1,$2,$3,'Archived','Artist','active',now()) RETURNING id`, [label,artistId,artistUser]);
    hidden.push(archived.rows[0].id, '00000000-0000-4000-8000-000000000999');
    await database.owner.query(`INSERT INTO soundpub.tracks(release_id,title,artist_name,position,audio_url,clip_url,lyrics,duration)
      VALUES ($1,'Public Song','Artist',1,'private audio','private clip','private lyrics',42)`, [visible]);
    const response = await app.inject('/api/v1/public/releases');
    assert.equal(response.statusCode, 200, response.body);
    const page = response.json();
    assert.equal(page.pagination.total, 1);
    assert.equal(page.data[0].id, visible);
    const detail = await app.inject(`/api/v1/public/releases/${visible}`);
    assert.equal(detail.statusCode, 200, detail.body);
    assert.deepEqual(detail.json(), page.data[0]);
    assert.deepEqual(Object.keys(detail.json()).sort(), ['id','title','artist_name','genre','release_type','release_date','upc','cover_url','label','tracks'].sort());
    assert.deepEqual(detail.json().label, { full_name: 'Synthetic Label' });
    assert.equal(detail.json().cover_url, null);
    assert.equal(detail.json().tracks[0].audio_url, null);
    assert.equal(detail.json().tracks[0].clip_url, null);
    assert.equal(detail.json().tracks[0].duration, 42);
    assert.deepEqual(Object.keys(detail.json().tracks[0]).sort(),
      ['id','title','artist_name','isrc','genre','duration','explicit_lyrics','audio_url','clip_url'].sort());
    for (const id of hidden) assert.equal((await app.inject(`/api/v1/public/releases/${id}`)).statusCode, 404);
    for (const query of ['limit=0','limit=101','limit=-1','offset=-1','offset=1000000','status=draft','search=' + 'x'.repeat(201)]) {
      assert.equal((await app.inject(`/api/v1/public/releases?${query}`)).statusCode, 400, query);
    }
    for (const query of ['search=absent','genre=Rock',"search=%27%20OR%201%3D1--"]) {
      assert.equal((await app.inject(`/api/v1/public/releases?${query}`)).json().pagination.total, 0);
    }
    const beyond = (await app.inject('/api/v1/public/releases?limit=1&offset=1')).json();
    assert.equal(beyond.pagination.total, 1);
    assert.deepEqual(beyond.data, []);
    assert.equal(beyond.pagination.hasMore, false);
    assert.equal((await app.inject('/api/v1/public/releases/not-uuid')).statusCode, 400);
    assert.deepEqual((await app.inject('/openapi.json')).json().paths['/api/v1/public/releases'].get.security, []);
  } finally { await app.close(); await database.close(); }
});
