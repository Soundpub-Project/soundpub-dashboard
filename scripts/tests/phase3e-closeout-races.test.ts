import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { concurrencyPostgres, waitForBlock } from '../../backend/test/support/concurrency-postgres.js';
import { postEvent, getBalance, type FinanceEventInput } from '../../backend/src/finance/index.js';
import { withTransaction } from '../../backend/src/db/pool.js';
import { createRoyaltiesService } from '../../backend/src/royalties/index.js';
import { createPayoutsService } from '../../backend/src/payouts/index.js';
import { createPgPayoutFinance } from '../../backend/src/payouts/finance.js';
import { setTimeout } from 'node:timers/promises';

test('closeout: ordered royalty-credit/payout race and replay preserve balance in both orders', { timeout: 120000 }, async context => {
  const fixture = await concurrencyPostgres();
  try {
    for (const firstKind of ['ROYALTY_EARNING', 'PAYOUT_RESERVATION'] as const) {
      await context.test(firstKind, async () => {
        const ownerId = randomUUID();
        await fixture.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')", [ownerId]);
        const event = (kind: FinanceEventInput['kind'], amount: string, ref: string): FinanceEventInput => ({
          ownerId, kind, amount, businessReference: ref, idempotencyKey: `${kind}:${ref}`, systemActor: 'closeout-local',
        });
        const earning = event('ROYALTY_EARNING', '400.00', 'new-import');
        const payout = event('PAYOUT_RESERVATION', '800.00', 'new-payout');
        await withTransaction(fixture.runtime, db => postEvent(db, event('ROYALTY_EARNING', '1000.00', 'existing')));
        const first = await fixture.runtime.connect();
        const second = await fixture.runtime.connect();
        let pending: ReturnType<typeof postEvent> | undefined;
        try {
          await first.query('BEGIN');
          await second.query('BEGIN');
          const firstPid = (await first.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
          const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
          await postEvent(first, firstKind === 'ROYALTY_EARNING' ? earning : payout);
          pending = postEvent(second, firstKind === 'ROYALTY_EARNING' ? payout : earning);
          pending.catch(() => undefined);
          await waitForBlock(fixture.owner, secondPid, firstPid);
          await first.query('COMMIT');
          await pending;
          await second.query('COMMIT');
        } finally {
          await first.query('ROLLBACK');
          if (pending) await pending.catch(() => undefined);
          await second.query('ROLLBACK');
          first.release();
          second.release();
        }
        await withTransaction(fixture.runtime, async db => {
          assert.equal((await postEvent(db, earning)).replayed, true);
          assert.equal((await postEvent(db, payout)).replayed, true);
          assert.deepEqual(await getBalance(db, ownerId), {
            currency: 'IDR', available: '600.00', reserved: '800.00', settled: '0.00', charged: '0.00', refunded: '0.00',
          });
        });
        const events = (await fixture.owner.query('SELECT kind,count(*)::int AS count FROM soundpub.finance_events WHERE owner_id=$1 GROUP BY kind ORDER BY kind', [ownerId])).rows;
        assert.deepEqual(events, [{ kind: 'PAYOUT_RESERVATION', count: 1 }, { kind: 'ROYALTY_EARNING', count: 2 }]);
      });
    }
  } finally { await fixture.close(); }
});

test('closeout: actual import blocks concurrent payout until credit commits; replay adds no effect', { timeout: 120000 }, async () => {
  const fixture = await concurrencyPostgres();
  const label = { id: randomUUID(), status: 'active' as const, roles: ['label' as const] };
  const admin = { id: randomUUID(), status: 'active' as const, roles: ['admin' as const] };
  try {
    for (const actor of [label, admin]) {
      await fixture.owner.query("INSERT INTO soundpub.backend_users(id,status,email_verified_at) VALUES($1,'active',now())", [actor.id]);
      await fixture.owner.query('INSERT INTO soundpub.profiles(id) VALUES($1)', [actor.id]);
      await fixture.owner.query('INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES($1,$2,now())', [actor.id, actor.roles[0]]);
    }
    const release = randomUUID(), track = randomUUID();
    await fixture.owner.query(`INSERT INTO soundpub.releases(id,label_id,artist_user_id,created_by,title,artist_name)
      VALUES($1,$2,$2,$2,'Synthetic closeout','Synthetic')`, [release, label.id]);
    await fixture.owner.query(`INSERT INTO soundpub.tracks(id,release_id,artist_user_id,title,artist_name,position)
      VALUES($1,$2,$3,'Synthetic','Synthetic',1)`, [track, release, label.id]);
    await withTransaction(fixture.runtime, db => postEvent(db, { ownerId: label.id, kind: 'ROYALTY_EARNING', amount: '1000.00',
      businessReference: 'existing', idempotencyKey: 'existing', systemActor: 'closeout-local' }));
    const royalties = createRoyaltiesService(fixture.runtime);
    const payouts = createPayoutsService(fixture.runtime, createPgPayoutFinance(async () => ({
      minimum: '100.00', destinationReady: true, reconciled: true,
    })));
    const statement = { source: 'synthetic-closeout', period: '2026-10', currency: 'IDR', filename: 'synthetic.json', rows: [{
      source_row_id: 'synthetic-1', beneficiary_id: label.id, release_id: release, track_id: track,
      gross_amount: '400.00', deduction_amount: '0.00', net_amount: '400.00',
    }] };
    const input = { amount: '800.00', currency: 'IDR', bank_name: 'Synthetic', account_number: '12345678', account_holder_name: 'Synthetic' };
    const gate = await fixture.runtime.connect();
    let importing: ReturnType<typeof royalties.commit> | undefined;
    let paying: ReturnType<typeof payouts.request> | undefined;
    try {
      await gate.query('BEGIN');
      await gate.query('SELECT owner_id FROM soundpub.finance_accounts WHERE owner_id=$1 FOR UPDATE', [label.id]);
      const gatePid = (await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      importing = royalties.commit(admin, statement, 'closeout-import');
      importing.catch(() => undefined);
      const blockedBy = async (pid: number) => {
        const deadline = Date.now() + 5000;
        for (;;) {
          const rows = (await fixture.owner.query(`SELECT pid FROM pg_stat_activity
            WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))`, [pid])).rows;
          if (rows.length) return rows[0].pid as number;
          assert.ok(Date.now() < deadline, 'Expected service transaction to block');
          await setTimeout(10);
        }
      };
      const importPid = await blockedBy(gatePid);
      paying = payouts.request(label, input, 'closeout-payout');
      paying.catch(() => undefined);
      const payoutPid = await blockedBy(importPid);
      await waitForBlock(fixture.owner, payoutPid, importPid);
      await gate.query('COMMIT');
      const imported = await importing;
      const paid = await paying;
      assert.equal((await royalties.commit(admin, statement, 'import-replay')).id, imported.id);
      assert.equal((await payouts.request(label, input, 'closeout-payout')).id, paid.id);
      await withTransaction(fixture.runtime, async db => {
        const balance = await getBalance(db, label.id);
        assert.equal(balance.available, '600.00');
        assert.equal(balance.reserved, '800.00');
      });
      assert.equal((await fixture.owner.query('SELECT count(*) FROM soundpub.royalty_import_entries')).rows[0].count, '1');
      assert.equal((await fixture.owner.query('SELECT count(*) FROM soundpub.payout_requests')).rows[0].count, '1');
      const missing = await fixture.owner.query(`SELECT e.id FROM soundpub.finance_events e
        LEFT JOIN soundpub.finance_audit a ON a.event_id=e.id LEFT JOIN soundpub.outbox_events o ON o.id=a.outbox_id
        WHERE a.event_id IS NULL OR o.id IS NULL`);
      assert.equal(missing.rowCount, 0);
      await payouts.transition(admin, paid.id, { status: 'approved' }, 'closeout-approve');
      await gate.query('BEGIN');
      await gate.query('SELECT owner_id FROM soundpub.finance_accounts WHERE owner_id=$1 FOR UPDATE', [label.id]);
      const settling = payouts.settleMock(admin, paid.id, 'synthetic-closeout-settlement', 'closeout-settle');
      settling.catch(() => undefined);
      const settlePid = await blockedBy(gatePid);
      const cancelling = payouts.cancel(label, paid.id, 'closeout-cancel');
      cancelling.catch(() => undefined);
      const terminalResults = Promise.allSettled([settling, cancelling]);
      const cancelPid = await blockedBy(settlePid);
      await waitForBlock(fixture.owner, cancelPid, settlePid);
      await gate.query('COMMIT');
      const results = await terminalResults;
      assert.equal(results[0].status, 'fulfilled');
      assert.equal(results[1].status, 'rejected');
      assert.equal((await payouts.detail(label, paid.id)).status, 'paid');
      await withTransaction(fixture.runtime, async db => {
        const balance = await getBalance(db, label.id);
        assert.equal(balance.available, '600.00');
        assert.equal(balance.reserved, '0.00');
        assert.equal(balance.settled, '800.00');
      });
      assert.equal((await fixture.owner.query("SELECT count(*) FROM soundpub.finance_events WHERE kind='PAYOUT_RELEASE'")).rows[0].count, '0');
    } finally {
      await gate.query('ROLLBACK');
      await Promise.allSettled([importing, paying]);
      gate.release();
    }
  } finally { await fixture.close(); }
});
