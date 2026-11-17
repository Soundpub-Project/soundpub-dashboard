import assert from 'node:assert/strict';
import test from 'node:test';
import { idrAmountFromMinor, XenditInvoiceClient, type XenditInvoice, type XenditInvoiceRequest } from '../src/payments/xendit-client.js';

const request: XenditInvoiceRequest = {
  external_id: 'release-invoice-001', amount: 50000, currency: 'IDR', description: 'Release Test',
  payer_email: 'payer@example.test', customer: { given_names: 'Synthetic Payer', email: 'payer@example.test' },
  success_redirect_url: 'http://127.0.0.1:8281/dashboard/invoices',
  failure_redirect_url: 'http://127.0.0.1:8281/dashboard/invoices',
};
const invoice: XenditInvoice = {
  id: 'xendit-invoice-001', external_id: request.external_id,
  invoice_url: 'https://checkout.xendit.co/web/123', amount: request.amount,
  currency: 'IDR', status: 'PENDING',
};
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const key = 'xnd_development_0123456789abcdef';

test('Xendit client creates invoice only after checking stable external ID', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new XenditInvoiceClient({ secretKey: key, fetch: async (input, init) => {
    calls.push({ url: String(input), init });
    return calls.length === 1 ? response([]) : response(invoice, 201);
  } });
  assert.deepEqual(await client.createOrRecover(request), invoice);
  assert.equal(calls.length, 2);
  assert.match(calls[0]!.url, /external_id=release-invoice-001/);
  assert.equal(calls[1]!.init?.method, 'POST');
  assert.equal(JSON.parse(String(calls[1]!.init?.body)).external_id, request.external_id);
  assert.match(new Headers(calls[1]!.init?.headers).get('authorization')!, /^Basic /);
});

test('Xendit client recovers an invoice created before worker failure without creating a duplicate', async () => {
  const calls: string[] = [];
  const client = new XenditInvoiceClient({ secretKey: key, fetch: async input => {
    calls.push(String(input)); return response([invoice]);
  } });
  assert.deepEqual(await client.createOrRecover(request), invoice);
  assert.equal(calls.length, 1);
});

test('Xendit client recovers after ambiguous create response using same external ID', async () => {
  let calls = 0;
  const client = new XenditInvoiceClient({ secretKey: key, fetch: async (_input, init) => {
    calls += 1;
    if (calls === 1) return response([]);
    if (init?.method === 'POST') throw new Error('synthetic connection reset');
    return response([invoice]);
  } });
  assert.deepEqual(await client.createOrRecover(request), invoice);
  assert.equal(calls, 3);
});

test('Xendit client rejects live keys, invalid requests, mismatched invoices, and unsafe checkout URLs', async () => {
  assert.throws(() => new XenditInvoiceClient({ secretKey: 'xnd_production_0123456789abcdef' }), /development API keys only/);
  const client = new XenditInvoiceClient({ secretKey: key, fetch: async () => response([invoice]) });
  await assert.rejects(client.createOrRecover({ ...request, amount: -1 }), /Invalid Xendit invoice request/);
  await assert.rejects(client.createOrRecover({ ...request, amount: 1 }), /recovery mismatch/);
  const unsafe = new XenditInvoiceClient({ secretKey: key, fetch: async () => response([{ ...invoice, invoice_url: 'https://evil.example/' }]) });
  await assert.rejects(unsafe.createOrRecover(request), /could not be recovered/);
});

test('Xendit lookup validates provider ID and exact response ID', async () => {
  const unsafe = new XenditInvoiceClient({ secretKey: key, fetch: async () => response(invoice) });
  await assert.rejects(unsafe.getById('../bad'), /Invalid Xendit invoice ID/);
  await assert.rejects(unsafe.getById('different-id'), /Xendit invoice lookup failed/);
});
test('Xendit IDR conversion uses whole rupiah from exact two-decimal backend minor units', () => {
  assert.equal(idrAmountFromMinor('5000000'), 50000);
  assert.throws(() => idrAmountFromMinor('5000001'), /whole rupiah/);
  for (const value of ['0', '-100', '1.5', '9007199254740992']) assert.throws(() => idrAmountFromMinor(value));
});
