import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertMediaSignature, validateUpload } from '../src/media/index.js';

const requestId = '00000000-0000-4000-8000-000000000001';
const pdf = Buffer.from('%PDF-1.4 synthetic evidence');

test('takedown document upload accepts private PDF/image only with bounded size', () => {
  const input = { category: 'TAKEDOWN_DOCUMENT', resource_type: 'takedown', resource_id: requestId,
    mime_type: 'application/pdf', size: pdf.length, checksum: createHash('sha256').update(pdf).digest('hex'),
    filename: 'evidence.pdf' };
  assert.equal(validateUpload(input).visibility, 'PRIVATE');
  assertMediaSignature(pdf, 'application/pdf');
  assert.throws(() => validateUpload({ ...input, mime_type: 'text/plain', filename: 'evidence.txt' }));
  assert.throws(() => validateUpload({ ...input, size: 10 * 1024 ** 2 + 1 }));
  assert.throws(() => assertMediaSignature(Buffer.from('fake'), 'application/pdf'));
});

test('takedown document migration creates multi-file private binding and one metadata source', () => {
  const sql = readFileSync(new URL('../migrations/0051_takedown_documents.sql', import.meta.url), 'utf8');
  assert.match(sql, /resource_type='takedown' AND category='TAKEDOWN_DOCUMENT'/);
  assert.match(sql, /category<>'TAKEDOWN_DOCUMENT'/);
  assert.match(sql, /num_nonnulls\(storage_asset_id,media_object_id\)=1/);
  assert.match(sql, /media_takedown_documents_idx/);
});
