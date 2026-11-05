import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp, type ApiDependencies } from '../src/api/index.js';

const user = { id: '00000000-0000-4000-8000-000000000001', status: 'active' as const, roles: ['label'] as const };
const release = { id: '00000000-0000-4000-8000-000000000002', title: 'Release', artist_name: 'Artist', upc: null,
  label_id: user.id, artist_id: null, artist_user_id: null, created_by: user.id, status: 'active', created_at: '2026-11-05T00:00:00.000000Z' };
const request = { id: '00000000-0000-4000-8000-000000000003', request_code: 'TD-000000000000', requester_id: user.id, label_id: user.id,
  request_type: 'standard' as const, reason_category: 'Permintaan pemilik karya', reason_detail: 'Stop', other_reason: null,
  status: 'SUBMITTED' as const, priority: 'normal' as const, contact_name: 'PIC', contact_position: 'Owner', contact_phone: '1',
  contact_email: 'pic@example.test', contact_address: 'Jakarta', declaration_version: 'takedown-tor-v1',
  declaration_checksum: 'a'.repeat(64), declaration_accepted_at: '2026-11-05T00:00:00.000000Z',
  reviewer_id: null, review_note: null, rejection_reason: null, submitted_at: '2026-11-05T00:00:00.000000Z', reviewed_at: null,
  sent_to_dsp_at: null, completed_at: null, status_before_cancel: null, version: 1, created_at: '2026-11-05T00:00:00.000000Z',
  updated_at: '2026-11-05T00:00:00.000000Z', items: [], targets: [], history: [], documents: [] };

function dependencies(): ApiDependencies {
  return {
    takedowns: {
      list: async () => ({ items: [request], nextCursor: null }), get: async () => request,
      eligibleReleases: async () => ({ items: [release], nextCursor: null }), create: async () => request,
      transition: async () => request, requestCancellation: async () => request, transitionTarget: async () => request,
    } as never,
    auth: { authenticate: async token => token === 'valid' ? user : null }, readiness: { check: async () => true },
    admin: { suspendUser: async () => {} }, webhooks: { receive: async () => true },
    rateLimiter: { consume: async () => ({ allowed: true }) },
  };
}

test('takedown API exposes strict authenticated read and idempotent submission contracts', async () => {
  const app = buildApp(dependencies());
  try {
    const headers = { authorization: 'Bearer valid' };
    assert.equal((await app.inject({ url: '/api/v1/takedowns', headers })).statusCode, 200);
    assert.equal((await app.inject({ url: `/api/v1/takedowns/${request.id}`, headers })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/v1/takedowns/eligible-releases', headers })).statusCode, 200);
    const payload = { release_id: release.id, request_type: 'standard', reason_category: 'Permintaan pemilik karya',
      reason_detail: 'Stop distribution', contact_name: 'PIC', contact_position: 'Owner', contact_phone: '1',
      contact_email: 'pic@example.test', contact_address: 'Jakarta', declaration_accepted: true,
      declaration_version: 'takedown-tor-v1', targets: ['Spotify'] };
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/takedowns', headers, payload })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/takedowns',
      headers: { ...headers, 'idempotency-key': 'submit-1' }, payload })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/takedowns', headers: { ...headers, 'idempotency-key': 'submit-2' },
      payload: { ...payload, requester_id: user.id } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: `/api/v1/takedowns/${request.id}/transitions`,
      headers: { ...headers, 'idempotency-key': 'transition-1' }, payload: { version: 1, status: 'UNDER_REVIEW' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/api/v1/takedowns/${request.id}/cancellation`,
      headers: { ...headers, 'idempotency-key': 'cancel-1' }, payload: { version: 1, reason: 'Owner requested cancellation' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/api/v1/takedowns/${request.id}/targets/00000000-0000-4000-8000-000000000004/transitions`,
      headers: { ...headers, 'idempotency-key': 'target-1' }, payload: { version: 1, status: 'SUBMITTED', external_reference: 'DSP-1' } })).statusCode, 200);
    assert.equal((await app.inject('/api/v1/takedowns')).statusCode, 401);
    const openapi = (await app.inject('/openapi.json')).json();
    assert.ok(openapi.paths['/api/v1/takedowns']);
    assert.ok(openapi.paths['/api/v1/takedowns/eligible-releases']);
    assert.ok(openapi.paths['/api/v1/takedowns/{id}/targets/{targetId}/transitions']);
  } finally { await app.close(); }
});
