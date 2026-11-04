import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Static only: no app bootstrap, environment loading, database, or containers.
const source = readFileSync(new URL('../migrations/0023_label_custom.sql', import.meta.url), 'utf8');
const sql = source.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const statements = sql.split(';').map(statement => statement.trim()).filter(Boolean);

function statementStarting(prefix: string): string {
  const matches = statements.filter(statement => statement.startsWith(prefix));
  assert.equal(matches.length, 1, `Expected exactly one statement starting with ${prefix}`);
  return matches[0]!;
}

test('label_custom extends the role allowlist without removing existing roles', () => {
  assert.match(sql, /ALTER TABLE soundpub\.roles DROP CONSTRAINT roles_name_check;/);
  const roles = statementStarting('ALTER TABLE soundpub.roles ADD CONSTRAINT');
  for (const role of ['superadmin', 'admin', 'label', 'copyright', 'whitelabel', 'artist', 'user', 'label_custom']) {
    assert.ok(roles.includes(`'${role}'`), `Missing role ${role}`);
  }
  assert.match(sql, /INSERT INTO soundpub\.roles\(name\) VALUES \('label_custom'\);/);
});

test('one custom unit per backend owner; code unique; owner deletion restricted', () => {
  const units = statementStarting('CREATE TABLE soundpub.label_custom_units');
  assert.match(units, /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
  assert.match(units, /owner_user_id uuid NOT NULL UNIQUE REFERENCES soundpub\.profiles\(id\) ON DELETE RESTRICT/);
  assert.match(units, /FOREIGN KEY \(owner_user_id\) REFERENCES soundpub\.backend_users\(id\) ON DELETE RESTRICT/);
  assert.match(units, /unit_code text NOT NULL UNIQUE CHECK \(length\(btrim\(unit_code\)\) BETWEEN 1 AND 100\)/);
  assert.match(units, /UNIQUE \(id, owner_user_id\)/);
});

test('custom unit requires a nonblank bounded name and defaults to active with only archived as alternative', () => {
  const units = statementStarting('CREATE TABLE soundpub.label_custom_units');
  assert.match(units, /name text NOT NULL CHECK \(length\(btrim\(name\)\) BETWEEN 1 AND 200\)/);
  assert.match(units, /status text NOT NULL DEFAULT 'active' CHECK \(status IN \('active', 'archived'\)\)/);
});

test('artist identity admits exactly login or custom managed shapes with required contacts', () => {
  const artists = statementStarting('ALTER TABLE soundpub.artists');
  assert.match(artists, /ALTER COLUMN artist_user_id DROP NOT NULL/);
  assert.match(artists, /management_mode text NOT NULL DEFAULT 'LOGIN_ACCOUNT'/);
  assert.match(artists, /\(management_mode = 'LOGIN_ACCOUNT' AND artist_user_id IS NOT NULL AND label_custom_unit_id IS NULL\) OR \(management_mode = 'LABEL_CUSTOM_MANAGED' AND artist_user_id IS NULL AND label_custom_unit_id IS NOT NULL AND contact_email IS NOT NULL AND contact_phone IS NOT NULL\)/);
  assert.match(artists, /length\(btrim\(contact_email\)\) BETWEEN 3 AND 320 AND position\('@' in contact_email\) > 1/);
  assert.match(artists, /length\(btrim\(contact_phone\)\) BETWEEN 1 AND 50/);
  assert.match(artists, /label_custom_unit_id uuid REFERENCES soundpub\.label_custom_units\(id\) ON DELETE RESTRICT/);
  assert.match(artists, /FOREIGN KEY \(label_custom_unit_id, label_id\) REFERENCES soundpub\.label_custom_units\(id, owner_user_id\) ON DELETE RESTRICT/);
  assert.doesNotMatch(artists, /(?:DROP COLUMN id|DROP CONSTRAINT artists_current_parent_fkey|ALTER COLUMN label_id)/);
});

test('profiles enforce canonical artist FK, matching login user, and matching custom mode even with NULL users', () => {
  const profiles = statementStarting('ALTER TABLE soundpub.artist_profiles ALTER COLUMN');
  assert.match(profiles, /ALTER COLUMN user_id DROP NOT NULL/);
  assert.match(profiles, /artist_id uuid UNIQUE REFERENCES soundpub\.artists\(id\) ON DELETE RESTRICT/);
  assert.match(profiles, /management_mode text GENERATED ALWAYS AS \( CASE WHEN user_id IS NULL THEN 'LABEL_CUSTOM_MANAGED' ELSE 'LOGIN_ACCOUNT' END \) STORED/);
  const constraints = statementStarting('ALTER TABLE soundpub.artist_profiles ADD CONSTRAINT');
  assert.match(constraints, /CHECK \(user_id IS NOT NULL OR artist_id IS NOT NULL\)/);
  assert.match(constraints, /FOREIGN KEY \(artist_id, user_id\) REFERENCES soundpub\.artists\(id, artist_user_id\) ON DELETE RESTRICT/);
  assert.match(constraints, /FOREIGN KEY \(artist_id, management_mode\) REFERENCES soundpub\.artists\(id, management_mode\) ON DELETE RESTRICT/);
  const artists = statementStarting('ALTER TABLE soundpub.artists');
  assert.match(artists, /UNIQUE \(id, artist_user_id\)/);
  assert.match(artists, /UNIQUE \(id, management_mode\)/);
});

test('profile, release, and track backfills use only explicit artist user UUIDs', () => {
  for (const [table, alias, userColumn] of [
    ['artist_profiles', 'ap', 'user_id'], ['releases', 'r', 'artist_user_id'], ['tracks', 't', 'artist_user_id'],
  ]) {
    assert.equal(statementStarting(`UPDATE soundpub.${table}`),
      `UPDATE soundpub.${table} AS ${alias} SET artist_id = a.id FROM soundpub.artists AS a WHERE ${alias}.${userColumn} = a.artist_user_id AND ${alias}.artist_id IS NULL`);
  }
  for (const table of ['releases', 'tracks']) {
    assert.equal(statementStarting(`ALTER TABLE soundpub.${table} ADD COLUMN`),
      `ALTER TABLE soundpub.${table} ADD COLUMN artist_id uuid REFERENCES soundpub.artists(id) ON DELETE RESTRICT`);
    const before = statements.indexOf(`ALTER TABLE soundpub.${table} DISABLE TRIGGER ${table}_guard`);
    const update = statements.indexOf(statementStarting(`UPDATE soundpub.${table}`));
    const after = statements.indexOf(`ALTER TABLE soundpub.${table} ENABLE TRIGGER ${table}_guard`);
    assert.ok(before >= 0 && before < update && update < after, 'Backfill must preserve guard metadata and restore guard');
  }
  assert.equal(statements.filter(statement => statement.startsWith('UPDATE ')).length, 3);
});

test('FK lookup and catalog listing indexes cover units, releases, and tracks', () => {
  assert.match(sql, /CREATE INDEX artists_label_custom_unit_id_id_idx ON soundpub\.artists\(label_custom_unit_id, id\);/);
  assert.match(sql, /CREATE INDEX releases_artist_id_created_idx ON soundpub\.releases\(artist_id, created_at DESC, id\);/);
  assert.match(sql, /CREATE INDEX tracks_artist_id_idx ON soundpub\.tracks\(artist_id\);/);
});

test('runtime grants allow only needed columns and keep catalog ownership insert-only', () => {
  assert.match(sql, /REVOKE ALL ON soundpub\.label_custom_units FROM PUBLIC, soundpub_app;/);
  const grants = statements.filter(statement => statement.startsWith('GRANT '));
  assert.deepEqual(grants, [
    'GRANT SELECT ON soundpub.label_custom_units TO soundpub_app',
    'GRANT INSERT (id, owner_user_id, unit_code, name, status) ON soundpub.label_custom_units TO soundpub_app',
    'GRANT UPDATE (name, status, updated_at) ON soundpub.label_custom_units TO soundpub_app',
    'GRANT INSERT (id, label_id, name, verified_at, label_custom_unit_id, management_mode, contact_email, contact_phone) ON soundpub.artists TO soundpub_app',
    'GRANT UPDATE (name, contact_email, contact_phone, verified_at, updated_at) ON soundpub.artists TO soundpub_app',
    'GRANT INSERT (artist_id, user_id, artist_name) ON soundpub.artist_profiles TO soundpub_app',
    'GRANT UPDATE (artist_name, updated_at) ON soundpub.artist_profiles TO soundpub_app',
    'GRANT INSERT (artist_id) ON soundpub.releases, soundpub.tracks TO soundpub_app',
  ]);
  assert.doesNotMatch(sql, /GRANT (?:ALL|EXECUTE)|TO (?:PUBLIC|anon|authenticated)\b|SECURITY DEFINER/i);
});

test('runtime UPDATE grants preserve unit ownership, unit code, and canonical artist bindings', () => {
  const updates = statements.filter(statement => statement.startsWith('GRANT UPDATE '));
  assert.equal(updates.length, 3);
  for (const grant of updates) {
    const columns = /^GRANT UPDATE \(([^)]+)\)/.exec(grant)?.[1]?.split(',').map(column => column.trim());
    assert.ok(columns, 'Runtime UPDATE privileges must name columns explicitly');
    for (const immutable of ['id', 'owner_user_id', 'unit_code', 'label_id', 'label_custom_unit_id',
      'management_mode', 'artist_id', 'artist_user_id', 'user_id']) {
      assert.ok(!columns.includes(immutable), `Unexpected UPDATE privilege for ${immutable}`);
    }
  }
});

