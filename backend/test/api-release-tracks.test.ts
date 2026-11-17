import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import { createReleasesService } from '../src/releases/index.js';
import { createTracksService } from '../src/tracks/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

const label = '00000000-0000-4000-8000-000000000201';
const artist = '00000000-0000-4000-8000-000000000202';
const outsider = '00000000-0000-4000-8000-000000000203';

test('Phase 3C HTTP routes use restricted disposable PostgreSQL and reject forged/stale writes', { skip: process.env.RUN_DOCKER_TESTS !== '1' }, async () => {
  const database = await concurrencyPostgres();
  const actors = new Map([
    ['label', { id: label, roles: ['label'] as const, status: 'active' as const }],
    ['artist', { id: artist, roles: ['artist'] as const, status: 'active' as const }],
    ['outsider', { id: outsider, roles: ['user'] as const, status: 'active' as const }],
  ]);
  const app = buildApp({ releases: createReleasesService(database.runtime), tracks: createTracksService(database.runtime),
    auth: { authenticate: async token => actors.get(token) ?? null }, readiness: { check: async () => true },
    rateLimiter: { consume: async () => ({ allowed: true }) }, admin: { suspendUser: async () => {} },
    webhooks: { receive: async () => false } });
  const call = (token: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: { authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}) });
  try {
    for (const [id, role] of [[label, 'label'], [artist, 'artist'], [outsider, 'user']]) {
      await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
      await database.owner.query('INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES ($1,$2,$3)',
        [id, id === label ? 'SoundPub Music Ecosystem' : `Synthetic ${role}`, id === artist ? label : null]);
      await database.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,$2,now())', [id, role]);
    }
    await database.owner.query('INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES ($1,$2,$3,now())', [label, artist, 'Synthetic Artist']);
    assert.equal((await app.inject('/api/v1/releases')).statusCode, 401);
    assert.equal((await call('artist', 'GET', '/releases/custom-label-eligibility')).json().eligible, true);
    assert.equal((await call('label', 'GET', '/releases/custom-label-eligibility')).json().eligible, false);
    assert.equal((await call('label', 'POST', '/releases', { title: 'Invalid', artist_name: 'Artist', artist_user_id: outsider, release_type: 'single' })).statusCode, 404);
    const created = await call('label', 'POST', '/releases', { title: 'Synthetic Release', artist_name: 'Synthetic Artist', artist_user_id: artist, release_type: 'single', status: 'draft' });
    assert.equal(created.statusCode, 200, created.body);
    const release = created.json();
    assert.equal(release.label_id, label);
    assert.equal(release.version, 1);
    const customPayload = { title: 'Custom DSP Release', artist_name: 'Synthetic Artist', artist_user_id: artist,
      release_type: 'single', distribution_service: 'custom_label', custom_label_name: 'Synthetic Imprint', custom_record_name: 'Synthetic Imprint' };
    const customCreated = await call('artist', 'POST', '/releases/aggregate', { ...customPayload, tracks: [{ title: 'Custom Track', artist_name: 'Synthetic Artist' }] });
    assert.equal(customCreated.statusCode, 200, customCreated.body);
    assert.equal(customCreated.json().release.distribution_service, 'custom_label');
    assert.equal(customCreated.json().release.custom_record_name, 'Synthetic Imprint');
    const customRelease = customCreated.json().release;
    const labelEdit = await call('label', 'PATCH', '/releases/' + customRelease.id, { version: 1, custom_label_name: 'Unauthorized', custom_record_name: 'Unauthorized' });
    assert.equal(labelEdit.statusCode, 403, labelEdit.body);
    const standardReset = await call('artist', 'PATCH', '/releases/' + customRelease.id, { version: 1, distribution_service: 'standard' });
    assert.equal(standardReset.statusCode, 200, standardReset.body);
    assert.equal(standardReset.json().custom_label_name, null);
    assert.equal(standardReset.json().custom_record_name, null);
    assert.equal((await call('outsider', 'GET', `/releases/${release.id}`)).statusCode, 404);
    assert.equal((await call('artist', 'GET', '/releases')).json().items.length, 2);
    await assert.rejects(database.runtime.query(`UPDATE soundpub.releases SET distribution_service='custom_label',
      custom_label_name='Only Label',custom_record_name=NULL WHERE id=$1`, [release.id]), { code: '23514' });
    assert.equal((await call('outsider', 'PATCH', `/releases/${release.id}`, { title: 'Forged', version: 1 })).statusCode, 404);
    assert.equal((await call('label', 'PATCH', `/releases/${release.id}`, { label_id: outsider, version: 1 })).statusCode, 400);
    const trackResponse = await call('artist', 'POST', `/releases/${release.id}/tracks`, { title: 'Song', artist_name: 'Synthetic Artist', release_version: 1 });
    assert.equal(trackResponse.statusCode, 200, trackResponse.body);
    const track = trackResponse.json().track;
    assert.equal(track.position, 1);
    assert.equal((await call('label', 'PATCH', `/releases/${release.id}`, { title: 'Stale', version: 1 })).statusCode, 409);
    assert.equal((await call('artist', 'PATCH', `/releases/${release.id}`, { status: 'pending', version: 2 })).statusCode, 409);
    assert.equal((await call('outsider', 'GET', `/tracks/${track.id}`)).statusCode, 404);
    assert.equal((await call('label', 'POST', `/releases/${release.id}/tracks/reorder`, { release_version: 2, track_ids: [track.id] })).statusCode, 200);
    assert.equal((await call('artist', 'PATCH', `/tracks/${track.id}`, { title: 'Stale', version: 1, release_version: 2 })).statusCode, 409);
    const deleted = await call('artist', 'DELETE', `/tracks/${track.id}`, { version: 2, release_version: 3 });
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal((await call('artist', 'GET', `/releases/${release.id}/tracks`)).json().items.length, 0);
    assert.equal((await call('label', 'DELETE', `/releases/${release.id}`)).statusCode, 409);
    assert.equal((await database.owner.query('SELECT count(*)::int AS n FROM soundpub.audit_logs WHERE resource_type IN ($1,$2)', ['release', 'track'])).rows[0].n, 6);
    const paths = (await app.inject('/openapi.json')).json().paths;
    assert.ok(paths['/api/v1/releases/{id}'].patch);
    assert.ok(paths['/api/v1/admin/releases/{id}/activate'].post);
    assert.ok(paths['/api/v1/releases/{id}/tracks/reorder'].post);
  } finally { await app.close(); await database.close(); }
});

