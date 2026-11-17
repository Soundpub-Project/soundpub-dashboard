import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0069_xendit_invoice_provider.sql', import.meta.url), 'utf8');

test('Xendit invoices can be created pending provider delivery without weakening mock shape', () => {
  assert.match(migration, /provider IN \('mock','xendit'\)/);
  assert.match(migration, /status IN \('CREATING','PENDING','PAID','FAILED','EXPIRED','REFUNDED'\)/);
  assert.match(migration, /status='CREATING' AND provider_invoice_id IS NULL/);
  assert.match(migration, /provider='mock' AND provider_invoice_id IS NOT NULL AND provider_external_id IS NULL/);
  assert.match(migration, /provider_invoice_url ~/);
  assert.match(migration, /xendit\\\.co/);
  assert.match(migration, /GRANT UPDATE\(provider_invoice_id,provider_invoice_url,provider_status,status,updated_at\)/);
});