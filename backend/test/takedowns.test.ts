import assert from 'node:assert/strict';
import { test } from 'node:test';
import { takedownCreate } from '../src/takedowns/contracts.js';

const valid = {
  release_id: '00000000-0000-4000-8000-000000000001', request_type: 'standard' as const,
  reason_category: 'Permintaan pemilik karya', reason_detail: 'Distribusi harus dihentikan.',
  contact_name: 'PIC Label', contact_position: 'Owner', contact_phone: '+628123456789',
  contact_email: 'pic@example.test', contact_address: 'Jakarta', declaration_accepted: true as const,
  declaration_version: 'takedown-tor-v1' as const,
  targets: ['Spotify', 'Apple Music'] as const,
};

test('takedown submission contract rejects browser-owned and ambiguous target state', () => {
  assert.equal(takedownCreate.safeParse(valid).success, true);
  assert.equal(takedownCreate.safeParse({ ...valid, requester_id: valid.release_id }).success, false);
  assert.equal(takedownCreate.safeParse({ ...valid, status: 'APPROVED' }).success, false);
  assert.equal(takedownCreate.safeParse({ ...valid, targets: ['Spotify', 'Spotify'] }).success, false);
  assert.equal(takedownCreate.safeParse({ ...valid, targets: ['Semua DSP', 'Spotify'] }).success, false);
  assert.equal(takedownCreate.safeParse({ ...valid, reason_category: 'Lainnya', other_reason: 'terlalu singkat' }).success, false);
  assert.equal(takedownCreate.safeParse({ ...valid, reason_category: 'Lainnya', other_reason: 'alasan khusus dengan lima kata lengkap' }).success, true);
  assert.equal(takedownCreate.safeParse({ ...valid, request_type: 'partial' }).success, false);
  assert.equal(takedownCreate.safeParse({ ...valid, request_type: 'partial', track_ids: [valid.release_id] }).success, true);
  assert.equal(takedownCreate.safeParse({ ...valid, track_ids: [valid.release_id] }).success, false);
});

test('takedown submission requires declaration and complete contact fields', () => {
  assert.equal(takedownCreate.safeParse({ ...valid, declaration_accepted: false }).success, false);
  assert.equal(takedownCreate.safeParse({ ...valid, declaration_version: 'future-version' }).success, false);
  assert.equal(takedownCreate.safeParse({ ...valid, contact_phone: ' ' }).success, false);
  assert.equal(takedownCreate.safeParse({ ...valid, contact_email: 'invalid' }).success, false);
});
