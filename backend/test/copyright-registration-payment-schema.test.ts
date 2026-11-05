import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql=readFileSync(new URL('../migrations/0054_copyright_registration_payments.sql',import.meta.url),'utf8');
test('copyright registration mock invoices are durable and isolated',()=>{
  assert.match(sql,/copyright_registration_mock_invoices/);
  assert.match(sql,/provider='mock-copyright-registration'/);
  assert.match(sql,/https:\/\/copyright-registration-payments\\\.invalid/);
  assert.match(sql,/UNIQUE\(payment_id,request_idempotency_key\)/);
});
test('callback evidence is append-only and bound to exact webhook event',()=>{
  assert.match(sql,/FOREIGN KEY\(provider,event_id\) REFERENCES soundpub\.webhook_events/);
  assert.match(sql,/payload_sha256/);
  assert.match(sql,/BEFORE UPDATE OR DELETE OR TRUNCATE/);
  assert.match(sql,/GRANT SELECT,INSERT/);
});
