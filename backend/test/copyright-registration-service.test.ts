import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/copyright-registrations/index.ts', import.meta.url), 'utf8');

test('copyright registration service exposes required domain operations', () => {
  for (const operation of ['create','current','get','list','replaceDraft','submit','review','transitionContract']) {
    assert.match(source, new RegExp(`async ${operation}\\(`));
  }
});

test('draft replacement and submission use optimistic version and transaction idempotency', () => {
  assert.match(source, /copyright-registration\.replace-draft:/);
  assert.match(source, /copyright-registration\.submit:/);
  assert.match(source, /WHERE id=\$1 AND version=\$2/);
  assert.match(source, /DELETE FROM soundpub\.copyright_registration_works WHERE registration_id=\$1/);
  assert.match(source, /repository\.idempotency\.complete|idempotency\.complete/);
  assert.match(source, /REGISTRATION_INCOMPLETE/);
  assert.match(source, /ON CONFLICT \(registration_id\) DO NOTHING/);
});

test('admin review and contract transitions are explicit state machines', () => {
  assert.match(source, /PAID_PENDING_REVIEW: \['IN_REVIEW'\]/);
  assert.match(source, /IN_REVIEW: \['REVISION_REQUESTED', 'APPROVED', 'REJECTED'\]/);
  assert.match(source, /DRAFT: \['GENERATED', 'VOID'\]/);
  assert.match(source, /STAMPED: \['SIGNED', 'VOID'\]/);
  assert.match(source, /SIGNED: \['ACTIVE', 'VOID'\]/);
  assert.match(source, /if\(!allows\(current,'admin'\)\) throw new ApiError\(404,'NOT_FOUND'\)/);
});

test('service derives protected fields and records audit plus outbox', () => {
  assert.match(source, /VALUES \(\$1,\$2,\$3,'DRAFT'/);
  assert.match(source, /nextStatus=oldStatus==='REVISION_REQUESTED' \? 'IN_REVIEW' : 'AWAITING_PAYMENT'/);
  assert.match(source, /terms_accepted_at=COALESCE\(terms_accepted_at,clock_timestamp\(\)\)/);
  assert.match(source, /submitted_at=COALESCE\(submitted_at,clock_timestamp\(\)\)/);
  assert.match(source, /audit\.append/);
  assert.match(source, /outbox\.enqueue/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /copyright_registration_payments/);
});
