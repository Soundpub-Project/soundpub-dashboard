const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const evaluate = (path, require) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require, Intl, BigInt });
  return exports;
};
(async () => {
  const calls = [];
  const result = { currency: 'IDR', semantics: 'GROSS_ENTRIES', total_minor: '9007199254742023', entry_count: '103',
    periods: [{ period: '2026-11', total_minor: '20', entry_count: '1' }], latest: { period: '2026-11', amount_minor: '20' } };
  const { copyrightApi } = evaluate('src/api/copyright.ts', () => ({ apiRequest: async (...args) => { calls.push(args); return result; } }));
  const signal = new AbortController().signal;
  assert.equal(await copyrightApi.summary(signal), result);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/v1/copyright/royalties/summary');
  assert.equal(calls[0][1].signal, signal);
  const component = fs.readFileSync('src/components/copyright/BackendCopyrightDashboard.tsx', 'utf8');
  assert.match(component, /copyrightApi\.summary\(signal\)/);
  assert.doesNotMatch(component, /listAllRoyalties|listRoyalties|supabase|\.reduce\(/);
  assert.match(component, /summary\.total_minor/);
  assert.match(component, /summary\?\.entry_count/);
  assert.match(component, /latestRoyalty\.amount_minor/);
  const dashboard = evaluate('src/components/copyright/BackendCopyrightDashboard.tsx', () => ({}));
  assert.equal(dashboard.formatRoyaltyMinor('900719925474099350'), new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(9007199254740994n));
  assert.equal(dashboard.formatRoyaltyMinor('49'), dashboard.formatRoyaltyMinor('0'));
  assert.equal(dashboard.formatRoyaltyMinor('50'), dashboard.formatRoyaltyMinor('100'));
  console.log('Copyright summary contract: one scoped request, exact minor-unit formatting, no history fetch.');
})().catch(error => { console.error(error); process.exitCode = 1; });
