import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0057_payment_owner_snapshots.sql', import.meta.url), 'utf8');
const documentMigration = readFileSync(new URL('../migrations/0064_payment_invoice_documents.sql', import.meta.url), 'utf8');
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

test('invoice document metadata has stable identity, private path, and admin-only service contract', () => {
  assert.match(documentMigration, /ADD COLUMN invoice_number text/);
  assert.match(documentMigration, /ADD COLUMN invoice_pdf_path text/);
  assert.match(documentMigration, /payment_invoice_number_unique/);
  assert.match(documentMigration, /payment_invoice_document_consistency/);
  assert.match(documentMigration, /PAYMENT_INVOICE_DOCUMENT_IMMUTABLE/);
  assert.match(documentMigration, /PAYMENT_INVOICE_MUST_BE_PAID/);
  assert.match(documentMigration, /GRANT UPDATE \(invoice_number, invoice_pdf_path, invoice_pdf_generated_at\)/);
  assert.match(service, /async listAdminInvoices/);
  assert.match(service, /async downloadInvoice/);
  assert.match(service, /row\.status !== 'PAID'/);
  assert.match(service, /payment\.invoice_pdf_downloaded/);
  assert.match(service, /signedDownload\(current\.path, `\$\{current\.invoiceNumber\}\.pdf`, 600\)/);
  assert.doesNotMatch(service, /signed_url|signedUrl/);
});
