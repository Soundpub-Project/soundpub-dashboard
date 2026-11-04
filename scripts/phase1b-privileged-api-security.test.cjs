const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { webcrypto } = require('node:crypto')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const callerId = '00000000-0000-4000-8000-000000000001'
const recipientId = '00000000-0000-4000-8000-000000000002'
const payoutId = '00000000-0000-4000-8000-000000000003'
const jwt = claims => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic-test-signature`
const now = Date.parse('2026-10-27T04:30:00Z')
const serviceKey = jwt({ role: 'service_role', exp: now / 1000 + 3600 })
const payment = { templateName: 'payment-success', recipientUserId: recipientId, templateData: { title: 'Fixture release', amount: 100, trackCount: 1 } }
const announcement = { templateName: 'announcement', broadcastRoles: ['artist'], templateData: { title: 'Fixture', message: 'Fixture message' } }
const payout = { templateName: 'payout-requested', broadcastRoles: ['admin', 'superadmin'], templateData: { userName: 'Untrusted name', amount: 100, bankName: 'Fixture bank', accountNumber: '0000', accountHolderName: 'Fixture owner' } }
const compiled = new Map()

function fixture(overrides = {}) {
  return {
    now, role: 'artist', status: 'active', queries: [], writes: [], providerCalls: [], rates: new Map(), emailLog: [],
    payout: { id: payoutId, user_id: callerId, status: 'pending', created_at: new Date(now).toISOString(), amount: 100, bank_name: 'Fixture bank', account_number: '0000', account_holder_name: 'Fixture owner' },
    env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: serviceKey, DATABASE_SCHEMA: 'soundpub', APP_URL: 'https://fixture.invalid', LOVABLE_API_KEY: 'synthetic-provider', GOOGLE_MAIL_API_KEY: 'synthetic-mail', GOOGLE_DRIVE_API_KEY: 'synthetic-drive' },
    ...overrides,
  }
}

function client(state) {
  return {
    auth: { getUser: async token => token === 'user-token'
      ? { data: { user: { id: callerId, user_metadata: { role: 'superadmin' } } }, error: null }
      : { data: { user: null }, error: { message: 'Invalid or expired token' } } },
    from(table) {
      let operation = 'select'
      let payload
      let columns = ''
      const filters = []
      let singular = false
      const matches = row => row && filters.every(([kind, field, value]) => kind === 'gte' ? row[field] >= value : kind === 'in' ? value.includes(row[field]) : String(row[field]) === String(value))
      const execute = () => {
        state.queries.push({ table, operation, filters, columns })
        if (state.failTable === table && (!state.failOperation || state.failOperation === operation)) return { data: null, error: { code: 'XX000' } }
        if (table === 'rate_limits' && operation === 'insert') {
          const key = JSON.stringify([payload.identifier, payload.action_type])
          if (state.rates.has(key)) return { data: null, error: { code: '23505' } }
          state.rates.set(key, payload)
          return { data: null, error: null }
        }
        if (operation !== 'select') {
          state.writes.push({ table, operation, payload })
          if (table === 'email_send_log') state.emailLog.push({ id: `log-${state.emailLog.length}`, ...payload })
          return { data: singular ? { id: 'fixture-run' } : null, error: null }
        }
        let rows = []
        if (table === 'profiles') {
          rows = columns.includes('status')
            ? [{ id: callerId, status: state.status, full_name: 'Verified caller' }]
            : [{ id: recipientId, email: state.recipientEmail || 'fixture@example.invalid', full_name: '<Recipient>', email_notif_payment: state.optin !== false, email_notif_payout: state.optin !== false, email_notif_announcement: state.optin !== false }]
        }
        if (table === 'user_roles') rows = filters.some(filter => filter[1] === 'user_id')
          ? (state.role ? [{ user_id: callerId, role: state.role }] : []) : [{ user_id: recipientId, role: filters.find(filter => filter[1] === 'role')?.[2][0] || 'artist' }]
        if (table === 'payout_requests') rows = state.payout ? [state.payout] : []
        if (table === 'email_send_log') rows = state.emailLog
        rows = rows.filter(matches)
        return { data: singular ? rows[0] || null : rows, error: null }
      }
      const query = {
        select(value) { columns = value; return query },
        insert(value) { operation = 'insert'; payload = value; return query },
        update(value) { operation = 'update'; payload = value; return query },
        upsert(value) { operation = 'upsert'; payload = value; return query },
        eq(field, value) { filters.push(['eq', field, value]); return query },
        in(field, value) { filters.push(['in', field, value]); return query },
        gte(field, value) { filters.push(['gte', field, value]); return query },
        order() { return query }, limit() { return query },
        maybeSingle() { singular = true; return query }, single() { singular = true; return query },
        then(resolve, reject) { return Promise.resolve().then(execute).then(resolve, reject) },
      }
      return query
    },
    storage: { from: bucket => ({
      list: async () => ({ data: bucket === 'track-audio' ? [{ id: 'object', name: 'fixture.wav', metadata: { size: 4 }, updated_at: 'fixture' }] : [], error: null }),
      download: async () => ({ data: new Blob(['safe']), error: null }),
    }) },
  }
}

function runtime(endpoint, state) {
  let handler
  const context = vm.createContext({
    Request, Response, Headers, URL, TextEncoder, TextDecoder, Uint8Array, Blob, FormData, AbortSignal,
    btoa, atob, crypto: webcrypto, console: { log() {}, error() {} },
    Date: class extends Date {
      constructor(...values) { super(...(values.length ? values : [state.now])) }
      static now() { return state.now }
    },
    setTimeout: callback => { callback(); return 0 },
    fetch: async (url, options) => {
      state.providerCalls.push({ url, options })
      if (state.providerFailure) return Response.json({ error: 'synthetic-sensitive-provider-error' }, { status: 500 })
      return Response.json(url.includes('google_mail') ? { id: 'fixture-mail' } : url.includes('?q=') ? { files: [{ id: 'fixture-folder' }] } : { id: 'fixture-drive' })
    },
    Deno: { env: { get: name => state.env[name] }, serve: callback => { handler = callback } },
  })
  const modules = new Map()
  function load(file) {
    if (modules.has(file)) return modules.get(file)
    if (!compiled.has(file)) {
      const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true,
      })
      assert.equal(result.diagnostics?.length || 0, 0, file)
      compiled.set(file, result.outputText)
    }
    const module = { exports: {} }
    const requireModule = specifier => specifier.startsWith('https://esm.sh/@supabase/')
      ? { createClient: (_url, key, options) => {
        assert.equal(key, state.env.SUPABASE_SERVICE_ROLE_KEY)
        assert.equal(options.db.schema, state.env.DATABASE_SCHEMA || state.env.SUPABASE_DB_SCHEMA || 'soundpub')
        return client(state)
      } }
      : load(path.resolve(path.dirname(file), specifier))
    vm.runInContext(`(function(require,module,exports){${compiled.get(file)}\n})`, context, { filename: file })(requireModule, module, module.exports)
    modules.set(file, module.exports)
    return module.exports
  }
  load(path.join(root, 'supabase/functions', endpoint, 'index.ts'))
  return async ({ token = serviceKey, body = endpoint === 'send-app-email' ? payment : {}, raw, method = 'POST', contentType = 'application/json', headers = {} } = {}) => {
    const requestHeaders = { 'Content-Type': contentType, ...headers }
    if (token !== null) requestHeaders.Authorization = `Bearer ${token}`
    const response = await handler(new Request(`https://fixture.invalid/functions/v1/${endpoint}`, {
      method, headers: requestHeaders, ...(['GET', 'HEAD', 'OPTIONS'].includes(method) ? {} : { body: raw === undefined ? JSON.stringify(body) : raw }),
    }))
    return { status: response.status, headers: response.headers, body: response.status === 200 && method === 'OPTIONS' ? null : await response.json() }
  }
}

