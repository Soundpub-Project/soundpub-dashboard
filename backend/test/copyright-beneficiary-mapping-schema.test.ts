import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationName = '0045_copyright_beneficiary_mappings.sql';
const migration = readFileSync(new URL(`../migrations/${migrationName}`, import.meta.url), 'utf8');

test('copyright beneficiary mapping migration has expected sequence and name', () => {
  assert.equal(readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.startsWith('0045_')).join(','), migrationName);
});

test('copyright beneficiary mappings expose append-only backend access', () => {
  assert.match(migration, /GRANT SELECT,INSERT ON soundpub\.copyright_beneficiary_mappings TO soundpub_app/);
  assert.match(migration, /GRANT SELECT,INSERT ON soundpub\.copyright_beneficiary_mapping_revocations TO soundpub_app/);
  assert.doesNotMatch(migration, /GRANT (?:UPDATE|DELETE|TRUNCATE)/);
  assert.match(migration, /copyright_beneficiary_mappings_immutable[\s\S]*BEFORE UPDATE OR DELETE OR TRUNCATE/);
  assert.match(migration, /copyright_beneficiary_mapping_revocations_immutable[\s\S]*BEFORE UPDATE OR DELETE OR TRUNCATE/);
  assert.match(migration, /ALTER TABLE soundpub\.copyright_beneficiary_mappings ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE soundpub\.copyright_beneficiary_mapping_revocations ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE POLICY copyright_beneficiary_mappings_backend[\s\S]*TO soundpub_app USING \(true\) WITH CHECK \(true\)/);
  assert.match(migration, /CREATE POLICY copyright_beneficiary_mapping_revocations_backend[\s\S]*TO soundpub_app USING \(true\) WITH CHECK \(true\)/);
});

test('mapping identity, periods, and foreign keys are constrained', () => {
  assert.match(migration, /composer_code = btrim\(composer_code\)/);
  assert.match(migration, /composer_code ~ '\^\[A-Za-z0-9\]/);
  assert.match(migration, /owner_id uuid NOT NULL REFERENCES soundpub\.backend_users\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /created_by uuid NOT NULL REFERENCES soundpub\.backend_users\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /canonical_name = btrim\(canonical_name\)/);
  assert.match(migration, /valid_from ~ '\^\[0-9\]\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$'/);
  assert.match(migration, /valid_through >= valid_from/);
});

test('case-insensitive overlapping periods are serialized and rejected', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(upper\(btrim\(NEW\.composer_code\)\), 45\)\)/);
  assert.match(migration, /upper\(btrim\(existing\.composer_code\)\) = upper\(btrim\(NEW\.composer_code\)\)/);
  assert.match(migration, /existing\.valid_from <= COALESCE\(NEW\.valid_through, '9999-12'\)/);
  assert.match(migration, /NEW\.valid_from <= COALESCE\(existing\.valid_through, '9999-12'\)/);
  assert.match(migration, /COPYRIGHT_BENEFICIARY_MAPPING_PERIOD_OVERLAP/);
  assert.match(migration, /upper\(btrim\(composer_code\)\), valid_from, valid_through/);
});

test('revocation permits only one immutable event per mapping', () => {
  assert.match(migration, /mapping_id uuid NOT NULL UNIQUE REFERENCES soundpub\.copyright_beneficiary_mappings\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /actor_id uuid NOT NULL REFERENCES soundpub\.backend_users\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /reason = btrim\(reason\)/);
  assert.match(migration, /revoked_at timestamptz NOT NULL DEFAULT clock_timestamp\(\)/);
});
