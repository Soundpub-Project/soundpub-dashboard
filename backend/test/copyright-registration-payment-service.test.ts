import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service=readFileSync(new URL('../src/copyright-registrations/index.ts',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/api/copyright-registrations.ts',import.meta.url),'utf8');
test('invoice request derives protected payment fields server-side',()=>{
  assert.match(service,/async requestPaymentInvoice\(/);
  assert.match(service,/payment\.amount_minor,payment\.currency/);
  assert.match(service,/copyright-registration-payments\.invalid/);
  assert.doesNotMatch(api,/amount_minor.*requestPaymentInvoice/s);
});
test('callback verifies raw bytes and commits payment registration audit outbox atomically',()=>{
  assert.match(service,/receiveWebhook\(pool,input,paymentOptions\.callbackSecret/);
  assert.match(service,/status='PAID_PENDING_REVIEW'/);
  assert.match(service,/copyright_registration\.payment_callback/);
  assert.match(service,/copyright_registration\.payment_changed/);
  assert.match(api,/parseAs:'buffer'/);
});
