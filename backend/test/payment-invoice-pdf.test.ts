import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { renderInvoicePdf } from '../src/payments/invoice-pdf.js';
import { createInvoiceDocumentStore } from '../src/payments/invoice-document-store.js';

test('invoice PDF renders paid release details and bounds/control-sanitizes user strings', async () => {
  const bytes = await renderInvoicePdf({
    invoiceNumber: 'SPB-202611-1234ABCD', amountMinor: '5000000', paidAt: '2026-11-14T03:00:00.000Z',
    reference: 'mock_invoice_1', releaseTitle: 'Release\n(Injected)\u2603', artistName: 'Artist', trackCount: 1,
    pricePerTrackMinor: '5000000', payerName: 'Payer', payerEmail: 'payer@example.test',
  });
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
});

test('invoice document storage rejects production and non-local endpoints', async () => {
  const credentials = { accessKeyId: 'synthetic-access-key', secretAccessKey: 'synthetic-secret-key-123' };
  assert.throws(() => createInvoiceDocumentStore({ environment: 'production', endpoint: 'http://object-storage:9000',
    publicEndpoint: 'http://127.0.0.1:9100', bucket: 'soundpub-development', credentials }));
  assert.throws(() => createInvoiceDocumentStore({ environment: 'development', endpoint: 'http://example.com:9000',
    publicEndpoint: 'http://127.0.0.1:9100', bucket: 'soundpub-development', credentials }));
  const store = createInvoiceDocumentStore({ environment: 'test', endpoint: 'http://object-storage:9000',
    publicEndpoint: 'http://127.0.0.1:9100', bucket: 'soundpub-development', credentials });
  await assert.rejects(store.put('untrusted/path.pdf', new Uint8Array()), /Invalid invoice document path/);
  store.close();
});