test('Docker-free HTTP canonical artist contract and strict identity mutation boundary', async () => {
  const catalogId = '00000000-0000-4000-8000-000000000210';
  let received: unknown;
  const dto = { id: outsider, artist_id: catalogId, artist_user_id: null, label_id: label,
    label_name: 'PIC', created_by: label, title: 'Custom Release', artist_name: 'Catalog', release_type: 'single',
    genre: null, release_date: null, cover_url: null, upc: null, distribution_service: 'standard', custom_label_name: null, custom_record_name: null, status: 'draft', rejection_reason: null,
    archived_at: null, version: 1, created_at: '2026-11-03T00:00:00Z', updated_at: '2026-11-03T00:00:00Z' };
  const app = buildApp({
    releases: { create: async (_actor: unknown, input: unknown) => { received = input; return dto; } } as unknown as ReturnType<typeof createReleasesService>,
    auth: { authenticate: async () => ({ id: label, roles: ['label_custom'], status: 'active' }) },
    readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => {} }, webhooks: { receive: async () => false },
  });
  try {
    const payload = { title: 'Custom Release', artist_name: 'Catalog', release_type: 'single', artist_id: catalogId };
    const response = await app.inject({ method: 'POST', url: '/api/v1/releases', headers: { authorization: 'Bearer synthetic' }, payload });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().artist_id, catalogId);
    assert.equal(response.json().artist_user_id, null);
    assert.deepEqual(received, payload);
    for (const field of ['owner_user_id', 'label_id', 'management_mode']) {
      const invalid = await app.inject({ method: 'POST', url: '/api/v1/releases', headers: { authorization: 'Bearer synthetic' }, payload: { ...payload, [field]: outsider } });
      assert.equal(invalid.statusCode, 400, invalid.body);
    }
    const schema = (await app.inject('/openapi.json')).json();
    assert.ok(JSON.stringify(schema.paths['/api/v1/releases']).includes('artist_id'));
  } finally { await app.close(); }
});
