const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const evaluate = (file, require) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require, URLSearchParams });
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
  if (name === '@/api/royalties') return { royaltiesApi: {
    analytics: async view => view === 'stats' ? { total_revenue: '70.00', total_streams: '10', unique_artists: '1', unique_labels: '1', unique_platforms: '1', unique_tracks: '1' }
      : [{ period: '2026-01', name: 'Spotify', revenue: '70.00', streams: '10', label_name: 'Label', artist_name: 'Artist', isrc: 'FRX762598330', title: 'Track', label: 'Label', data_type: 'current' }],
    periods: async () => ({ items: ['2026-01'] }),
  } };
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
      await query.queryFn();
      assert.equal(query.queryKey[0], 'backend-finance');
    }
    await assert.rejects(records.fetchAllRoyalties(), /Layanan keuangan backend/);
    await assert.rejects(invoices.createXenditInvoice('release'), /Layanan keuangan backend/);
    await assert.rejects(invoices.createCopyrightInvoice('registration'), /Layanan keuangan backend/);
  }
  assert.equal(egress, 0);
  domain = '';
  assert.equal(mode.usesBackendFinance(), false);
  assert.doesNotThrow(mode.requireLegacyFinance);
  const controller = new AbortController();
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
  await royalties.royaltiesApi.analytics('top', { current_period: ['2026-01'], previous_period: ['2025-12'], group_by: 'title', limit: 10 });
  assert.equal(calls.at(-1)[0], '/api/v1/royalties/analytics?view=top&current_period=2026-01&previous_period=2025-12&group_by=title&limit=10');
  await royalties.royaltiesApi.reconcile('batch/id', { expected_checksum: '0'.repeat(64), evidence: 'checked' });
  assert.equal(calls.at(-1)[1].method, 'POST');
  const copyright = evaluate('src/api/copyright.ts', () => ({ apiRequest: async (...args) => { calls.push(args); return {}; } }));
  const composerStatement = { source: 'copyright-dashboard', source_batch: 'batch.csv', period: '2026-10', currency: 'IDR', rows: [{ composer_code: 'C001', composer_name: 'Composer', total_net_royalti: '0.10' }] };
  await copyright.copyrightApi.previewRoyalties(composerStatement);
  assert.equal(calls.at(-1)[0], '/api/v1/copyright/royalties/preview');
  assert.equal(calls.at(-1)[1].method, 'POST');
  assert.deepEqual(calls.at(-1)[1].body, composerStatement);
  const copyrightPreview = read('src/components/finance/BackendCopyrightRoyaltyPreview.tsx');
  assert.doesNotMatch(copyrightPreview, /supabase/i);
  assert.match(copyrightPreview, /parseCsvDocument/);
  assert.match(copyrightPreview, /Posting dinonaktifkan/);
  assert.match(copyrightPreview, /preview\.rows\.map/);
  assert.match(copyrightPreview, /preview\.total_amount/);
  assert.match(copyrightPreview, /preview\.blockers\.map/);
  const copyrightPage = read('src/pages/CopyrightRoyaltyUpload.tsx');
  const copyrightWrapper = copyrightPage.slice(copyrightPage.indexOf('export default function CopyrightRoyaltyUpload()'));
  assert.match(copyrightWrapper, /usesBackendFinance\(\)[\s\S]*BackendCopyrightRoyaltyPreview/);
  const csv = evaluate('src/lib/csv.ts', () => { throw Error('CSV parser must have no dependencies'); });
  assert.deepEqual(Array.from(csv.parseCsvDocument('code,name,amount\r\nC1,"Doe, Jane",0.10\r\n'), row => Array.from(row)),
    [['code', 'name', 'amount'], ['C1', 'Doe, Jane', '0.10']]);
  assert.deepEqual(Array.from(csv.parseCsvDocument('code,name\nC1,"Line one\nLine ""two"""'), row => Array.from(row)),
    [['code', 'name'], ['C1', 'Line one\nLine "two"']]);
  assert.throws(() => csv.parseCsvDocument('code,name\nC1,"Unclosed'), /tidak ditutup/);
  assert.throws(() => csv.parseCsvDocument('code,name\nC1,"Closed"junk'), /setelah tanda kutip/);
  assert.throws(() => csv.parseCsvDocument('code,name\nC1,un"quoted'), /awal field/);
  assert.match(copyrightPreview, /Header duplikat tidak diperbolehkan/);
  await royalties.royaltiesApi.approveFileSession('session/id', { expected_checksum: '0'.repeat(64), evidence: 'checked' });
  assert.equal(calls.at(-1)[0], '/api/v1/admin/royalties/import-files/session%2Fid/approve');
  assert.equal(calls.at(-1)[1].method, 'POST');
  await royalties.royaltiesApi.fileSessionRows('session/id', 'INVALID', 50);
  assert.equal(calls.at(-1)[0], '/api/v1/royalties/import-files/session%2Fid/rows?status=INVALID&limit=50&offset=50');
  const labels = evaluate('src/api/labels.ts', () => ({ apiRequest: async (...args) => { calls.push(args); return {}; } }));
  await labels.labelsApi.whitelabelDashboard();
  assert.equal(calls.at(-1)[0], '/api/v1/whitelabel/dashboard');
  await labels.labelsApi.createWhitelabelArtist({ email: 'artist@example.com', fullName: 'Artist Test', phone: null });
  assert.equal(calls.at(-1)[0], '/api/v1/whitelabel/artists');
  assert.equal(calls.at(-1)[1].method, 'POST');
  assert.deepEqual(calls.at(-1)[1].body, { email: 'artist@example.com', fullName: 'Artist Test', phone: null });
  await labels.labelsApi.enableWhitelabelArtistLogin('artist/id', 'new-password');
  assert.equal(calls.at(-1)[0], '/api/v1/whitelabel/artists/artist%2Fid/password');
  assert.equal(calls.at(-1)[1].method, 'PUT');
  assert.equal(calls.at(-1)[1].body.newPassword, 'new-password');
  const whitelabelDashboard = read('src/components/whitelabel/BackendWhitelabelDashboard.tsx');
  assert(!whitelabelDashboard.includes('@/integrations/supabase'));
  assert(!whitelabelDashboard.match(/from\s+['\"][^'\"]*supabase[^'\"]*['\"]/i));
  const dashboard = read('src/pages/Dashboard.tsx');
  assert.match(dashboard, /balanceApi\.get\(\)/);
  assert.match(dashboard, /backendBalance\?\.status === 'RECONCILED'[\s\S]*backendBalance\.available !== null/);
  assert.match(dashboard, /RECONCILIATION_REQUIRED/);
  assert.match(dashboard, /usesBackendFinance\(\) \? formatCurrency\(royaltyStats\?\.totalRevenue/);
  assert.match(dashboard, /royaltyStats\?\.totalStreams/);
  assert.match(dashboard, /backendBalance\?\.status === 'RECONCILED'/);
  const app = read('src/App.tsx');
  assert.match(app, /path=[\"']\/dashboard\/whitelabel[\"'][\s\S]*?<WhitelabelDashboard\s*\/>/);
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
  await api.paymentsApi.adminInvoices('paid', 100, controller.signal);
  assert.equal(calls.at(-1)[0], '/api/v1/admin/payments/invoices?status=paid&limit=100&offset=100');
  assert.equal(calls.at(-1)[1].signal, controller.signal);
  await api.paymentsApi.downloadInvoice('invoice/id');
  assert.equal(calls.at(-1)[0], '/api/v1/admin/payments/invoices/invoice%2Fid/download');
  assert.match(read('src/components/finance/BackendAdminInvoices.tsx'), /paymentsApi\.adminInvoices/);
  assert.match(read('src/components/finance/BackendAdminInvoices.tsx'), /paymentsApi\.downloadInvoice/);
  assert.match(read('src/components/finance/BackendAdminInvoices.tsx'), /!isAdmin/);
  assert.doesNotMatch(read('src/components/finance/BackendAdminInvoices.tsx'), /supabase/i);
  const paymentStatus = read('src/components/finance/BackendPaymentStatus.tsx');
  assert(!paymentStatus.includes("params.get('status')"));
  assert.match(paymentStatus, /LABEL_CUSTOM_PIC/);
  const releasesPage = read('src/pages/Releases.tsx');
  assert.match(releasesPage, /usesBackendReleases\(\)[\s\S]*paymentsApi\.create\(release\.id\)/);
  const backendPaymentStart = releasesPage.indexOf('if (usesBackendReleases())', releasesPage.indexOf('handleContinuePayment'));
  const legacyPaymentStart = releasesPage.indexOf('createXenditInvoice', backendPaymentStart);
  const backendPaymentReturn = releasesPage.indexOf('return;', backendPaymentStart);
  assert.ok(backendPaymentStart < backendPaymentReturn && backendPaymentReturn < legacyPaymentStart);
  const clientSource = read('src/api/client.ts').replace(/import\.meta\.env\.VITE_SOUNDPUB_API_URL/g, "'https://api.soundpub.test'");
  const clientOutput = ts.transpileModule(clientSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const client = {};
  const maintenanceEvents = [];
  vm.runInNewContext(clientOutput, {
    exports: client,
    fetch: async () => ({ ok: false, status: 503, headers: { get: () => 'request-maintenance' }, json: async () => ({ error: { code: 'MAINTENANCE_MODE', message: 'Maintenance' } }) }),
    window: { location: { origin: 'https://dashboard.soundpub.test' }, dispatchEvent: event => maintenanceEvents.push(event.type) },
    CustomEvent: class CustomEvent { constructor(type) { this.type = type; } }, URL, AbortController, setTimeout, clearTimeout,
  });
  await assert.rejects(client.apiRequest('/api/v1/profile'), error => error.status === 503 && error.code === 'MAINTENANCE_MODE');
  assert.deepEqual(maintenanceEvents, [client.maintenanceModeEvent]);
  const maintenanceScreen = read('src/components/maintenance/MaintenanceModeScreen.tsx');
  assert.match(maintenanceScreen, /role === 'admin' \|\| role === 'superadmin'/);
  assert.match(maintenanceScreen, /Sesi Anda tetap aman/);
  assert.match(maintenanceScreen, /Coba lagi/);
  assert.match(maintenanceScreen, /window\.location\.reload\(\)/);
  assert.doesNotMatch(maintenanceScreen, /supabase|signOut/i);
  assert.match(dashboard, /if \(usesBackendReleases\(\)\) \{[\s\S]*usersApi\.dashboardSummary\(\)[\s\S]*return;/);
  assert.match(dashboard, /usesBackendDomain\('users'\) \? Promise\.resolve\(null\) : supabase\.from\('profiles'\)/);
  assert.match(dashboard, /usesBackendFinance\(\) \? Promise\.resolve\(null\) : supabase\.from\('payout_requests'\)/);
  const auth = read('src/hooks/useAuth.tsx');
  const maintenanceBranchStart = auth.indexOf("error.status === 503 && error.code === 'MAINTENANCE_MODE'");
  const maintenanceBranch = auth.slice(maintenanceBranchStart, auth.indexOf('if (!(error instanceof SoundpubApiError)', maintenanceBranchStart));
  assert.doesNotMatch(maintenanceBranch, /supabase|signOut|logout/i);
  assert.match(read('src/App.tsx'), /<MaintenanceModeScreen>[\s\S]*<Routes>/);
  const backendSettings = read('src/components/settings/BackendSettings.tsx');
  assert.match(backendSettings, /canManageMaintenance=\{role === 'superadmin'\}/);
  assert.match(backendSettings, /\.\.\.\(canManageMaintenance \? \{ maintenance_enabled \} : \{\}\)/);
  assert.match(backendSettings, /disabled=\{!canManageMaintenance\}/);
  const royaltyReport = read('src/components/finance/BackendRoyalties.tsx');
  assert.match(royaltyReport, /setCursors\(current => \[\.\.\.current\.slice/);
  assert.match(royaltyReport, /if \(!page\.next_cursor\) break/);
  assert.match(royaltyReport, /EXPORT_ROW_LIMIT/);
  assert.match(royaltyReport, /Belum di katalog/);
  assert.doesNotMatch(royaltyReport, /offset: exportOffset/);
  assert.match(royaltyReport, /const safe = .*\[=\+@-\].*\.test\(raw\)/);
  console.log('Financial guards and maintenance mode contract passed; session preserved and 0 new Supabase accesses.');
})().catch(error => { console.error(error); process.exitCode = 1; });
