import test from 'node:test';
import assert from 'node:assert/strict';
import { previewComposerStatement } from '../src/composer-royalties/contracts.js';
import { royaltyRow } from '../src/royalties/contracts.js';

const row = { composer_code: 'SYNTHETIC001', composer_name: 'Synthetic Composer', total_net_royalti: '0.10' };
const statement = { source: 'synthetic', source_batch: 'synthetic-batch', period: '2026-10', currency: 'IDR', rows: [row] };

test('composer totals normalize exactly; valid syntax never authorizes financial allocation', () => {
  const result = previewComposerStatement(statement);
  assert.equal(result.total_amount, '0.10');
  assert.equal(result.status, 'UNRECONCILED');
  assert.equal(result.posting_allowed, false);
  assert.deepEqual(result.blockers, ['COMPOSER_IDENTITY_MAPPING_REQUIRED', 'WORK_ALLOCATION_CONTRACT_REQUIRED']);
});

test('multiple composers preserve exact preallocated amounts without inventing shares', () => {
  const result = previewComposerStatement({ ...statement, rows: [row, { ...row, composer_code: 'SYNTHETIC002', total_net_royalti: '0.20' }] });
  assert.equal(result.total_amount, '0.30');
  assert.equal(result.rows.length, 2);
});

test('duplicate composer rejected even with changed display name', () => {
  assert.throws(() => previewComposerStatement({ ...statement, rows: [row, { ...row, composer_name: 'Other' }] }), /DUPLICATE_COMPOSER/);
});

test('fractional share and invalid share total rejected as unsupported input', () => {
  for (const share of ['33.3333', '101', '-1', '100']) {
    assert.throws(() => previewComposerStatement({ ...statement, rows: [{ ...row, share_percentage: share }] }));
  }
});

test('unknown composer and missing work remain quarantined', () => {
  const result = previewComposerStatement({ ...statement, rows: [{ ...row, composer_code: 'UNKNOWN' }] });
  assert.equal(result.posting_allowed, false);
  assert.equal(result.blockers.length, 2);
});

test('duplicate import and replay are deterministic read-only previews, never financial effects', () => {
  const original = structuredClone(statement);
  assert.deepEqual(previewComposerStatement(statement), previewComposerStatement(structuredClone(statement)));
  assert.deepEqual(statement, original);
});

test('correction/reversal and replace flags cannot masquerade as earnings', () => {
  assert.throws(() => previewComposerStatement({ ...statement, replace_existing: true }));
  assert.throws(() => previewComposerStatement({ ...statement, rows: [{ ...row, total_net_royalti: '-0.10' }] }));
  assert.throws(() => previewComposerStatement({ ...statement, correction_of: 'synthetic-batch' }));
});

test('money, currency, batch, period and identity trust boundaries reject malformed input', () => {
  for (const amount of [0.1, '1.001', '1e3', 'NaN', '-0', ' 1']) {
    assert.throws(() => previewComposerStatement({ ...statement, rows: [{ ...row, total_net_royalti: amount }] }));
  }
  for (const change of [{ currency: 'USD' }, { source_batch: '' }, { period: '2026-13' }, { rows: [] }]) {
    assert.throws(() => previewComposerStatement({ ...statement, ...change }));
  }
  assert.throws(() => previewComposerStatement({ ...statement, rows: [{ ...row, composer_code: '' }] }));
});

test('composer input cannot enter artist royalty schema', () => {
  assert.equal(royaltyRow.safeParse(row).success, false);
});
