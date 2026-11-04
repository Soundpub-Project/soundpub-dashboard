const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');

const container = `soundpub-agenth-${process.pid}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const sql = (input) => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input, encoding: 'utf8' });
const sqlError = (input) => {
  try { sql(input); } catch (error) { return `${error.message}\n${error.stderr || ''}`; }
  return '';
};
const actors = ['user', 'artist', 'label', 'owner', 'other-owner', 'admin', 'superadmin', 'inactive', 'suspended', 'copyright'];
const identity = (index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
try {
  docker('run', '-d', '--name', container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine');
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { docker('exec', container, 'pg_isready', '-U', 'postgres'); ready = true; break; } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  assert.ok(ready, 'isolated PostgreSQL ready');
  sql(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA soundpub;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE soundpub.actors(id uuid PRIMARY KEY, role text);
    INSERT INTO soundpub.actors VALUES ${actors.map((role, index) => `('${identity(index)}','${role}')`).join(',')};
    CREATE FUNCTION soundpub.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=soundpub AS $$ SELECT EXISTS(SELECT 1 FROM soundpub.actors WHERE id=user_id AND role IN ('admin','superadmin')) $$;
    CREATE TABLE soundpub.copyright_registrations(id uuid PRIMARY KEY, user_id uuid);
    INSERT INTO soundpub.copyright_registrations VALUES ('10000000-0000-4000-8000-000000000001','${identity(3)}'),('10000000-0000-4000-8000-000000000002','${identity(7)}'),('10000000-0000-4000-8000-000000000003','${identity(8)}');
    CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean, updated_at timestamptz);
    INSERT INTO storage.buckets VALUES ('contracts',true,now());
    CREATE TABLE storage.objects(bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA auth,storage,soundpub TO authenticated,anon;
    GRANT SELECT ON soundpub.copyright_registrations TO authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,anon;
    INSERT INTO storage.objects VALUES ('contracts','stamped/10000000-0000-4000-8000-000000000001/fixture.pdf'),('contracts','stamped/10000000-0000-4000-8000-000000000002/fixture.pdf'),('contracts','stamped/10000000-0000-4000-8000-000000000003/fixture.pdf');`);
  sql(readFileSync('supabase/migrations/20261026215612_make_contracts_private.sql', 'utf8'));
  assert.equal(sql('SELECT public FROM storage.buckets;').trim(), 'f');
  for (const [index, actor] of actors.entries()) {
    const expected = ['admin', 'superadmin'].includes(actor) ? 3 : ['owner', 'inactive', 'suspended'].includes(actor) ? 1 : 0;
    const visible = sql(`SET ROLE authenticated; SET request.jwt.claim.sub='${identity(index)}'; SELECT count(*) FROM storage.objects;`).trim().split('\n').at(-1);
    assert.equal(Number(visible), expected, actor);
    console.log(`${actor}: ${visible} visible contracts`);
  }
  assert.equal(sql('SET ROLE anon; SELECT count(*) FROM storage.objects;').trim().split('\n').at(-1), '0');
  for (const index of [3, 5, 6]) {
    const operation = `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${identity(index)}'; INSERT INTO storage.objects VALUES ('contracts','stamped/10000000-0000-4000-8000-000000000001/new.pdf'); UPDATE storage.objects SET name='stamped/10000000-0000-4000-8000-000000000001/replaced.pdf' WHERE name LIKE '%/new.pdf'; DELETE FROM storage.objects WHERE name LIKE '%/replaced.pdf'; ROLLBACK;`;
    if (index === 3) assert.match(sqlError(operation), /row-level security/);
    else assert.match(sql(operation), /INSERT 0 1\nUPDATE 1\nDELETE 1/);
  }
  console.log('SQL fixture checks passed; inactive/suspended owner reads remain allowed. No JWT/Storage HTTP or production acceptance claimed.');
} finally {
  docker('rm', '-f', '-v', container);
}