async function expectDenial(endpoint, options, expected, overrides = {}) {
  const state = fixture(overrides)
  const result = await runtime(endpoint, state)(options)
  assert.equal(result.status, expected, JSON.stringify({ endpoint, options: { method: options.method }, result }))
  assert.equal(state.writes.length, 0)
  assert.equal(state.providerCalls.length, 0)
  return { state, result }
}

async function main() {
  for (const endpoint of ['send-app-email', 'backup-storage-to-drive']) {
    for (const token of [null, 'invalid-token', jwt({ role: 'service_role', exp: now / 1000 + 3600, forged: true }), 'expired-user-token']) await expectDenial(endpoint, { token }, 401)
    await expectDenial(endpoint, { token: null, raw: '{' }, 401)
    await expectDenial(endpoint, { token: null, headers: { apikey: serviceKey, 'x-trigger': 'cron', 'x-forwarded-for': '127.0.0.1' } }, 401)
    await expectDenial(endpoint, { token: null, headers: { Authorization: 'Basic user-token' } }, 401)
    for (const method of ['GET', 'PUT', 'DELETE']) await expectDenial(endpoint, { method }, 405)
    for (const raw of ['{', 'null', '[]']) await expectDenial(endpoint, { raw }, 400)
    await expectDenial(endpoint, { raw: 'x'.repeat(65537) }, 413)
    for (const contentType of ['text/plain', 'application/jsonp']) await expectDenial(endpoint, { contentType }, 415)
    await expectDenial(endpoint, {}, 503, { env: {} })
    for (const claims of [{ role: 'service_role', exp: now / 1000 - 1 }, { role: 'service_role' }, { role: 'anon', exp: now / 1000 + 3600 }, { role: 'service_role', exp: now / 1000 + 3600, nbf: now / 1000 + 30 }]) {
      const key = jwt(claims)
      const state = fixture()
      state.env.SUPABASE_SERVICE_ROLE_KEY = key
      await expectDenial(endpoint, { token: key }, 401, { env: state.env })
    }
    const state = fixture()
    const result = await runtime(endpoint, state)({ token: null, method: 'OPTIONS' })
    assert.equal(result.status, 200)
    assert.equal(state.queries.length, 0)
    await expectDenial(endpoint, {}, 503, { failTable: 'rate_limits' })
  }
  for (const role of ['artist', 'label', 'whitelabel', 'copyright', 'user', null]) {
    await expectDenial('send-app-email', { token: 'user-token', body: announcement }, 403, { role })
    await expectDenial('send-app-email', { token: 'user-token' }, 403, { role })
    await expectDenial('backup-storage-to-drive', { token: 'user-token' }, 401, { role })
  }
  for (const status of ['inactive', 'suspended']) await expectDenial('send-app-email', { token: 'user-token', body: announcement }, 403, { role: 'admin', status })
  for (const failTable of ['profiles', 'user_roles']) await expectDenial('send-app-email', { token: 'user-token', body: announcement }, 503, { role: 'admin', failTable })
  for (const body of [{ ...payment, templateName: 'toString' }, { ...payment, templateName: '__proto__' }, { ...payment, recipientUserId: 'invalid' }, { ...payment, recipientEmail: 'fixture@example.invalid' }, { ...payment, templateData: [] }, { ...payment, templateData: { nested: {} } }, { ...payment, idempotencyKey: '' }, { ...payment, templateData: { title: 'Fixture', amount: {}, trackCount: 1 } }]) await expectDenial('send-app-email', { body }, 400)
  await expectDenial('send-app-email', { body: announcement }, 403)
  {
    const state = fixture()
    delete state.env.GOOGLE_MAIL_API_KEY
    await expectDenial('send-app-email', {}, 503, { env: state.env })
  }
  for (const field of ['resetUrl', 'verifyUrl', 'loginUrl']) {
    for (const target of ['javascript:alert(1)', 'https://other.invalid/reset-password', 'https://fixture.invalid/other']) await expectDenial('send-app-email', { body: { templateName: 'password-reset', recipientUserId: recipientId, templateData: { resetUrl: 'https://fixture.invalid/reset-password?token=synthetic', [field]: target } } }, 400)
  }
  for (const role of ['admin', 'superadmin']) {
    const state = fixture({ role })
    const result = await runtime('send-app-email', state)({ token: 'user-token', body: announcement })
    assert.equal(result.status, 200)
    assert.equal(result.body.sent, 1)
  }
  for (const templateName of ['password-reset', 'password-reset-confirmation', 'email-verification', 'payment-success']) {
    const state = fixture()
    const data = { ...payment.templateData, resetUrl: 'https://fixture.invalid/reset-password?token=synthetic', verifyUrl: 'https://fixture.invalid/verify-email?token=synthetic', loginUrl: 'https://fixture.invalid/login' }
    const result = await runtime('send-app-email', state)({ body: { templateName, recipientUserId: recipientId, templateData: data } })
    assert.equal(result.status, 200, templateName)
    assert.equal(result.body.sent, 1, templateName)
    assert.ok(state.providerCalls[0].url.includes('google_mail'))
    if (templateName !== 'payment-success') assert.deepEqual(JSON.parse(JSON.stringify(state.emailLog[0].metadata)), {})
  }
  for (const role of ['artist', 'label', 'whitelabel', 'copyright', 'admin', 'superadmin']) {
    const state = fixture({ role })
    const invoke = runtime('send-app-email', state)
    const result = await invoke({ token: 'user-token', body: payout })
    assert.equal(result.status, 200)
    assert.equal(result.body.sent, 1)
    assert.match(state.emailLog[0].idempotency_key, /^[a-f0-9]{64}$/)
    assert.equal(state.emailLog[0].metadata.userName, 'Verified caller')
    const replay = await invoke({ token: 'user-token', body: payout })
    assert.equal(replay.body.skipped, true)
    const reordered = await invoke({ token: 'user-token', body: { ...payout, broadcastRoles: [...payout.broadcastRoles].reverse(), idempotencyKey: 'untrusted-rotated-key' } })
    assert.equal(reordered.body.skipped, true)
    assert.equal(state.providerCalls.length, 1)
  }
  for (const change of [{ payout: null }, { payout: { ...fixture().payout, user_id: recipientId } }, { payout: { ...fixture().payout, status: 'paid' } }, { payout: { ...fixture().payout, created_at: new Date(now - 16 * 60000).toISOString() } }, { payout: { ...fixture().payout, amount: 200 } }]) await expectDenial('send-app-email', { token: 'user-token', body: payout }, 403, change)
  await expectDenial('send-app-email', { token: 'user-token', body: { ...payout, broadcastRoles: ['artist', 'admin'] } }, 403)
  await expectDenial('send-app-email', { token: 'user-token', body: payout }, 503, { failTable: 'payout_requests' })
  await expectDenial('send-app-email', { body: { ...payment, idempotencyKey: 'fixture-key' } }, 503, { failTable: 'email_send_log', failOperation: 'select' })
  {
    const state = fixture()
    const body = { ...payment, idempotencyKey: 'fixture-concurrent-key' }
    const results = await Promise.all(Array.from({ length: 12 }, () => runtime('send-app-email', state)({ body })))
    assert.equal(results.filter(result => result.body.sent === 1).length, 1)
    assert.ok(results.filter(result => result.status !== 200).every(result => result.status === 409))
    assert.equal(state.providerCalls.length, 1)
  }
  {
    const state = fixture()
    const body = { templateName: 'password-reset', recipientUserId: recipientId, templateData: { resetUrl: 'https://fixture.invalid/reset-password?token=synthetic-sensitive-reset-token' }, idempotencyKey: 'password-reset-synthetic-sensitive-reset-token' }
    await runtime('send-app-email', state)({ body })
    assert.ok(!JSON.stringify(state.emailLog).includes('synthetic-sensitive-reset-token'))
    const replay = await runtime('send-app-email', state)({ body })
    assert.equal(replay.body.skipped, true)
    assert.equal(state.providerCalls.length, 1)
  }
  for (const [internal, limit] of [[false, 10], [true, 60]]) {
    const state = fixture({ role: 'admin' })
    const results = await Promise.all(Array.from({ length: limit + 5 }, () => runtime('send-app-email', state)({ token: internal ? serviceKey : 'user-token', body: internal ? payment : announcement })))
    assert.equal(results.filter(result => result.status === 200).length, limit)
    assert.equal(results.filter(result => result.status === 429).length, 5)
    assert.equal(state.providerCalls.length, limit)
    assert.ok(results.filter(result => result.status === 429).every(result => Number(result.headers.get('retry-after')) > 0))
    state.now += 60000
    assert.equal((await runtime('send-app-email', state)({ token: internal ? serviceKey : 'user-token', body: internal ? payment : announcement })).status, 200)
  }
  {
    const state = fixture({ optin: false })
    const result = await runtime('send-app-email', state)()
    assert.equal(result.body.suppressed, 1)
    assert.equal(state.providerCalls.length, 0)
  }
  {
    const state = fixture()
    await runtime('send-app-email', state)({ body: { ...payment, templateData: { ...payment.templateData, title: '<img src=x onerror=alert(1)>' } } })
    const message = Buffer.from(JSON.parse(state.providerCalls[0].options.body).raw, 'base64url').toString()
    assert.ok(message.includes('&lt;img'))
    assert.ok(!message.includes('<img'))
  }
  await expectDenial('send-app-email', {}, 400, { recipientEmail: 'fixture@example.invalid\r\nBcc: other@example.invalid' })
  {
    const state = fixture({ providerFailure: true })
    const result = await runtime('send-app-email', state)()
    assert.equal(result.body.failed, 1)
    assert.ok(!JSON.stringify(state.emailLog).includes('synthetic-sensitive-provider-error'))
  }
  await expectDenial('backup-storage-to-drive', { body: { bucket: 'other' } }, 400)
  {
    const state = fixture()
    delete state.env.GOOGLE_DRIVE_API_KEY
    await expectDenial('backup-storage-to-drive', {}, 503, { env: state.env })
  }
  await expectDenial('backup-storage-to-drive', {}, 503, { failTable: 'storage_backup_runs' })
  {
    const state = fixture()
    const results = await Promise.all(Array.from({ length: 8 }, () => runtime('backup-storage-to-drive', state)()))
    assert.equal(results.filter(result => result.status === 200).length, 1)
    assert.equal(results.filter(result => result.status === 429).length, 7)
    assert.equal(state.writes.filter(write => write.table === 'storage_backup_runs' && write.operation === 'insert').length, 1)
    assert.equal(state.writes.filter(write => write.table === 'storage_backup_log').length, 1)
    assert.equal(state.providerCalls.filter(call => call.url.includes('uploadType=multipart')).length, 1)
  }
  console.log('PASS: privileged API mock checks; isolated Auth/DB/provider fixtures only. Live authorization UNVERIFIED.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
