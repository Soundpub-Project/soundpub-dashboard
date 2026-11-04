const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { z } = require('zod')

const source = fs.readFileSync('supabase/functions/create-user/index.ts', 'utf8').replace(/^import .*\r?\n/gm, '')
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
const validUser = { email: 'test@example.com', password: 'password123', full_name: 'Test User', role: 'admin' }

async function invoke({ auth = 'valid', role = 'superadmin', profileStatus = 'active', body = validUser } = {}) {
  let handler
  const reads = []
  const writes = []
  const userClient = {
    auth: { getUser: async token => {
      reads.push(['getUser', token])
      return auth === 'invalid' ? { data: { user: null }, error: new Error('Invalid JWT') }
        : { data: { user: { id: 'caller-id' } }, error: null }
    } },
    from: () => { throw new Error('Role lookup must use service client') },
  }
  const serviceClient = {
    auth: { admin: { createUser: async payload => {
      writes.push(['createUser', payload])
      return { data: { user: { id: 'created-id', email: payload.email } }, error: null }
    } } },
    from(table) {
      let selected
      const filters = []
      const query = {
        select(columns) { selected = columns; return query },
        eq(field, value) { filters.push([field, value]); return query },
        single: async () => {
          reads.push(['single', table, selected, filters])
          if (table === 'profiles') return { data: { status: profileStatus }, error: null }
          if (table === 'user_roles') return { data: { role }, error: null }
          return { data: null, error: null }
        },
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: async value => { writes.push(['upsert', table, value]); return { error: null } },
        insert: async value => { writes.push(['insert', table, value]); return { error: null } },
        update(value) { return { eq: async (field, id) => {
          writes.push(['update', table, value, field, id])
          return { error: null }
        } } },
      }
      return query
    },
  }
  vm.runInNewContext(script, {
    createClient: (_url, key) => key === 'service-key' ? serviceClient : userClient,
    z, corsHeaders: {}, Response, crypto: require('node:crypto').webcrypto,
    console: { log() {}, error() {} }, setTimeout: callback => callback(),
    Deno: { serve: callback => { handler = callback }, env: { get: key => ({
      SUPABASE_URL: 'url', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    })[key] } },
  })
  const headers = new Headers()
  if (auth === 'valid') headers.set('Authorization', 'Bearer valid-jwt')
  if (auth === 'invalid') headers.set('Authorization', 'Bearer invalid-jwt')
  if (auth === 'malformed') headers.set('Authorization', 'Basic invalid-jwt')
  const response = await handler(new Request('https://local.test', { method: 'POST', headers, body: JSON.stringify(body) }))
  return { response, reads, writes }
}

async function main() {
  for (const auth of ['anonymous', 'malformed', 'invalid']) {
    const result = await invoke({ auth })
    assert.equal(result.response.status, 401, auth)
    assert.deepEqual(result.writes, [], auth)
  }
  const unauthorized = await invoke({ role: 'user' })
  assert.equal(unauthorized.response.status, 403)
  assert.deepEqual(unauthorized.writes, [])
  for (const profileStatus of ['inactive', 'suspended']) {
    const result = await invoke({ profileStatus })
    assert.equal(result.response.status, 403, profileStatus)
    assert.ok(!result.reads.some(read => read[0] === 'single' && read[1] === 'user_roles'))
    assert.deepEqual(result.writes, [], profileStatus)
  }
  const escalation = await invoke({ role: 'admin', body: { ...validUser, role: 'superadmin' } })
  assert.equal(escalation.response.status, 403)
  assert.deepEqual(escalation.writes, [])
  const foreignParent = await invoke({ role: 'label', body: {
    ...validUser, role: 'artist', parent_label_id: '00000000-0000-4000-8000-000000000002',
  } })
  assert.equal(foreignParent.response.status, 403)
  assert.deepEqual(foreignParent.writes, [])
  const ownedArtist = await invoke({ role: 'label', body: { ...validUser, role: 'artist' } })
  assert.equal(ownedArtist.response.status, 200)
  assert.ok(ownedArtist.writes.some(write => write[0] === 'update' && write[1] === 'profiles' && write[2].parent_label_id === 'caller-id'))
  const adminCreatesAdmin = await invoke({ role: 'admin' })
  assert.equal(adminCreatesAdmin.response.status, 200)
  assert.ok(adminCreatesAdmin.writes.some(write => write[0] === 'createUser'))
  const superadminCreatesSuperadmin = await invoke({ role: 'superadmin', body: { ...validUser, role: 'superadmin' } })
  assert.equal(superadminCreatesSuperadmin.response.status, 200)
  assert.ok(superadminCreatesSuperadmin.writes.some(write => write[0] === 'createUser'))
  console.log('create-user security checks passed (mock Auth and DB; no production calls).')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
