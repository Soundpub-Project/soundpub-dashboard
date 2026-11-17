import assert from 'node:assert/strict';
import test from 'node:test';
import { parseXenditInvoiceCallback, verifyXenditCallbackToken } from '../src/payments/xendit-webhook.js';

const body = (value: unknown) => Buffer.from(JSON.stringify(value));
const base = { id: 'invoice-001', external_id: 'sp-rel-test', status: 'PAID', amount: 50000, currency: 'IDR' };

test('Xendit callback token comparison fails closed and checks complete value', () => {
  assert.equal(verifyXenditCallbackToken(undefined, 'token'), false);
  assert.equal(verifyXenditCallbackToken('token', undefined), false);
  assert.equal(verifyXenditCallbackToken('token', 'token'), true);
  assert.equal(verifyXenditCallbackToken('token', 'Token'), false);
  assert.equal(verifyXenditCallbackToken('token', 'token-extra'), false);
});

test('Xendit callback parser maps invoice terminal statuses and exact IDR minor units', () => {
  assert.deepEqual(parseXenditInvoiceCallback(body(base)), {
    invoiceId: 'invoice-001', externalId: 'sp-rel-test', status: 'PAID', amountMinor: '5000000', currency: 'IDR',
  });
  assert.equal(parseXenditInvoiceCallback(body({ ...base, status: 'SETTLED' }))?.status, 'PAID');
  assert.equal(parseXenditInvoiceCallback(body({ ...base, status: 'EXPIRED' }))?.status, 'EXPIRED');
  assert.equal(parseXenditInvoiceCallback(body({ ...base, status: 'FAILED' }))?.status, 'FAILED');
  assert.equal(parseXenditInvoiceCallback(body({ ...base, status: 'PENDING' }))?.status, 'UNSUPPORTED');
  assert.equal(parseXenditInvoiceCallback(body({ ...base, amount: '50000.25' }))?.amountMinor, '5000025');
  assert.equal(parseXenditInvoiceCallback(body({ ...base, amount: 0.29 }))?.amountMinor, '29');
});

test('Xendit callback parser rejects malformed, unsafe, and oversized payloads', () => {
  for (const raw of [Buffer.from('{'), Buffer.from('[]'), Buffer.from('null'), Buffer.alloc(0), Buffer.alloc(1_048_577)]) {
    assert.equal(parseXenditInvoiceCallback(raw), null);
  }
  for (const payload of [
    { ...base, id: '../invoice' }, { ...base, status: '' }, { ...base, currency: 'idr' },
    { ...base, external_id: '../invoice' },
    { ...base, amount: 0 }, { ...base, amount: '1.001' }, { ...base, amount: '1e5' },
    { ...base, amount: '90071992547409.92' }, { ...base, amount: Number.MAX_SAFE_INTEGER },
  ]) assert.equal(parseXenditInvoiceCallback(body(payload)), null);
});
