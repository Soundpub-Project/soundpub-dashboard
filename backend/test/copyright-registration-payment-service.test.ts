import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { copyrightRegistrationRedirects } from '../src/copyright-registrations/xendit-outbox.js';

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

test('copyright Xendit delivery uses a durable external outbox and stable provider identity',()=>{
  assert.match(service,/copyright_registration\.payment_invoice_create/);
  assert.match(service,/provider='xendit'/);
  assert.match(service,/idrAmountFromMinor/);
});

test('copyright checkout redirects return to registration status page',()=>{
  const redirects = copyrightRegistrationRedirects('http://127.0.0.1:8281/dashboard/invoices',
    'http://localhost:8281/dashboard/invoices');
  assert.deepEqual(redirects, {
    success: 'http://127.0.0.1:8281/dashboard/copyright-registration/status',
    failure: 'http://localhost:8281/dashboard/copyright-registration/status',
  });
});
