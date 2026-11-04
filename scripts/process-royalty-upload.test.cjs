const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync('supabase/functions/process-royalty-upload/index.ts', 'utf8')
const script = ts.transpileModule(source.replace(/^import .*\r?\n/, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText

async function upload(artists, commitError = null) {
  let handler
  let created = 0
  let deleted = 0
  let committed
  const labelId = '00000000-0000-4000-8000-000000000001'
  const artistId = '00000000-0000-4000-8000-000000000002'
  const select = (table, columns) => {
    let field
    const query = {
      in(nextField) {
        field = nextField
        return query
      },
      eq() { return query },
      order() { return query },
      limit: async () => ({ data: [], error: null }),
      range: async (start) => ({
        data: start ? [] : table === 'user_roles' && field === 'role'
          ? [{ user_id: labelId }]
          : table === 'profiles' && field === 'id'
            ? [{ id: labelId, full_name: 'Sample Label', status: 'active' }]
            : table === 'profiles' && field === 'parent_label_id' ? artists : [],
        error: null,
      }),
    }
    return query
  }
  const service = {
    auth: { admin: {
      createUser: async () => { created++; return { data: { user: { id: artistId } }, error: null } },
      deleteUser: async () => { deleted++; return { error: null } },
    } },
    rpc: async (name, args) => {
      if (name === 'is_admin') return { data: true, error: null }
      committed = args.p_rows
      return commitError ? { error: { message: commitError } } : { data: { success: true }, error: null }
    },
    from: (table) => ({
      select: (columns) => select(table, columns),
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: artistId }, error: null }) }) }) }),
      upsert: async () => ({ error: null }),
    }),
  }
  const user = { auth: { getUser: async () => ({ data: { user: { id: artistId } }, error: null }) } }
  vm.runInNewContext(script, {
    Deno: { serve: callback => { handler = callback }, env: { get: name => name } },
    createClient: (url, key) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? service : user,
    crypto, TextEncoder, TextDecoder, Response, console, exports: {},
  })
  const row = {
    period: '2026-09', isrc: 'GBABC1234567', upc: '', artist: 'Fresh Artist',
    label_name: 'Sample Label', platform: 'Spotify', country: 'ID', sales_unit: 1, net_revenue: 1,
  }
  const request = new Request('http://localhost/', {
    method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: [row], filename: 'test.csv' }),
  })
  const response = await handler(request)
  return { status: response.status, body: await response.json(), created, deleted, committed }
}

;(async () => {
  const success = await upload([])
  assert.equal(success.status, 200)
  assert.equal(success.created, 1)
  assert.equal(success.committed[0].artist_user_id, '00000000-0000-4000-8000-000000000002')
  assert.equal(success.body.managedArtistsCreated, 1)

  const ambiguous = await upload([
    { id: '1', full_name: 'Fresh Artist', parent_label_id: '00000000-0000-4000-8000-000000000001', status: 'active' },
    { id: '2', full_name: 'Fresh Artist', parent_label_id: '00000000-0000-4000-8000-000000000001', status: 'active' },
  ])
  assert.equal(ambiguous.status, 400)
  assert.equal(ambiguous.created, 0)
  assert.match(ambiguous.body.error, /ambiguous/)

  const failed = await upload([], 'Commit failed')
  assert.equal(failed.status, 500)
  assert.equal(failed.created, 1)
  assert.equal(failed.deleted, 1)
  console.log('process-royalty-upload checks passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
