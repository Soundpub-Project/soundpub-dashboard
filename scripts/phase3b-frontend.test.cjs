const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

function load(file, imports) {
  const source = readFileSync(join(__dirname, '..', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require(name) { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; } });
  return exports;
}

(async () => {
  let domains = new Set(['users']);
  let apiCalls = 0;
  let legacyCalls = 0;
  const services = load('src/services/labels.ts', {
    '@/api/routing': { usesBackendDomain: domain => domains.has(domain) },
    '@/api/labels': { labelsApi: { list: async () => { apiCalls++; return { items: [], nextCursor: null }; } } },
    '@/integrations/supabase/client': { supabase: new Proxy({}, { get() { throw new Error('Unexpected legacy access'); } }) },
    '@/api/artists': {},
    './users': { listLabels: async () => { legacyCalls++; return []; } },
  });
  assert.equal(services.usesBackendArtistLabels(), true);
  assert.equal(services.artistLabelApiReady(), false);
  await assert.rejects(services.listLabels(), /backend belum tersedia/);
  assert.equal(apiCalls, 0);
  assert.equal(legacyCalls, 0);
  domains = new Set(['users', 'artists', 'labels']);
  assert.equal(services.artistLabelApiReady(), true);
  await services.listLabels();
  assert.equal(apiCalls, 1);
  domains = new Set();
  await services.listLabels();
  assert.equal(legacyCalls, 1);
  const artistContracts = readFileSync(join(__dirname, '..', 'backend/src/artists/contracts.ts'), 'utf8');
  assert.doesNotMatch(artistContracts.split('export const artistDto')[0], /profile_image_url/);
  console.log('Phase 3B frontend routing and media boundary checks: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
