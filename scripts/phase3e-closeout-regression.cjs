const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const name = `soundpub-closeout-${randomUUID()}`;
const docker = (...args) => execFileSync('docker', ['--context', 'desktop-linux', ...args], {
  encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const context = JSON.parse(docker('context', 'inspect', 'desktop-linux'));
assert.match(context[0].Endpoints.docker.Host, /^npipe:\/\//);
let started = false;
try {
  docker('run', '--detach', '--name', name, '--publish', '127.0.0.1::5432',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine');
  started = true;
  const port = Number(docker('inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', name));
  assert.ok(Number.isInteger(port) && port > 0);
  const deadline = Date.now() + 30000;
  while (spawnSync('docker', ['--context', 'desktop-linux', 'exec', name, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' }).status !== 0) {
    assert.ok(Date.now() < deadline, 'Disposable PostgreSQL startup timed out');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  docker('exec', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
    'CREATE ROLE soundpub_owner; CREATE ROLE soundpub_app LOGIN;');
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/DATABASE_URL|DB_.*URL|SUPABASE|XENDIT|SPOTIFY|AWS_|S3_/.test(key)) delete env[key];
  }
  env.DOCKER_CONTEXT = 'desktop-linux';
  for (const [prefix, suffix] of [['DB', ''], ['USERS_DB', '_users'], ['ARTISTS_DB', '_artists'], ['RELEASE_TRACK_DB', '_release_tracks']]) {
    const database = `soundpub_test${suffix}`;
    docker('exec', name, 'createdb', '-U', 'postgres', database);
    env[`${prefix}_TEST_URL`] = `postgresql://postgres@127.0.0.1:${port}/${database}`;
    if (['ARTISTS_DB', 'RELEASE_TRACK_DB'].includes(prefix)) {
      env[`${prefix}_RUNTIME_URL`] = `postgresql://soundpub_app@127.0.0.1:${port}/${database}`;
    }
  }
  const tests = readdirSync(join(root, 'backend/test')).filter(file => file.endsWith('.test.ts')).map(file => `test/${file}`);
  tests.push('../scripts/tests/phase3e-closeout-races.test.ts');
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=2', '--test-timeout=120000', '--test-reporter=tap', ...tests], {
    cwd: join(root, 'backend'), env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 600000,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'Backend regression failed');
  assert.match(result.stdout, /# skipped 0\b/, 'Required skips must be zero');
  for (const script of ['phase3-client.test.cjs', 'phase3b-frontend.test.cjs', 'phase3c-static-scan.cjs', 'phase3e-static-scan.cjs', 'phase3e-closeout-egress.test.cjs']) {
    execFileSync(process.execPath, [join(__dirname, script)], { cwd: root, stdio: 'inherit' });
  }
} finally {
  if (started) docker('rm', '--force', '--volumes', name);
}
