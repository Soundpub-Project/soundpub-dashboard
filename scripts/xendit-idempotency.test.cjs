const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync('supabase/functions/xendit-webhook/index.ts', 'utf8').replace(/^import .*$/m, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function fixture(kind = 'release', failTable = null) {
  const paymentTable = kind === 'release' ? 'release_payments' : 'copyright_registration_payments';
  const parentTable = kind === 'release' ? 'releases' : 'copyright_registrations';
  const statusKey = kind === 'release' ? 'status' : 'payment_status';
  const rows = { release_payments: [], copyright_registration_payments: [], releases: [], copyright_registrations: [], notifications: [], user_roles: [], profiles: [] };
  rows[paymentTable].push({ id: 'payment-fixture', xendit_invoice_id: 'invoice-fixture', release_id: 'release-fixture', registration_id: 'registration-fixture', user_id: 'user-fixture', amount: '100.00', currency: 'IDR', [statusKey]: 'pending', releases: { title: 'Fixture' } });
  rows[parentTable].push({ id: kind === 'release' ? 'release-fixture' : 'registration-fixture', status: 'awaiting_payment' });
  const writes = {}; let failOnce = failTable; let handler;
  const env = { XENDIT_WEBHOOK_TOKEN: 'fixture-token', SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key', DATABASE_SCHEMA: 'soundpub' };
  function query(table) {
    let filters = [], operation = 'read', values;
    const builder = {
      select() { return this; }, eq(key,value) { filters.push(row => row[key] === value); return this; },
      neq(key,value) { filters.push(row => row[key] !== value); return this; },
      in(key,values) { filters.push(row => values.includes(row[key])); return this; },
      update(value) { operation = 'update'; values = value; return this; },
      upsert(value) { operation = 'upsert'; values = value; return this; },
      insert(value) { operation = 'insert'; values = value; return this; },
      maybeSingle() { return this.run(true); }, single() { return this.run(true); },
      then(resolve,reject) { return this.run(false).then(resolve,reject); },
      async run(single) {
        if ((operation !== 'read' || table === 'user_roles') && failOnce === table) { failOnce = null; return { data: null, error: { message: 'Injected fixture failure' } }; }
        let matches = rows[table].filter(row => filters.every(filter => filter(row)));
        if (operation === 'update') { for (const row of matches) Object.assign(row,values); writes[table] = (writes[table] || 0) + matches.length; }
        if (operation === 'upsert') { matches = (Array.isArray(values) ? values : [values]).filter(value => !rows[table].some(row => row.id === value.id)); rows[table].push(...matches); writes[table] = (writes[table] || 0) + matches.length; }
        if (operation === 'insert') { matches = Array.isArray(values) ? values : [values]; rows[table].push(...matches); writes[table] = (writes[table] || 0) + matches.length; }
        return { data: structuredClone(single ? matches[0] || null : matches), error: null };
      }
    }; return builder;
  }
  vm.runInNewContext(compiled, {
    Deno: { env: { get: key => env[key] }, serve: callback => { handler = callback; } },
    createClient: () => ({ from: query, functions: { invoke: async () => { if (failOnce === 'email') { failOnce = null; return { error: { message: 'Injected email failure' } }; } return { data: {}, error: null }; } } }),
    Response, crypto: require('node:crypto').webcrypto, TextEncoder, console: { log() {}, error() {}, warn() {} },
    fetch: () => { throw new Error('Network forbidden'); }, Intl, Date, Number, String
  });
  async function send(body = { id: 'invoice-fixture', status: 'PAID', amount: 100, currency: 'IDR' }, token = 'fixture-token') {
    const response = await handler({ method: 'POST', headers: new Headers(token === null ? {} : { 'x-callback-token': token }), json: async () => body });
    return { status: response.status, body: await response.json() };
  }
  return { rows, writes, env, send, payment: rows[paymentTable][0], parent: rows[parentTable][0], paymentTable };
}
(async () => {
  let pass = 0, fail = 0;
  async function check(name, action) {
    try { await action(); process.stdout.write('PASS ' + name + '\n'); pass++; }
    catch (error) { process.stdout.write('FAIL ' + name + ': ' + error.message + '\n'); fail++; }
  }
  await check('missing configured token rejects', async () => { const state=fixture(); delete state.env.XENDIT_WEBHOOK_TOKEN; assert.equal((await state.send()).status,503); assert.deepEqual(state.writes,{}); });
  await check('missing caller token rejects', async () => { const state=fixture(); assert.equal((await state.send(undefined,null)).status,403); assert.deepEqual(state.writes,{}); });
  await check('wrong caller token rejects', async () => { const state=fixture(); assert.equal((await state.send(undefined,'wrong-fixture')).status,403); assert.deepEqual(state.writes,{}); });
  await check('missing invoice ID rejects', async () => { const state=fixture(); assert.equal((await state.send({status:'PAID'})).status,400); assert.deepEqual(state.writes,{}); });
  for (const kind of ['release','copyright']) {
    await check(kind+' amount mismatch rejects', async () => { const state=fixture(kind); assert.equal((await state.send({id:'invoice-fixture',status:'PAID',amount:99,currency:'IDR'})).status,409); assert.deepEqual(state.writes,{}); });
    await check(kind+' currency mismatch rejects', async () => { const state=fixture(kind); assert.equal((await state.send({id:'invoice-fixture',status:'PAID',amount:100,currency:'USD'})).status,409); assert.deepEqual(state.writes,{}); });
    await check(kind+' once, twice, ten callbacks settle once', async () => {
      const state=fixture(kind); for(let count=0;count<10;count++) { assert.equal((await state.send()).status,200); assert.equal(state.payment[state.paymentTable==='release_payments'?'status':'payment_status'],'paid'); assert.equal(state.parent.status,kind==='release'?'pending_paid':'paid_pending_review'); assert.equal(state.writes[state.paymentTable],1); }
    });
    await check(kind+' missing amount/currency denied', async () => { const state=fixture(kind); assert.equal((await state.send({id:'invoice-fixture',status:'PAID'})).status,400); });
    await check(kind+' payment write failure retries safely', async () => { const state=fixture(kind,kind==='release'?'release_payments':'copyright_registration_payments'); assert.equal((await state.send()).status,500); assert.equal((await state.send()).status,200); assert.equal(state.writes[state.paymentTable],1); assert.equal(state.parent.status,kind==='release'?'pending_paid':'paid_pending_review'); });
    await check(kind+' parent write failure recovers on retry', async () => { const state=fixture(kind,kind==='release'?'releases':'copyright_registrations'); assert.equal((await state.send()).status,500); assert.equal((await state.send()).status,200); assert.equal(state.parent.status,kind==='release'?'pending_paid':'paid_pending_review'); });
    await check(kind+' PAID then EXPIRED preserves paid', async () => { const state=fixture(kind); await state.send(); await state.send({id:'invoice-fixture',status:'EXPIRED',amount:100,currency:'IDR'}); assert.equal(state.payment[kind==='release'?'status':'payment_status'],'paid'); });
    await check(kind+' concurrent same-state callback CAS', async () => { const state=fixture(kind); const replies=await Promise.all([state.send(),state.send(),state.send()]); assert.ok(replies.every(reply=>[200,503].includes(reply.status))); assert.equal((await state.send()).status,200); assert.equal(state.writes[state.paymentTable],1); });
  }
  for (const kind of ['release','copyright']) {
    await check(kind+' refunded payment must not resurrect', async () => { const state=fixture(kind); state.payment[kind==='release'?'status':'payment_status']='refunded'; const result=await state.send(); assert.ok(result.status===409 || result.body.ignored===true); assert.equal(state.payment[kind==='release'?'status':'payment_status'],'refunded'); });
  }
  await check('release notification write failure recovered', async () => { const state=fixture('release','notifications'); assert.equal((await state.send()).status,500); await state.send(); assert.equal(state.rows.notifications.length,1); });
  for (const kind of ['release','copyright']) {
    await check(kind+' expired then PAID needs reconciliation', async () => { const state=fixture(kind); await state.send({id:'invoice-fixture',status:'EXPIRED',amount:100,currency:'IDR'}); const reply=await state.send(); assert.equal(reply.body.ignored,true); assert.equal(state.payment[kind==='release'?'status':'payment_status'],'expired'); });
    await check(kind+' unknown invoice controlled', async () => { const state=fixture(kind); assert.equal((await state.send({id:'unknown',status:'PAID',amount:100,currency:'IDR'})).status,404); assert.deepEqual(state.writes,{}); });
    await check(kind+' parent review state preserved on duplicate', async () => { const state=fixture(kind); await state.send(); state.parent.status='approved'; await state.send(); assert.equal(state.parent.status,'approved'); });
  }
  await check('exact decimal mismatch beyond Number precision denied', async () => { const state=fixture(); state.payment.amount='9007199254740992.00'; assert.equal((await state.send({id:'invoice-fixture',status:'PAID',amount:'9007199254740993.00',currency:'IDR'})).status,409); });
  await check('unsupported status ignored', async () => { const state=fixture(); assert.equal((await state.send({id:'invoice-fixture',status:'PENDING',amount:100,currency:'IDR'})).body.ignored,true); assert.deepEqual(state.writes,{}); });
  await check('repeated callbacks deduplicate notifications', async () => { const state=fixture(); for(let count=0;count<10;count++) await state.send(); assert.equal(state.rows.notifications.length,1); });
  for (const dependency of ['email','user_roles']) {
    await check(dependency+' failure retries without duplicate effects', async () => { const state=fixture('release',dependency); assert.equal((await state.send()).status,500); assert.equal((await state.send()).status,200); assert.equal(state.rows.notifications.length,1); assert.equal(state.writes.release_payments,1); });
  }
  await check('expired notification failure retries', async () => { const state=fixture('release','notifications'); const body={id:'invoice-fixture',status:'EXPIRED',amount:100,currency:'IDR'}; assert.equal((await state.send(body)).status,500); assert.equal((await state.send(body)).status,200); assert.equal(state.rows.notifications.length,1); assert.equal(state.writes.release_payments,1); });
  for (const amount of [null, true, '', '1e2', 'NaN', '-100']) {
    await check('invalid amount '+JSON.stringify(amount)+' rejected', async () => { const state=fixture(); assert.equal((await state.send({id:'invoice-fixture',status:'PAID',amount,currency:'IDR'})).status,400); assert.deepEqual(state.writes,{}); });
  }
  process.stdout.write(JSON.stringify({pass,fail})+'\n');
  process.exitCode = fail ? 1 : 0;
})().catch(error => { process.stderr.write(error.stack); process.exitCode=2; });
