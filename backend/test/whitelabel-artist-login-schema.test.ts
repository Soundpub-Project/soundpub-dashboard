import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0044_whitelabel_artist_login.sql', import.meta.url), 'utf8');

test('Whitelabel login activation grants only required profile columns', () => {
  assert.match(migration, /CREATE UNIQUE INDEX backend_users_email_unique ON soundpub\.backend_users \(lower\(email\)\) WHERE email IS NOT NULL/);
  assert.match(migration, /GRANT INSERT \(id,full_name,phone,address,parent_label_id,password_set\)/);
  assert.match(migration, /GRANT UPDATE \(password_set,updated_at\)/);
  assert.doesNotMatch(migration, /GRANT (?:ALL|DELETE|TRUNCATE)/);
});
