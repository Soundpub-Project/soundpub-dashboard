const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = file => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');
function evaluate(file, require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require, URLSearchParams, crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000099' } });
  return exports;
}
(async () => {
  const calls = [];
  const royalties = evaluate('src/api/royalties.ts', () => ({ apiRequest: async (...args) => { calls.push(args); return {}; } }));
  const controller = new AbortController();
  await royalties.royaltiesApi.breakdown({ artist_id: 'artist/id', release_id: 'release&id', period: '2026-11', offset: 50 }, controller.signal);
  const url = new URL(calls.at(-1)[0], 'https://example.test');
  assert.equal(url.pathname, '/api/v1/royalties/breakdown');
  assert.equal(url.searchParams.get('artist_id'), 'artist/id');
  assert.equal(url.searchParams.get('release_id'), 'release&id');
  assert.equal(url.searchParams.get('period'), '2026-11');
  assert.equal(url.searchParams.get('offset'), '50');
  assert.equal(calls.at(-1)[1].signal, controller.signal);
  const balance = evaluate('src/api/balance.ts', () => ({ apiRequest: async (...args) => { calls.push(args); return {}; } }));
  await balance.balanceApi.get(controller.signal);
  assert.equal(calls.at(-1)[0], '/api/v1/balance');
  assert.equal(calls.at(-1)[1].signal, controller.signal);
  let backend = false;
  for (const page of ['Royalties', 'RoyaltySummary', 'AllRoyalties', 'Payouts']) {
    let egress = 0;
    const component = evaluate(`src/pages/${page}.tsx`, name => {
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === '@/hooks/useAuth') return { useAuth: () => ({ role: 'label_custom' }) };
      if (name === '@/components/finance/mode') return { usesBackendFinance: () => backend };
      if (name === '@/components/finance/FinanceUnavailable') return { FinanceUnavailable: 'closed' };
      if (name === '@/components/finance/BackendRoyalties') return { BackendRoyalties: 'royalties' };
      if (name === '@/components/finance/BackendPayouts') return { BackendPayouts: 'payouts' };
      if (name === '@/integrations/supabase/client') return { supabase: new Proxy({}, { get() { egress++; throw Error('Supabase reached'); } }) };
      return new Proxy({}, { get: (_, key) => key === 'useMemo' ? fn => fn() : () => ({}) });
    });
    backend = false;
    assert.equal(component.default().type, 'closed', page);
    backend = true;
    assert.equal(component.default().type, page === 'Payouts' ? 'payouts' : 'royalties', page);
    assert.equal(egress, 0, page);
  }
  const payouts = evaluate('src/api/payouts.ts', () => ({ apiRequest: async (...args) => { calls.push(args); return {}; } }));
  await payouts.payoutsApi.destination(controller.signal);
  assert.equal(calls.at(-1)[0], '/api/v1/payouts/destination');
  await payouts.payoutsApi.updateDestination({ bank_name: 'Test', account_number: '1234', account_holder_name: 'PIC' });
  assert.equal(calls.at(-1)[1].method, 'PUT');
  await payouts.payoutsApi.reviewReadiness('owner/id', { action: 'approve_reconciliation', evidence: 'test-evidence' }, 'readiness-test');
  assert.equal(calls.at(-1)[0], '/api/v1/admin/payouts/readiness/owner%2Fid');
  assert.equal(calls.at(-1)[1].body.action, 'approve_reconciliation');
  const helper = evaluate('src/components/finance/picPayoutRequest.ts', () => ({}));
  assert.throws(() => helper.picPayoutRequest('100.00', null), /DESTINATION_REQUIRED/);
  assert.throws(() => helper.picPayoutRequest('100.00', { verified: false }), /DESTINATION_REQUIRED/);
  const request = helper.picPayoutRequest('100.00', { verified: true, currency: 'IDR', bank_name: 'Test', account_number: '1234', account_holder_name: 'PIC', artist_id: 'must-not-leak', owner_id: 'must-not-leak' });
  assert.deepEqual(Object.keys(request).sort(), ['account_holder_name', 'account_number', 'amount', 'bank_name', 'currency']);
  assert.equal(request.account_holder_name, 'PIC');
  let eligible = false;
  let verified = false;
  const jsx = (type, props) => ({ type, props });
  const flatten = value => !value || typeof value !== 'object' ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(flatten)];
  const backendPayouts = evaluate('src/components/finance/BackendPayouts.tsx', name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return { useState: value => [value, () => {}], useRef: value => ({ current: value }) };
    if (name === '@/hooks/useAuth') return { useAuth: () => ({ user: { id: 'pic' }, role: 'label_custom', isAdmin: false }) };
    if (name === '@tanstack/react-query') return { useQuery: ({ queryKey }) => ({
      data: queryKey[0] === 'backend-payout-eligibility' ? { eligible, available: eligible ? '1000.00' : null, reasons: ['RECONCILIATION_REQUIRED'] }
        : queryKey[0] === 'backend-pic-destination' ? { destination: { verified } } : { items: [] }, isFetching: false, isError: false }) };
    if (name === '@/components/ui/button') return { Button: 'button' };
    if (name === '@/components/ui/input') return { Input: 'input' };
    return new Proxy({}, { get: (_, key) => key });
  });
  for (const [isEligible, isVerified] of [[false, false], [true, false], [false, true], [true, true]]) {
    eligible = isEligible; verified = isVerified;
    const nodes = flatten(backendPayouts.BackendPayouts({}));
    const inputs = nodes.filter(node => node.type === 'input');
    assert.equal(inputs.length, 1, 'PIC only enters amount, never bank/artist recipient');
    const submit = nodes.find(node => node.type === 'button' && node.props.type === 'submit');
    assert.equal(submit.props.disabled, !(isEligible && isVerified), 'Fail closed without eligibility and verified destination');
  }
  for (const action of ['verify_destination', 'approve_reconciliation', 'revoke_destination', 'revoke_reconciliation']) {
    let stateIndex = 0;
    const states = ['other-pic', 'target-id', action, 'review-evidence', false, '', ''];
    const reviewCalls = [];
    const review = evaluate('src/components/finance/PicReadinessReview.tsx', name => {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react') return { useState: () => [states[stateIndex++], () => {}], useRef: value => ({ current: value }) };
      if (name === '@/hooks/useAuth') return { useAuth: () => ({ user: { id: 'admin' }, isAdmin: true }) };
      if (name === '@/api/payouts') return { payoutsApi: { reviewReadiness: async (...args) => { reviewCalls.push(args); return { id: 'result', action }; } } };
      return new Proxy({}, { get: (_, key) => key });
    });
    await flatten(review.PicReadinessReview()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(reviewCalls[0][0], 'other-pic');
    const payload = reviewCalls[0][1];
    assert.equal(payload.action, action);
    if (action === 'verify_destination' || action === 'revoke_destination') assert.equal(payload.destination_id, 'target-id');
    if (action === 'revoke_reconciliation') assert.equal(payload.approval_id, 'target-id');
    assert.equal(payload[action.startsWith('revoke') ? 'reason' : 'evidence'], 'review-evidence');
    assert.equal(reviewCalls[0][2], '00000000-0000-4000-8000-000000000099');
    assert(!('artist_id' in payload));
  }
  const textContent = value => value == null || value === false ? '' : typeof value !== 'object' ? String(value) : [value.props?.children].flat(Infinity).map(textContent).join(' ');
  let reportError = false;
  const reports = evaluate('src/components/finance/BackendRoyalties.tsx', name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return { useState: value => [value, () => {}] };
    if (name === '@/hooks/useAuth') return { useAuth: () => ({ user: { id: 'pic' }, role: 'label_custom' }) };
    if (name === '@tanstack/react-query') return { useQuery: ({ queryKey }) => ({ isError: reportError, isFetching: reportError,
      data: queryKey[0] === 'backend-royalties' ? { currency: 'IDR', gross_earnings: '9007199254740993.01', net_earnings: '9007199254740993.01', corrections: '0.00' }
        : queryKey[0] === 'backend-finance-balance' ? { status: 'RECONCILIATION_REQUIRED', available: '888.88', reserved: '0.00', settled: '0.00' } : { items: [] } }) };
    return new Proxy({}, { get: (_, key) => key });
  });
  let reportText = textContent(reports.BackendRoyalties());
  assert(reportText.includes('9007199254740993.01'), 'Exact large decimal displayed without float rounding');
  assert(reportText.includes('RECONCILIATION_REQUIRED'));
  assert(reportText.includes('Belum ada royalti'));
  assert(!reportText.includes('888.88'), 'Unreconciled balance never shown as available');
  reportError = true;
  reportText = textContent(reports.BackendRoyalties());
  assert(reportText.includes('Gagal memuat'));
  assert(reportText.includes('Memuat'));
  assert(!reportText.includes('9007199254740993.01'), 'Error hides stale report values');
  const app = read('src/App.tsx');
  for (const route of ['/dashboard/royalties', '/dashboard/royalty-summary', '/dashboard/payouts']) {
    const routeSource = app.slice(app.indexOf(`path="${route}"`), app.indexOf(`path="${route}"`) + 600);
    assert(routeSource.includes('usesBackendFinance()'), route);
    assert(routeSource.includes('label_custom'), route);
  }
  const sidebar = read('src/components/layout/AppSidebar.tsx');
  assert(sidebar.includes("['/dashboard/royalties', '/dashboard/royalty-summary', '/dashboard/payouts'].includes(item.url) && !usesBackendFinance()"));
  const source = read('src/components/finance/BackendRoyalties.tsx');
  assert(!/parseFloat|Number\(/.test(source), 'Finance displays exact server amounts');
  console.log('Label Custom finance: contracts, 4 page guards, verified PIC requests, 4 admin review actions, reporting states, exact amounts, 0 Supabase accesses passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
