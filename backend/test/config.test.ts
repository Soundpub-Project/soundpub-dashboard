import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config/index.js';

const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://soundpub_app:synthetic-password@localhost:55432/soundpub_test',
  RECONCILIATION_DATABASE_URL: 'postgres://soundpub_reconciler:synthetic-password@localhost:55432/soundpub_test',
  AUDIT_DATABASE_URL: 'postgres://soundpub_auditor:synthetic-password@localhost:55432/soundpub_test',
  OBJECT_STORAGE_ENDPOINT: 'object-storage',
  OBJECT_STORAGE_ACCESS_KEY: 'synthetic-access',
  OBJECT_STORAGE_SECRET_KEY: 'synthetic-storage-secret',
  WEBHOOK_MOCK_SECRET: 'synthetic-webhook-secret',
  AUTH_DELIVERY_SECRET: 'synthetic-auth-delivery-secret-32-chars',
};

test('typed config accepts isolated development/test and applies safe defaults', () => {
  for (const NODE_ENV of ['development', 'test']) {
    const config = loadConfig({ ...valid, NODE_ENV });
    assert.equal(config.NODE_ENV, NODE_ENV);
    assert.equal(config.HOST, '127.0.0.1');
    assert.equal(config.PORT, 3000);
    assert.equal(config.OBJECT_STORAGE_USE_SSL, false);
    assert.equal(config.OBJECT_STORAGE_PUBLIC_ENDPOINT, 'http://127.0.0.1:9100');
    assert.deepEqual(config.OBJECT_STORAGE_BROWSER_ORIGINS, ['http://localhost:8281', 'http://127.0.0.1:8281']);
    assert.equal(config.WORKER_BATCH_SIZE, 10);
    assert.equal(config.FINANCE_RECONCILIATION_INTERVAL_MS, 300000);
    assert.equal(config.FINANCE_RECONCILIATION_ISSUE_LIMIT, 500);
    assert.equal(config.FINANCE_RECONCILIATION_TIMEOUT_MS, 5000);
    assert.equal(config.AUTH_DELIVERY_KEY_ID, 'legacy');
    assert.deepEqual(config.AUTH_DELIVERY_PREVIOUS_KEYS_JSON, {});
  }
  for (const OBJECT_STORAGE_PUBLIC_ENDPOINT of ['http://127.0.0.1:9100', 'http://localhost:19000', 'http://[::1]:9100']) {
    assert.doesNotThrow(() => loadConfig({ ...valid, OBJECT_STORAGE_PUBLIC_ENDPOINT }));
  }
  assert.deepEqual(loadConfig({ ...valid, OBJECT_STORAGE_BROWSER_ORIGINS: 'http://127.0.0.1:8281' }).OBJECT_STORAGE_BROWSER_ORIGINS,
    ['http://127.0.0.1:8281']);
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'postgres', 'db']) {
    assert.doesNotThrow(() => loadConfig({ ...valid, DATABASE_URL: `postgresql://soundpub_app:synthetic-password@${host}/soundpub_dev_review` }));
  }
});

