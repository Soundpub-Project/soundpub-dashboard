import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0057_payment_owner_snapshots.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/payments/index.ts', import.meta.url), 'utf8');

test('payment invoice persists canonical payer and financial owner snapshots', () => {
  for (const column of ['payer_owner_id', 'financial_owner_id', 'artist_id', 'ownership_policy']) {
    assert.match(migration, new RegExp(`ADD COLUMN ${column}`));
  }
  assert.match(migration, /LABEL_CUSTOM_PIC/);
  assert.match(migration, /payment_invoices_owner_alignment/);
  assert.match(migration, /PAYMENT_OWNER_IMMUTABLE/);
  assert.match(migration, /CREATE TRIGGER payment_invoice_owner_guard/);
  assert.match(service, /invoice\.financial_owner_id/);
  assert.match(service, /invoice\.payer_owner_id/);
  assert.match(service, /ownerOnly/);
  assert.doesNotMatch(service, /SELECT artist_user_id FROM soundpub\.releases WHERE id=\$1 FOR SHARE/);
});
