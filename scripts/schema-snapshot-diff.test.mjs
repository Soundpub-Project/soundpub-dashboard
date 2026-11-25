import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeSql, compareSnapshots, tokenizeStatements } from './schema-snapshot-diff.mjs';

test('SQL statement scanner preserves quoted semicolons and handles nested comments', () => {
  const statements = tokenizeStatements(`
    /* outer ; /* nested ; */ still comment */
    CREATE TABLE soundpub.items (value text DEFAULT 'a;''b');
    CREATE FUNCTION soundpub.example() RETURNS text LANGUAGE sql AS $body$
      SELECT 'inside; body';
    $body$;
  `);

  assert.equal(statements.length, 2);
});

test('snapshot comparison normalizes formatting and policy role order', () => {
  const backup = `
    CREATE TABLE soundpub.items (id integer NOT NULL);
    CREATE POLICY "read items" ON soundpub.items TO authenticated, anon USING (true);
  `;
  const canonical = `
    -- dump formatting differs
    create table soundpub.items ( id integer not null );
    CREATE POLICY "read items" ON soundpub.items TO anon, authenticated USING (true);
  `;

  const { result } = compareSnapshots(backup, canonical);
  assert.deepEqual(result.map(item => item.status), ['identical', 'identical']);
});

test('snapshot comparison catches changed column and function body definitions', () => {
  const backup = `
    CREATE TABLE soundpub.items (id integer NOT NULL);
    CREATE FUNCTION soundpub.example() RETURNS integer LANGUAGE sql AS $$ SELECT 1; $$;
  `;
  const canonical = `
    CREATE TABLE soundpub.items (id bigint NOT NULL);
    CREATE FUNCTION soundpub.example() RETURNS integer LANGUAGE sql AS $body$ SELECT 2; $body$;
  `;

  const { result } = compareSnapshots(backup, canonical);
  assert.deepEqual(result.map(item => item.status), ['changed', 'changed']);
  assert.deepEqual([...analyzeSql(backup).values()].map(item => item.kind), ['table', 'function']);
});

test('owner statements are reported separately from object definitions', () => {
  const backup = 'CREATE TABLE soundpub.items (id integer);';
  const canonical = `
    CREATE TABLE soundpub.items (id integer);
    ALTER TABLE soundpub.items OWNER TO postgres;
  `;

  const { result, ownership } = compareSnapshots(backup, canonical);
  assert.deepEqual(result.map(item => item.status), ['identical']);
  assert.deepEqual(ownership, { backup: 0, canonical: 1 });
});

test('a missing row-security setting is a table definition difference', () => {
  const backup = 'CREATE TABLE soundpub.limits (id integer);';
  const canonical = `
    CREATE TABLE soundpub.limits (id integer);
    ALTER TABLE soundpub.limits ENABLE ROW LEVEL SECURITY;
  `;

  const { result } = compareSnapshots(backup, canonical);
  assert.deepEqual(result.map(item => item.status), ['changed']);
  assert.equal(result[0].id, 'soundpub.limits');
});

test('default privileges are classified as ACLs and database setup is excluded', () => {
  const groups = analyzeSql(`
    CREATE DATABASE postgres;
    ALTER DATABASE postgres SET timezone = 'UTC';
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA soundpub GRANT SELECT ON TABLES TO authenticated;
  `);

  assert.deepEqual([...groups.values()].map(item => item.kind), ['privilege']);
});

test('LF/CRLF-only function body differences are not reported as substantive', () => {
  const backup = 'CREATE FUNCTION soundpub.example() RETURNS text LANGUAGE sql AS $$SELECT 1;\n$$;';
  const canonical = 'CREATE FUNCTION soundpub.example() RETURNS text LANGUAGE sql AS $$SELECT 1;\r\n$$;';

  const { result } = compareSnapshots(backup, canonical);
  assert.deepEqual(result.map(item => item.status), ['line-ending-only']);
});

test('malformed quoted SQL fails explicitly', () => {
  assert.throws(() => tokenizeStatements("CREATE TABLE broken (value text DEFAULT 'unterminated);"), /Unterminated string/);
});
