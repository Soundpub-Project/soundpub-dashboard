import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import type { Principal } from '../src/api/types.js';
import { createExportsService } from '../src/exports/index.js';
import { concurrencyPostgres } from './support/concurrency-postgres.js';

test('admin exports: superadmin-only, bounded snapshot CSV and audit evidence', {
  skip: process.env.RUN_DOCKER_TESTS !== '1',
}, async () => {
  const database = await concurrencyPostgres();
  const superId = '00000000-0000-4000-8000-000000000801';
  const adminId = '00000000-0000-4000-8000-000000000802';
  const marker = 'NEVER_EXPORT_PRIVATE_MARKER';
  const actors = new Map<string, Principal>([
    ['super', { id: superId, status: 'active', roles: ['superadmin'] }],
    ['admin', { id: adminId, status: 'active', roles: ['admin'] }],
    ['forged', { id: adminId, status: 'active', roles: ['superadmin'] }],
  ]);
  try {
    await database.owner.query(`INSERT INTO soundpub.backend_users(id,email,status,migration_source)
      VALUES ($1,'super@example.test','active',$3::jsonb),($2,'admin@example.test','active','{}'::jsonb)`,
    [superId, adminId, JSON.stringify({ password: marker, refresh_token: marker })]);
    await database.owner.query(`INSERT INTO soundpub.profiles(id,full_name) VALUES ($1,$3),($2,'Admin')`,
      [superId, adminId, '=HYPERLINK("https://example.test")']);
    await database.owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at)
      VALUES ($1,'superadmin',now()),($2,'admin',now())`, [superId, adminId]);
    await database.owner.query(`UPDATE soundpub.application_settings SET settings=$1::jsonb WHERE id=true`,
      [JSON.stringify({ smtp_password: marker, auth_notice_config: { enabled: true, title: '+unsafe', badge: '',
        message: '', detail: '', buttonText: '', revision: '1' } })]);

    const app = buildApp({
      exports: createExportsService(database.runtime),
      auth: { authenticate: async token => actors.get(token) ?? null },
      readiness: { check: async () => true },
      admin: { suspendUser: async () => undefined },
      webhooks: { receive: async () => true },
      rateLimiter: { consume: async () => ({ allowed: true }) },
    });
    try {
      const call = (token: string, dataset: string, query = '') => app.inject({
        method: 'GET', url: `/api/v1/admin/exports/${dataset}${query}`,
        headers: { authorization: `Bearer ${token}`, origin: 'http://127.0.0.1:8281' },
      });
      assert.equal((await call('admin', 'profiles')).statusCode, 403);
      assert.equal((await call('forged', 'profiles')).statusCode, 403);
      assert.equal((await call('super', 'unknown')).statusCode, 400);
      assert.equal((await call('super', 'profiles', '?limit=0')).statusCode, 400);
      const openapi = await app.inject({ method: 'GET', url: '/openapi.json' });
      assert.equal(openapi.statusCode, 200);
      assert.equal(openapi.json().paths['/api/v1/admin/exports/{dataset}'].get.responses['200']
        .content['text/csv'].schema.type, 'string');

      const oversized = await call('super', 'profiles', '?limit=1');
      assert.equal(oversized.statusCode, 409, oversized.body);
      assert.equal(oversized.json().error.code, 'EXPORT_TOO_LARGE');

      const first = await call('super', 'profiles', '?limit=2');
      assert.equal(first.statusCode, 200, first.body);
      assert.match(first.headers['content-type'] as string, /^text\/csv/);
      assert.equal(first.headers['x-export-row-count'], '2');
      assert.equal(first.headers['x-export-next-offset'], undefined);
      assert.match(first.headers['access-control-expose-headers'] as string, /X-Export-Row-Count/);
      assert.ok(first.body.includes("'=HYPERLINK"), first.body);
      assert.ok(!first.body.includes(marker));
      assert.ok(!first.body.includes('migration_source'));

      const settings = await call('super', 'app_settings');
      assert.equal(settings.statusCode, 200, settings.body);
      assert.ok(settings.body.includes("'+unsafe"), settings.body);
      assert.ok(!settings.body.includes(marker));
      assert.ok(!settings.body.includes('smtp_password'));

      for (const dataset of ['artists','releases','tracks','royalties','royalty_uploads','payout_requests','audit_logs','user_roles']) {
        const response = await call('super', dataset);
        assert.equal(response.statusCode, 200, `${dataset}: ${response.body}`);
      }

      const audits = await database.owner.query(`SELECT action,resource_type,resource_id,metadata
        FROM soundpub.audit_logs WHERE actor_user_id=$1 ORDER BY created_at,id`, [superId]);
      assert.equal(audits.rowCount, 10);
      assert.deepEqual(new Set(audits.rows.map(row => row.resource_id)), new Set([
        'profiles','app_settings','artists','releases','tracks','royalties','royalty_uploads',
        'payout_requests','audit_logs','user_roles',
      ]));
      assert.ok(audits.rows.every(row => row.action === 'data.exported' && row.resource_type === 'data_export'));
      assert.ok(audits.rows.every(row => Number.isInteger(row.metadata.byteCount)));
      assert.ok(audits.rows.every(row => /^[a-f0-9]{64}$/.test(row.metadata.sha256)));
      assert.equal(audits.rows.find(row => row.resource_id === 'profiles')?.metadata.rowCount, 2);
    } finally { await app.close(); }
  } finally { await database.close(); }
});

