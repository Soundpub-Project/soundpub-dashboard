import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp, type ApiDependencies } from '../src/api/index.js';

const id = '00000000-0000-4000-8000-000000000001';
const actor = { id, status: 'active' as const, roles: ['admin' as const] };
const now = '2026-11-05T00:00:00.000Z';
const detail = {
  id, user_id: id, legal_name: 'Pemohon', email: 'owner@example.test', applicant_type: 'personal' as const,
  status: 'draft' as const, composer_code: null, contract_number: null, submitted_at: null, reviewed_at: null,
  approved_at: null, rejected_at: null, version: 1, created_at: now, updated_at: now, stage_name: null,
  nik: null, phone: '08123456789', address: 'Jakarta', npwp: null, bank_name: 'Bank',
  bank_account_number: '12345678', bank_account_name: 'Pemohon', revision_notes: null, admin_notes: null,
  works: [], files: [], payment: null, contract: null, allowed_actions: ['replace_draft'],
};
const calls: string[] = [];

function dependencies(): ApiDependencies {
  return {
    copyrightRegistrations: {
      current: async () => detail, create: async () => { calls.push('create'); return detail; }, get: async () => detail,
      replaceDraft: async () => { calls.push('replace'); return detail; }, submit: async () => { calls.push('submit'); return detail; },
      list: async () => ({ items: [detail], next_cursor: null }), review: async () => { calls.push('review'); return detail; },
      transitionContract: async () => { calls.push('contract'); return detail; },
    } as never,
    auth: { authenticate: async token => token === 'valid' ? actor : null }, readiness: { check: async () => true },
    admin: { suspendUser: async () => {} }, webhooks: { receive: async () => true },
    rateLimiter: { consume: async () => ({ allowed: true }) },
  };
}

const headers = { authorization: 'Bearer valid' };
const mutationHeaders = { ...headers, 'idempotency-key': 'copyright-registration:test-1' };
const work = { title: 'Karya', alternate_title: null, composer_name: 'Komposer', lyricist_name: null,
  ownership_percentage: 100, is_collaboration: false, cowriters: [], release_status: 'unreleased', release_date: null,
  isrc: null, upc: null, links: [], lyrics: null, notes: null };

test('copyright registration routes enforce authentication, strict bodies and idempotency headers', async () => {
  calls.length = 0;
  const app = buildApp(dependencies());
  try {
    assert.equal((await app.inject('/api/v1/copyright/registrations/current')).statusCode, 401);
    assert.equal((await app.inject({ url: '/api/v1/copyright/registrations/current', headers })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/copyright/registrations', headers,
      payload: { legal_name: 'Pemohon', email: 'owner@example.test', phone: '0812', applicant_type: 'personal' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/copyright/registrations', headers: mutationHeaders,
      payload: { legal_name: 'Pemohon', email: 'owner@example.test', phone: '0812', applicant_type: 'personal' } })).statusCode, 200);
    const replace = { version: 1, legal_name: 'Pemohon', stage_name: null, nik: null, email: 'owner@example.test',
      phone: '0812', address: 'Jakarta', applicant_type: 'personal', npwp: null, bank_name: 'Bank',
      bank_account_number: '12345678', bank_account_name: 'Pemohon', works: [work] };
    assert.equal((await app.inject({ method: 'PUT', url: `/api/v1/copyright/registrations/${id}/draft`,
      headers: mutationHeaders, payload: replace })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/api/v1/copyright/registrations/${id}/submit`,
      headers: mutationHeaders, payload: { version: 1, declaration_accepted: true,
        declaration_version: 'copyright-registration-terms-v1' } })).statusCode, 200);
    assert.deepEqual(calls, ['create', 'replace', 'submit']);
  } finally { await app.close(); }
});

test('admin list, review and contract transition publish strict OpenAPI contracts', async () => {
  calls.length = 0;
  const app = buildApp(dependencies());
  try {
    assert.equal((await app.inject({ url: '/api/v1/admin/copyright/registrations?limit=50&status=in_review', headers })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/api/v1/admin/copyright/registrations/${id}/review`,
      headers: mutationHeaders, payload: { version: 1, status: 'rejected', note: 'Bukti tidak sah' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/api/v1/admin/copyright/registrations/${id}/contract/transitions`,
      headers: mutationHeaders, payload: { version: 1, status: 'generated' } })).statusCode, 200);
    const openapi = (await app.inject('/openapi.json')).json();
    const create = openapi.paths['/api/v1/copyright/registrations'].post;
    assert.equal(create.requestBody.content['application/json'].schema.additionalProperties, false);
    assert.ok(create.parameters.some((item: any) => item.name === 'Idempotency-Key' && item.required));
    assert.equal(openapi.paths['/api/v1/copyright/registrations/{id}/draft'].put.requestBody.content['application/json'].schema.additionalProperties, false);
    assert.ok(openapi.paths['/api/v1/admin/copyright/registrations/{id}/review']);
    assert.ok(openapi.paths['/api/v1/admin/copyright/registrations/{id}/contract/transitions']);
    assert.deepEqual(calls, ['review', 'contract']);
  } finally { await app.close(); }
});