test('config rejects production, staging, remote dependencies and URL overrides before I/O', () => {
  for (const NODE_ENV of ['production', 'staging']) {
    assert.throws(() => loadConfig({ ...valid, NODE_ENV }), /Phase 2/);
  }
  for (const DATABASE_URL of [
    'postgres://soundpub_app:synthetic-password@example.invalid/soundpub_dev',
    'https://soundpub_app:synthetic-password@localhost/soundpub_dev',
    'postgres://soundpub_app:synthetic-password@localhost/production',
    'postgres://soundpub_app:synthetic-password@localhost//soundpub_dev',
    'postgres://localhost/soundpub_dev',
    'postgres://soundpub_app@localhost/soundpub_dev',
    'postgres://postgres:synthetic-password@localhost/soundpub_dev',
    'postgres://supabase_admin:synthetic-password@localhost/soundpub_dev',
    'postgres://soundpub_app:synthetic-password@localhost:99999/soundpub_dev',
    ...['host=example.invalid', 'host=%32%30.%32%30.%32%30.%33', 'user=postgres', 'options=-c%20search_path=public', 'sslkey=/tmp/private.key']
      .map(query => `${valid.DATABASE_URL}?${query}`),
    `${valid.DATABASE_URL}#ignored`,
  ]) assert.throws(() => loadConfig({ ...valid, DATABASE_URL }), /PostgreSQL|isolated/);
  for (const OBJECT_STORAGE_ENDPOINT of ['example.invalid', '20.20.20.3', 'http://object-storage:9000']) {
    assert.throws(() => loadConfig({ ...valid, OBJECT_STORAGE_ENDPOINT }));
  }
  for (const OBJECT_STORAGE_PUBLIC_ENDPOINT of ['http://example.invalid:9000', 'https://127.0.0.1:9100',
    'http://127.0.0.1', 'http://127.0.0.1:9100/path', 'http://127.0.0.1:9100/?token=synthetic']) {
    assert.throws(() => loadConfig({ ...valid, OBJECT_STORAGE_PUBLIC_ENDPOINT }));
  }
  for (const OBJECT_STORAGE_BROWSER_ORIGINS of ['', '*', 'http://example.invalid:8281', 'https://127.0.0.1:8281',
    'http://127.0.0.1', 'http://127.0.0.1:8281/path']) {
    assert.throws(() => loadConfig({ ...valid, OBJECT_STORAGE_BROWSER_ORIGINS }));
  }
  assert.throws(() => loadConfig({ ...valid, UNUSED_PROVIDER_URL: 'https://SUPABASE.CARUBRA.SPACE' }), /isolation violation/);
});

test('invalid config fails without disclosing synthetic credentials', () => {
  for (const override of [
    { DATABASE_URL: 'postgres://%broken:synthetic-password@localhost/soundpub_dev' },
    { DATABASE_URL: 'synthetic-password' },
    { PORT: '0' }, { LOG_LEVEL: 'verbose' }, { WORKER_POLL_MS: '1' },
    { FINANCE_RECONCILIATION_INTERVAL_MS: '9999' }, { FINANCE_RECONCILIATION_ISSUE_LIMIT: '0' },
    { FINANCE_RECONCILIATION_TIMEOUT_MS: '999' },
    { OBJECT_STORAGE_SECRET_KEY: '' }, { OBJECT_STORAGE_USE_SSL: 'yes' },
    { AUTH_DELIVERY_KEY_ID: '../bad' }, { AUTH_DELIVERY_PREVIOUS_KEYS_JSON: '[]' },
    { AUTH_DELIVERY_PREVIOUS_KEYS_JSON: '{"old":"short"}' },
    { DEV_AUTH_TOKENS_JSON: 'not-json' }, { DEV_AUTH_TOKENS_JSON: '[]' },
    { DEV_AUTH_TOKENS_JSON: '{"short":{"issuer":"local","subject":"one"}}' },
    { DEV_AUTH_TOKENS_JSON: '{"synthetic-token":{"issuer":"","subject":"one"}}' },
  ]) {
    assert.throws(() => loadConfig({ ...valid, ...override }), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes('synthetic-password'));
      assert.ok(!error.message.includes('synthetic-storage-secret'));
      return true;
    });
  }
  assert.doesNotThrow(() => loadConfig({ ...valid, DEV_AUTH_TOKENS_JSON: '{"synthetic-token":{"issuer":"local","subject":"one"}}' }));
  assert.doesNotThrow(() => loadConfig({ ...valid, AUTH_DELIVERY_KEY_ID: 'v2',
    AUTH_DELIVERY_PREVIOUS_KEYS_JSON: '{"v1":"synthetic-previous-delivery-secret-32-chars"}' }));
  assert.throws(() => loadConfig({ ...valid, AUTH_DELIVERY_KEY_ID: 'v1',
    AUTH_DELIVERY_PREVIOUS_KEYS_JSON: '{"v1":"synthetic-previous-delivery-secret-32-chars"}' }), /conflicts/);
  assert.throws(() => loadConfig({}));
});
