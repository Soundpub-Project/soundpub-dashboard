const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('../backend/node_modules/typescript');

const source = readFileSync(new URL('../src/api/client.ts', `file:///${__filename.replaceAll('\\', '/').replace(/^\//, '')}`), 'utf8')
  .replace('import.meta.env.VITE_SOUNDPUB_API_URL', '"http://127.0.0.1:3000"');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const moduleExports = {};
let calls = 0;
let lastHeaders;
const context = {
  exports: moduleExports, URL, AbortController, setTimeout, clearTimeout,
  fetch: async (_url, options) => {
    calls += 1;
    lastHeaders = options.headers;
    return { ok: calls === 1, status: 403, headers: { get: () => 'request-1' }, json: async () => calls === 1 ? { id: 'user-1' } : { error: { code: 'FORBIDDEN' } } };
  },
};
runInNewContext(compiled, context);

(async () => {
  await assert.rejects(moduleExports.apiRequest('/api/v1/profile'), error => error.category === 'UNAUTHENTICATED');
  moduleExports.setApiTokenProvider(async () => 'synthetic-local-token');
  assert.equal((await moduleExports.apiRequest('/api/v1/profile')).id, 'user-1');
  assert.equal(lastHeaders.Authorization, 'Bearer synthetic-local-token');
  await assert.rejects(moduleExports.apiRequest('/api/v1/profile'), error => error.category === 'FORBIDDEN' && error.requestId === 'request-1');
  assert.equal(calls, 2);
  console.log('Phase 3 API client self-check: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });


