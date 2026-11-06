import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import test from 'node:test';
import pg from 'pg';
import { migrate } from '../src/db/migrate.js';
import { postEvent } from '../src/finance/index.js';
import { withTransaction } from '../src/db/pool.js';
import { dockerTestsEnabled, testComposeResource } from './support/concurrency-postgres.js';

const source = new URL('../migrations/', import.meta.url);
const target = '0057_payment_owner_snapshots.sql';

for (const scenario of ['canonical', 'unresolved', 'charge-owner-mismatch', 'refund-owner-mismatch'] as const) {
  const unresolved = scenario === 'unresolved';
  const failsClosed = scenario !== 'canonical';
  test(`0056 -> 0057 populated upgrade: ${scenario}`, {
    skip: !dockerTestsEnabled,
    timeout: 180_000,
  }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'soundpub-payment-owner-migration-'));
    const resource = testComposeResource('test-postgres');
    let pool: pg.Pool | undefined;
    try {
      const address = resource.start();
      pool = new pg.Pool({ host: '127.0.0.1', port: Number(address.split(':')[1]),
        database: 'soundpub_test', user: 'postgres', connectionTimeoutMillis: 1000,
        options: '-c search_path=soundpub,public -c statement_timeout=15000 -c lock_timeout=10000' });
      const deadline = Date.now() + 30_000;
      for (;;) {
        try { await pool.query('SELECT 1'); break; }
        catch (error) { if (Date.now() >= deadline) throw error; await setTimeout(100); }
      }
      await pool.query('CREATE ROLE soundpub_owner; CREATE ROLE soundpub_app LOGIN; CREATE ROLE soundpub_reconciler LOGIN; CREATE ROLE soundpub_auditor LOGIN');
      const names = (await readdir(source)).filter(name => /^\d{4}_.*\.sql$/.test(name) && Number(name.slice(0, 4)) <= 56).sort();
      assert.ok(names.at(-1)?.startsWith('0056_'));
      const copyThrough = async (version: number) => {
        for (const name of names.filter(name => Number(name.slice(0, 4)) <= version)) {
          await copyFile(new URL(name, source), join(directory, name));
        }
        return migrate(pool!, { directory });
      };

      // Seed real pre-canonical history, without disabling any identity guards.
      await copyThrough(22);
      const ownerId = randomUUID(), labelId = randomUUID(), artistId = randomUUID(), releaseId = randomUUID(), invoiceId = randomUUID();
      await pool.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')", [labelId]);
      await pool.query("INSERT INTO soundpub.profiles(id,full_name) VALUES($1,'Synthetic migration label')", [labelId]);
      await pool.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')", [ownerId]);
      await pool.query("INSERT INTO soundpub.profiles(id,full_name,parent_label_id) VALUES($1,'Synthetic migration artist',$2)", [ownerId, labelId]);
      await pool.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,'artist',now())", [ownerId]);
      if (!unresolved) await pool.query(`INSERT INTO soundpub.artists(id,label_id,artist_user_id,name,verified_at)
        VALUES($1,$2,$3,'Synthetic migration artist',now())`, [artistId, labelId, ownerId]);
      await pool.query(`INSERT INTO soundpub.releases(id,label_id,artist_user_id,created_by,title,artist_name,
        price_per_track_snapshot,total_payment_snapshot)
        VALUES($1,$3,$2,$2,'Synthetic migration release','Synthetic migration artist',50000,50000)`, [releaseId, ownerId, labelId]);
      await pool.query(`INSERT INTO soundpub.payment_invoices(id,business_id,provider_invoice_id,amount_minor,idempotency_key)
        VALUES($1,$2,$3,5000000,$4)`, [invoiceId, releaseId, `mock_${invoiceId}`, `migration:${invoiceId}`]);
      await pool.query(`INSERT INTO soundpub.payment_mock_invoices(provider_invoice_id,amount_minor,currency,status)
        VALUES($1,5000000,'IDR','PENDING')`, [`mock_${invoiceId}`]);
      await copyThrough(56);
      assert.deepEqual(await migrate(pool, { directory }), []);
      assert.equal((await pool.query('SELECT artist_id FROM soundpub.releases WHERE id=$1', [releaseId])).rows[0].artist_id,
        unresolved ? null : artistId);
      if (!unresolved) {
        const binding = (await pool.query(`SELECT r.artist_user_id AS legacy_owner,a.artist_user_id AS canonical_owner
          FROM soundpub.releases r JOIN soundpub.artists a ON a.id=r.artist_id WHERE r.id=$1`, [releaseId])).rows[0];
        assert.deepEqual(binding, { legacy_owner: ownerId, canonical_owner: ownerId });
        await withTransaction(pool, async db => {
          const chargeOwner = scenario === 'charge-owner-mismatch' ? labelId : ownerId;
          await postEvent(db, { ownerId: chargeOwner, kind: 'PAYMENT_CHARGE', amount: '50000.00',
            businessReference: invoiceId, idempotencyKey: `charge:${invoiceId}`, systemActor: 'migration-fixture', evidence: 'synthetic-charge' });
          if (scenario === 'refund-owner-mismatch') {
            // A refund needs its own owner's charge. Keep both historical owners as evidence; never rewrite ledger rows.
            await postEvent(db, { ownerId: labelId, kind: 'PAYMENT_CHARGE', amount: '50000.00',
              businessReference: invoiceId, idempotencyKey: `other-charge:${invoiceId}`, systemActor: 'migration-fixture', evidence: 'synthetic-other-charge' });
            await postEvent(db, { ownerId: labelId, kind: 'PAYMENT_REFUND', amount: '50000.00',
              businessReference: invoiceId, idempotencyKey: `refund:${invoiceId}`, systemActor: 'migration-fixture', evidence: 'synthetic-refund' });
          }
        });
      }
      const ledgerBefore = (await pool.query('SELECT * FROM soundpub.finance_events ORDER BY id')).rows;
      const history = (await pool.query('SELECT * FROM soundpub.schema_migrations ORDER BY name')).rows;
      const before = (await pool.query('SELECT * FROM soundpub.payment_invoices ORDER BY id')).rows;
      const releasesBefore = (await pool.query('SELECT * FROM soundpub.releases ORDER BY id')).rows;
      const providerBefore = (await pool.query('SELECT * FROM soundpub.payment_mock_invoices')).rows;
      await copyFile(new URL(target, source), join(directory, target));

      if (failsClosed) {
        await assert.rejects(migrate(pool, { directory }), (error: unknown) => {
          const failure = error as { code?: string; message?: string };
          return failure.code === 'P0001' && failure.message === 'Existing payment invoice has no canonical owner snapshot';
        });
        assert.deepEqual((await pool.query('SELECT * FROM soundpub.schema_migrations ORDER BY name')).rows, history);
        assert.deepEqual((await pool.query('SELECT * FROM soundpub.payment_invoices ORDER BY id')).rows, before);
        assert.equal((await pool.query(`SELECT count(*)::int n FROM information_schema.columns
          WHERE table_schema='soundpub' AND table_name='payment_invoices'
          AND column_name IN ('payer_owner_id','financial_owner_id','artist_id','ownership_policy')`)).rows[0].n, 0);
        assert.equal((await pool.query("SELECT to_regprocedure('soundpub.payment_invoice_owner_guard()') AS guard")).rows[0].guard, null);
        assert.equal((await pool.query("SELECT to_regclass('soundpub.payment_invoices_financial_owner_idx') AS idx")).rows[0].idx, null);
      } else {
        assert.deepEqual(await migrate(pool, { directory }), [target]);
        const { payer_owner_id, financial_owner_id, artist_id, ownership_policy, ...unchanged } =
          (await pool.query('SELECT * FROM soundpub.payment_invoices WHERE id=$1', [invoiceId])).rows[0];
        assert.deepEqual({ payer_owner_id, financial_owner_id, artist_id, ownership_policy }, {
          payer_owner_id: ownerId, financial_owner_id: ownerId, artist_id: artistId, ownership_policy: 'LOGIN_ACCOUNT',
        });
        assert.deepEqual(unchanged, before[0]);
        const after = (await pool.query('SELECT * FROM soundpub.schema_migrations ORDER BY name')).rows;
        assert.deepEqual(after.slice(0, -1), history);
        assert.equal(after.at(-1)?.name, target);
        assert.deepEqual(await migrate(pool, { directory }), []);
        await assert.rejects(pool.query("UPDATE soundpub.payment_invoices SET ownership_policy='LABEL_CUSTOM_PIC' WHERE id=$1", [invoiceId]),
          (error: unknown) => (error as { code?: string }).code === '23514');
      }
      assert.deepEqual((await pool.query('SELECT * FROM soundpub.releases ORDER BY id')).rows, releasesBefore);
      assert.deepEqual((await pool.query('SELECT * FROM soundpub.payment_mock_invoices')).rows, providerBefore);
      assert.deepEqual((await pool.query('SELECT * FROM soundpub.finance_events ORDER BY id')).rows, ledgerBefore);
    } finally {
      try { await pool?.end(); }
      finally {
        try { resource.close(); }
        finally { await rm(directory, { recursive: true, force: true }); }
      }
    }
  });
}
