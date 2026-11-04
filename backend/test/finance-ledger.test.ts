import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { concurrencyPostgres, waitForBlock } from './support/concurrency-postgres.js';
import { withTransaction } from '../src/db/pool.js';
import { postEvent, getBalance, lockAccount, reconcileAccount, parseMoney, formatMoney, roundRatio, type FinanceEventInput } from '../src/finance/index.js';

test('finance exact money rejects lossy boundary inputs', () => {
  for (const v of [1, NaN, Infinity, '1e2', '0.001', '01', '-0', '-0.00', ' 1', '10000000000000000', null]) assert.throws(() => parseMoney(v));
  assert.equal(parseMoney('9999999999999999.99'), 999999999999999999n);
  assert.equal(formatMoney(parseMoney('-123.4')), '-123.40');
  assert.equal(roundRatio(1n,1n,2n),1n);
  assert.equal(roundRatio(-1n,1n,2n),-1n);
  assert.equal(roundRatio(1n,1n,3n),0n);
  assert.equal(roundRatio(2n,1n,3n),1n);
});

test('finance PostgreSQL invariants, rollback, idempotency and deterministic races', { skip: process.env.RUN_DOCKER_TESTS !== '1', timeout: 120_000 }, async t => {
  const fixture = await concurrencyPostgres();
  const { owner, runtime } = fixture;
  const user = randomUUID();
  await owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')`, [user]);
  let sequence = 0;
  const input = (kind: FinanceEventInput['kind'], amount: string, ref = `ref-${++sequence}`): FinanceEventInput => ({
    ownerId:user, kind, amount, businessReference:ref, idempotencyKey:`${kind}:${ref}`, systemActor:'synthetic-test',
    ...(['PAYOUT_SETTLEMENT','PAYMENT_CHARGE','PAYMENT_REFUND'].includes(kind) ? { evidence: `${kind}:${ref}` } : {}),
  });
  const post = (v: FinanceEventInput) => withTransaction(runtime, db => postEvent(db,v));
  const balance = () => withTransaction(runtime, db => getBalance(db,user));
  try {
    await t.test('credit is exact and immutable; replay conflict has no effect', async () => {
      const v = input('ROYALTY_EARNING','1000.00');
      const first = await post(v);
      assert.equal((await post({...v,amount:'1000'})).event.id,first.event.id);
      assert.equal((await post(v)).replayed,true);
      await assert.rejects(post({...v,amount:'1000.01'}),/IDEMPOTENCY_CONFLICT/);
      await assert.rejects(post({...v,idempotencyKey:'different'}),/IDEMPOTENCY_CONFLICT/);
      assert.equal((await balance()).available,'1000.00');
      await assert.rejects(runtime.query('UPDATE soundpub.finance_events SET amount_minor=1'), /permission denied/);
      await assert.rejects(owner.query('UPDATE soundpub.finance_events SET amount_minor=1'), /FINANCE_IMMUTABLE/);
      await assert.rejects(owner.query('DELETE FROM soundpub.finance_events'), /FINANCE_IMMUTABLE/);
    });
    await t.test('one of concurrent 800 requests against 1000 succeeds after blocking', async () => {
      const a = await runtime.connect(), b = await runtime.connect();
      try {
        await a.query('BEGIN'); await b.query('BEGIN');
        const pidA = (await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const pidB = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await postEvent(a,input('PAYOUT_RESERVATION','800.00','payout-a'));
        const pending = postEvent(b,input('PAYOUT_RESERVATION','800.00','payout-b'));
        const rejected = assert.rejects(pending,/FINANCE_INSUFFICIENT_BALANCE/);
        await waitForBlock(owner,pidB,pidA);
        await a.query('COMMIT');
        await rejected;
        await b.query('ROLLBACK');
        assert.deepEqual(await balance(),{currency:'IDR',available:'200.00',reserved:'800.00',settled:'0.00',charged:'0.00',refunded:'0.00'});
      } finally { await a.query('ROLLBACK'); await b.query('ROLLBACK'); a.release(); b.release(); }
    });
    await t.test('release once; settlement cannot reuse released reservation', async () => {
      const release = input('PAYOUT_RELEASE','800.00','payout-a');
      await post(release); await post(release);
      await assert.rejects(post(input('PAYOUT_SETTLEMENT','800.00','payout-a')),/FINANCE_RESERVATION_CONFLICT/);
      assert.equal((await balance()).available,'1000.00');
      assert.equal((await balance()).reserved,'0.00');
    });
    await t.test('settlement consumes reservation exactly once and requires evidence', async () => {
      await post(input('PAYOUT_RESERVATION','300.00','payout-c'));
      await assert.rejects(post(input('PAYOUT_SETTLEMENT','299.00','payout-c')),/FINANCE_RESERVATION_CONFLICT/);
      const paid = input('PAYOUT_SETTLEMENT','300.00','payout-c');
      await post(paid); await post(paid);
      assert.equal((await balance()).available,'700.00');
      assert.equal((await balance()).settled,'300.00');
      assert.equal((await balance()).reserved,'0.00');
      await assert.rejects(post(input('ROYALTY_ADJUSTMENT','-700.01')),/FINANCE_INSUFFICIENT_BALANCE/);
    });
    await t.test('payment/refund isolated from withdrawable earnings, bounded and deduplicated', async () => {
      await assert.rejects(post(input('PAYMENT_REFUND','5.00','missing')),/FINANCE_REFUND_CONFLICT/);
      await post(input('PAYMENT_CHARGE','50.01','invoice'));
      await assert.rejects(post(input('PAYMENT_REFUND','50.02','invoice')),/FINANCE_REFUND_CONFLICT/);
      const refund = input('PAYMENT_REFUND','50.01','invoice');
      await post(refund); await post(refund);
      const duplicateEvidence={...input('PAYMENT_CHARGE','50.01','other-invoice'),evidence:'PAYMENT_CHARGE:invoice'};
      await assert.rejects(post(duplicateEvidence),/FINANCE_CONFLICT/);
      assert.equal((await balance()).available,'700.00');
      assert.equal((await balance()).charged,'50.01');
      assert.equal((await balance()).refunded,'50.01');
    });
    await t.test('caller business failure and outbox failure roll back financial mutation', async () => {
      const before = (await owner.query('SELECT count(*) FROM soundpub.finance_events')).rows[0].count;
      await assert.rejects(withTransaction(runtime,async db => {
        await postEvent(db,input('MANUAL_ADJUSTMENT','1.00'));
        throw Error('business row failed');
      }),/business row failed/);
      await owner.query(`CREATE FUNCTION soundpub.finance_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'synthetic outbox failure'; END; $$;
        CREATE TRIGGER finance_test_failure BEFORE INSERT ON soundpub.outbox_events FOR EACH ROW EXECUTE FUNCTION soundpub.finance_test_fail()`);
      try { await assert.rejects(post(input('MANUAL_ADJUSTMENT','1.00')), /synthetic outbox failure/); }
      finally { await owner.query('DROP TRIGGER finance_test_failure ON soundpub.outbox_events; DROP FUNCTION soundpub.finance_test_fail()'); }
      assert.equal((await owner.query('SELECT count(*) FROM soundpub.finance_events')).rows[0].count,before);
      const integrity = (await owner.query(`SELECT count(*) FROM soundpub.finance_events e
        LEFT JOIN soundpub.finance_audit a ON a.event_id=e.id LEFT JOIN soundpub.outbox_events o ON o.id=a.outbox_id
        WHERE a.event_id IS NULL OR o.id IS NULL`)).rows[0].count;
      assert.equal(integrity,'0');
    });
    await t.test('reconciliation dry run compares complete expected set, no repair', async () => {
      const rows = (await owner.query('SELECT * FROM soundpub.finance_events')).rows;
      const expected = rows.map(row=>({businessReference:row.business_reference,kind:row.kind,
        amount:formatMoney(BigInt(row.amount_minor)),...(row.evidence ? {evidence:row.evidence} : {})}));
      const good = await withTransaction(runtime,db=>reconcileAccount(db,user,expected));
      assert.equal(good.reconciled,true);
      const bad = await withTransaction(runtime,db=>reconcileAccount(db,user,[...expected,{businessReference:'missing',kind:'PAYOUT_SETTLEMENT',amount:'1.00'}]));
      assert.equal(bad.reconciled,false);
      assert.equal(bad.issues[0]?.code,'MISSING_LEDGER_EVENT');
      assert.equal((await owner.query('SELECT count(*) FROM soundpub.finance_events')).rows[0].count,String(rows.length));
      const target=rows[0];
      await owner.query(`UPDATE soundpub.outbox_events SET payload='{}' WHERE idempotency_key=$1`,[`finance:${target.id}`]);
      try {
        const tampered=await withTransaction(runtime,db=>reconcileAccount(db,user,expected));
        assert.equal(tampered.reconciled,false);
        assert.ok(tampered.issues.some(issue=>issue.code==='AUDIT_OR_OUTBOX_MISMATCH'));
      } finally {
        await owner.query(`UPDATE soundpub.outbox_events SET payload=jsonb_build_object('eventId',$1::uuid) WHERE idempotency_key=$2`,[target.id,`finance:${target.id}`]);
      }
    });
    await t.test('concurrent identical credit returns one event and one audit', async () => {
      const a = await runtime.connect(), b = await runtime.connect();
      try {
        await a.query('BEGIN'); await b.query('BEGIN');
        const pidA=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const pidB=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const v = input('ROYALTY_EARNING','0.01','same-credit');
        const first=await postEvent(a,v);
        const pending=postEvent(b,v);
        await waitForBlock(owner,pidB,pidA);
        await a.query('COMMIT');
        const second=await pending;
        await b.query('COMMIT');
        assert.equal(second.event.id,first.event.id); assert.equal(second.replayed,true);
        assert.equal((await balance()).available,'700.01');
      } finally { await a.query('ROLLBACK'); await b.query('ROLLBACK'); a.release(); b.release(); }
    });
    await t.test('DB guard alone serializes raw competing inserts and refuses stale isolation', async () => {
      const other=randomUUID();
      await owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')`,[other]);
      await withTransaction(runtime,async db=>{
        await lockAccount(db,other);
        await postEvent(db,{...input('ROYALTY_EARNING','1000.00'),ownerId:other});
      });
      const a=await runtime.connect(),b=await runtime.connect();
      const raw=`INSERT INTO soundpub.finance_events(owner_id,currency,kind,amount_minor,business_reference,idempotency_key,system_actor)
        VALUES($1,'IDR','PAYOUT_RESERVATION',80000,$2,$2,'raw-test')`;
      try {
        await a.query('BEGIN');await b.query('BEGIN');
        const pidA=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const pidB=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await a.query(raw,[other,'raw-a']);
        const pending=b.query(raw,[other,'raw-b']);
        const rejected=assert.rejects(pending,/FINANCE_INSUFFICIENT_BALANCE/);
        await waitForBlock(owner,pidB,pidA);
        await a.query('COMMIT');await rejected;await b.query('ROLLBACK');
        assert.equal((await withTransaction(runtime,db=>getBalance(db,other))).available,'200.00');
        await a.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        await assert.rejects(a.query(raw,[other,'stale']),/FINANCE_READ_COMMITTED_REQUIRED/);
        await a.query('ROLLBACK');
      } finally {await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();}
    });
    await t.test('simultaneous release and settlement allow one terminal effect', async () => {
      const v=input('PAYOUT_RESERVATION','100.00','terminal-race');await post(v);
      const a=await runtime.connect(),b=await runtime.connect();
      try {
        await a.query('BEGIN');await b.query('BEGIN');
        const pidA=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const pidB=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await postEvent(a,input('PAYOUT_RELEASE','100.00','terminal-race'));
        const pending=postEvent(b,input('PAYOUT_SETTLEMENT','100.00','terminal-race'));
        const rejected=assert.rejects(pending,/FINANCE_RESERVATION_CONFLICT/);
        await waitForBlock(owner,pidB,pidA);
        await a.query('COMMIT');await rejected;await b.query('ROLLBACK');
        assert.equal((await balance()).available,'700.01');assert.equal((await balance()).reserved,'0.00');
      } finally {await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();}
    });
  } finally { await fixture.close(); }
});
