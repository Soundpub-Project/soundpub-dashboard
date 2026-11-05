const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const evaluate = (file, require) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require });
  return exports;
};
let domain = '';
const mode = evaluate('src/components/finance/mode.ts', name => name === '@/api/routing'
  ? { usesBackendDomain: value => value === domain }
  : { usesBackendReleases: () => domain === 'releases' });
let egress = 0;
const forbidden = new Proxy({}, { get() { egress++; throw Error('Unexpected Supabase access'); } });
const dependencies = name => {
  if (name === '@/components/finance/mode') return mode;
  if (name === '@/integrations/supabase/client') return { supabase: forbidden };
  if (name === '@tanstack/react-query') return { useQuery: options => options };
  throw Error(name);
};
(async () => {
  const hooks = evaluate('src/hooks/useRoyaltyData.ts', dependencies);
  const records = evaluate('src/lib/fetchAllRoyalties.ts', dependencies);
  const invoices = evaluate('src/lib/xendit.ts', dependencies);
  for (domain of ['royalties', 'payouts', 'payments', 'releases']) {
    assert.equal(mode.usesBackendFinance(), true);
    for (const [name, hook] of Object.entries(hooks)) {
      const query = name === 'useRoyaltyTopPerformers' ? hook(['2026-01'], [], 'title')
        : name === 'useRoyaltyComparison' ? hook(['2026-01'], []) : hook(null);
      await assert.rejects(query.queryFn(), /backend/);
      assert.equal(query.queryKey[0], 'backend-finance');
    }
    await assert.rejects(records.fetchAllRoyalties(), /backend/);
    await assert.rejects(invoices.createXenditInvoice('release'), /backend/);
    await assert.rejects(invoices.createCopyrightInvoice('registration'), /backend/);
  }
  assert.equal(egress, 0);
  domain = '';
  assert.equal(mode.usesBackendFinance(), false);
  assert.doesNotThrow(mode.requireLegacyFinance);
  for (const name of ['Royalties', 'RoyaltySummary', 'AllRoyalties', 'UploadRoyalty', 'ComposerRoyalties', 'Payouts', 'AdminPayouts', 'Invoices', 'PaymentCallback', 'CopyrightAnalytics', 'CopyrightRoyaltySummary', 'CopyrightRoyaltyUpload', 'CopyrightRoyaltyUploadHistory']) {
    const file = read(`src/pages/${name}.tsx`);
    const wrapper = file.slice(file.indexOf(`export default function ${name}()`));
    assert(wrapper.includes('if (usesBackendFinance())'), name);
  }
  for (const name of ['UploadRoyalty', 'Invoices']) assert(read(`src/pages/${name}.tsx`).includes('if (usesBackendReleases())'));
  const calls = [];
  const api = evaluate('src/api/payments.ts', () => ({ apiRequest: async (...args) => { calls.push(args); return {}; } }));
  await api.paymentsApi.status('test/id');
  assert.equal(calls[0][0], '/api/v1/payments/releases/test%2Fid');
  const royalties = evaluate('src/api/royalties.ts', () => ({ apiRequest: async (...args) => { calls.push(args); return {}; } }));
  await royalties.royaltiesApi.commit({ source: 'synthetic', rows: [] });
  assert.equal(calls.at(-1)[0], '/api/v1/royalties/imports/commit');
  await royalties.royaltiesApi.detail('batch/id', 200);
  assert.equal(calls.at(-1)[0], '/api/v1/royalties/imports/batch%2Fid?limit=100&offset=200');
  await royalties.royaltiesApi.reconciliation('batch/id');
  assert.equal(calls.at(-1)[0], '/api/v1/admin/royalties/imports/batch%2Fid/reconciliation');
  await royalties.royaltiesApi.reconcile('batch/id', { expected_checksum: '0'.repeat(64), evidence: 'checked' });
  assert.equal(calls.at(-1)[1].method, 'POST');
  await royalties.royaltiesApi.approveFileSession('session/id', { expected_checksum: '0'.repeat(64), evidence: 'checked' });
  assert.equal(calls.at(-1)[0], '/api/v1/admin/royalties/import-files/session%2Fid/approve');
  assert.equal(calls.at(-1)[1].method, 'POST');
  await royalties.royaltiesApi.fileSessionRows('session/id', 'INVALID', 50);
  assert.equal(calls.at(-1)[0], '/api/v1/royalties/import-files/session%2Fid/rows?status=INVALID&limit=50&offset=50');
  const royaltyImport = read('src/components/finance/BackendRoyaltyImport.tsx');
  assert(royaltyImport.includes('selected.entries.map'));
  assert(royaltyImport.includes('selected.entry_total'));
  assert(royaltyImport.includes('Session upload'));
  assert(royaltyImport.includes('Setujui preview'));
  assert(royaltyImport.includes('previewApproved'));
  assert(royaltyImport.includes('Review staged rows'));
  assert(royaltyImport.includes('loadStagedRows'));
  assert(royaltyImport.includes('filter Invalid'));
  assert(!royaltyImport.includes('selected.entries.slice(0, 100)'));
  const payouts = evaluate('src/api/payouts.ts', () => ({ apiRequest: async (...args) => { calls.push(args); return {}; } }));
  await payouts.payoutsApi.request({ amount: '100.00', idempotency_key: 'retry-key' });
  assert.equal(calls.at(-1)[1].idempotencyKey, 'retry-key');
  assert.equal(calls.at(-1)[1].body.idempotency_key, undefined);
  await payouts.payoutsApi.transition('id', 'approved', 'retry-key');
  assert.equal(calls.at(-1)[0], '/api/v1/admin/payouts/id/transition');
  assert.equal(calls.at(-1)[1].body.status, 'approved');
  assert.equal(calls.at(-1)[1].idempotencyKey, 'retry-key');
  await api.paymentsApi.create('release');
  assert.equal(calls.at(-1)[1].body.idempotency_key, 'release-invoice:release');
  assert(!read('src/components/finance/BackendPaymentStatus.tsx').includes("params.get('status')"));
  console.log('Financial flags, all royalty query guards, helpers, mount guards and payment status contract passed; 0 Supabase accesses.');
})().catch(error => { console.error(error); process.exitCode = 1; });
