import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateUpload } from '../src/media/contracts.js';

const migration = readFileSync(new URL('../migrations/0053_copyright_registration_media.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/media/index.ts', import.meta.url), 'utf8');
const authority = readFileSync(new URL('../src/media/authority.ts', import.meta.url), 'utf8');
const registration = '00000000-0000-4000-8000-000000000052';

test('copyright registration evidence accepts private PDF, image, and audio with bounded size', () => {
  for (const [mime_type, filename, document_type] of [['application/pdf','evidence.pdf','IDENTITY'],['image/png','evidence.png','WORK_EVIDENCE'],['audio/mpeg','demo.mp3','AUDIO_DEMO']]) {
    assert.equal(validateUpload({ category:'COPYRIGHT_REGISTRATION_DOCUMENT',resource_type:'copyright_registration',
      resource_id:registration,mime_type,filename,document_type,size:1024,checksum:'ab'.repeat(32) }).visibility, 'PRIVATE');
  }
  assert.throws(() => validateUpload({ category:'COPYRIGHT_REGISTRATION_DOCUMENT',resource_type:'copyright_registration',
    resource_id:registration,mime_type:'text/html',filename:'evidence.html',document_type:'OTHER',size:1024,checksum:'ab'.repeat(32) }));
  assert.throws(() => validateUpload({ category:'COPYRIGHT_REGISTRATION_DOCUMENT',resource_type:'copyright_registration',
    resource_id:registration,mime_type:'application/pdf',filename:'evidence.pdf',document_type:'IDENTITY',size:25*1024**2+1,checksum:'ab'.repeat(32) }));
  assert.throws(() => validateUpload({ category:'COPYRIGHT_REGISTRATION_DOCUMENT',resource_type:'copyright_registration',
    resource_id:registration,mime_type:'application/pdf',filename:'evidence.pdf',size:1024,checksum:'ab'.repeat(32) }));
});

test('migration binds media privately and freezes append-only evidence after editable states', () => {
  assert.match(migration, /copyright_registration_id uuid\s+REFERENCES soundpub\.copyright_registrations/);
  assert.match(migration, /copyright_document_type text/);
  assert.match(migration, /resource_type='copyright_registration' AND category='COPYRIGHT_REGISTRATION_DOCUMENT'/);
  assert.match(migration, /category NOT IN \('TAKEDOWN_DOCUMENT','COPYRIGHT_REGISTRATION_DOCUMENT'\)/);
  assert.match(migration, /registration\.status IN \('DRAFT','REVISION_REQUESTED'\)/);
  assert.match(migration, /copyright_registration_freeze_files AFTER UPDATE OF status/);
  assert.match(migration, /GRANT UPDATE \(detached_at\)/);
  assert.doesNotMatch(migration, /GRANT (?:ALL|DELETE)/);
});

test('authority, completion, download reference, and deletion use registration binding', () => {
  assert.match(authority, /admin \|\| registration\.owner_id === current\.id/);
  assert.match(authority, /contractDocument/);
  assert.match(authority, /'APPROVED','CONTRACT_GENERATED','STAMPING_PENDING','STAMPED','CONTRACT_SIGNED'/);
  assert.match(service, /INSERT INTO soundpub\.copyright_registration_files/);
  assert.match(service, /WHERE media_object_id=\$1 AND detached_at IS NULL/);
  assert.match(service, /detached_at=clock_timestamp\(\).*frozen_at IS NULL/s);
  assert.match(service, /copyright_registration_id,copyright_document_type,original_filename/);
  assert.match(service, /active\.copyright_document_type/);
});
