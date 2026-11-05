import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import type { ArtistsService } from '../src/artists/index.js';
import type { LabelsService } from '../src/labels/index.js';

const actor = { id: '00000000-0000-4000-8000-000000000001', roles: ['admin'] as const, status: 'active' as const };
const timestamp = '2026-10-28T00:00:00.000000Z';
const artist = { id: '00000000-0000-4000-8000-000000000002', profile_id: null, catalog_artist_id: null,
  label_user_id: null, full_name: 'Artist', phone: null, address: null, status: 'active', artist_name: 'Artist',
  artist_type: 'solo', bio: null, genre: null, legal_name: null, country: null, city: null, language: null,
  gender: null, date_of_birth: null, profile_image_url: null, social_links: {}, verified: false,
  verified_at: null, artist_profile_completed: false, created_at: timestamp, updated_at: timestamp };
const label = { id: actor.id, ownerId: actor.id, full_name: 'Label', logo_url: null, logo_url_light: null,
  logo_url_dark: null, status: 'active', roles: ['label'] };

test('domain routes authenticate, validate and expose OpenAPI', async () => {
  const artists = { list: async () => ({ items: [artist], nextCursor: null }), get: async () => artist,
    create: async () => artist, update: async () => artist, removeFromLabel: async () => ({ id: artist.id, label_user_id: null }),
    requestDeletion: async () => ({ id: actor.id, artist_id: artist.id, label_id: actor.id, reason: 'reason', status: 'pending', created_at: timestamp, updated_at: timestamp }),
    listDeletionRequests: async () => ({ items: [], nextCursor: null }), reviewDeletionRequest: async () => artist } as unknown as ArtistsService;
  const labels = { list: async () => ({ items: [label], nextCursor: null }), get: async () => label,
    roster: async () => ({ items: [{ membershipId: actor.id, artistId: artist.id, labelId: actor.id,
      name: 'Artist', fullName: 'Artist', status: 'active', email: 'artist@example.test', phone: null,
      address: null, passwordSet: false, createdAt: timestamp }], nextCursor: null }),
    currentParent: async () => ({ artistId: artist.id, parentLabelId: actor.id, membershipId: actor.id }),
    assign: async () => ({ artistId: artist.id, parentLabelId: actor.id, membershipId: actor.id, changed: true }),
    transfer: async () => ({ artistId: artist.id, parentLabelId: actor.id, membershipId: actor.id, changed: true }),
    remove: async () => ({ artistId: artist.id, parentLabelId: null, membershipId: null, changed: true }) } as unknown as LabelsService;
  const app = buildApp({ artists, labels, auth: { authenticate: async token => token === 'admin' ? actor : null },
    readiness: { check: async () => true }, rateLimiter: { consume: async () => ({ allowed: true }) },
    admin: { suspendUser: async () => {} }, webhooks: { receive: async () => false } });
  try {
    assert.equal((await app.inject('/api/v1/artists')).statusCode, 401);
    const headers = { authorization: 'Bearer admin' };
    assert.equal((await app.inject({ url: '/api/v1/artists', headers })).statusCode, 200);
    assert.equal((await app.inject({ url: `/api/v1/artists/${artist.id}`, headers })).json().artist_name, 'Artist');
    assert.equal((await app.inject({ url: '/api/v1/artists', method: 'POST', headers, payload: { artist_name: 'Artist' } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/v1/labels', headers })).json().items[0].full_name, 'Label');
    assert.equal((await app.inject({ url: `/api/v1/labels/${actor.id}/artists`, headers })).json().items[0].artistId, artist.id);
    assert.equal((await app.inject({ url: `/api/v1/artists/${artist.id}/transfer`, method: 'POST', headers,
      payload: { labelId: actor.id, expectedParentLabelId: actor.id, confirmationPhrase: 'WRONG' } })).statusCode, 400);
    const paths = (await app.inject('/openapi.json')).json().paths;
    for (const path of ['/api/v1/artists', '/api/v1/artists/{id}', '/api/v1/labels',
      '/api/v1/labels/{id}/artists', '/api/v1/artists/{id}/transfer']) assert.ok(paths[path]);
  } finally { await app.close(); }
});