test('migration leaves financial behavior untouched and delegates transactions to runner', () => {
  assert.doesNotMatch(sql, /\b(?:BEGIN|COMMIT|ROLLBACK|START TRANSACTION|END)\s*;/i);
  assert.doesNotMatch(sql, /soundpub\.(?:finance_\w*|royalt\w*|payout\w*|payment\w*|local_auth\w*|auth_\w*)\b/i);
  assert.doesNotMatch(sql, /\b(?:balance|price_per_track_snapshot|total_payment_snapshot|CASCADE|DISABLE TRIGGER ALL|DROP TABLE|TRUNCATE)\b/i);
  const touchedTables = [...sql.matchAll(/soundpub\.([a-z_]+)\b/g)].map(match => match[1]);
  const allowed = new Set(['roles', 'label_custom_units', 'backend_users', 'profiles', 'artists', 'artist_profiles', 'releases', 'tracks']);
  for (const table of touchedTables) assert.ok(allowed.has(table!), `Unexpected table ${table}`);
});

const phase2 = readFileSync(new URL('../migrations/0024_label_custom_release_tracks.sql', import.meta.url), 'utf8');
test('Phase 2 canonical guard preserves unresolved history and enforces new matching immutable identity', () => {
  assert.doesNotMatch(phase2, /UPDATE soundpub\.(?:releases|tracks) SET|DISABLE TRIGGER|SECURITY DEFINER/);
  assert.match(phase2, /NEW.artist_id IS DISTINCT FROM OLD.artist_id/);
  assert.match(phase2, /parent.artist_id IS NULL/);
  assert.match(phase2, /NEW.artist_id := parent.artist_id/);
  assert.match(phase2, /NEW.artist_user_id := parent.artist_user_id/);
  assert.match(phase2, /NEW.artist_user_id IS DISTINCT FROM catalog.artist_user_id/);
  assert.match(phase2, /NEW.label_id IS DISTINCT FROM catalog.label_id/);
  assert.match(phase2, /FROM PUBLIC, soundpub_app/);
});
