const fs = require('node:fs');
const assert = require('node:assert/strict');

const api = fs.readFileSync('src/api/finance-adjustments.ts', 'utf8');
const panel = fs.readFileSync('src/components/finance/BackendFinanceAdjustments.tsx', 'utf8');
const payouts = fs.readFileSync('src/components/finance/BackendPayouts.tsx', 'utf8');

assert.match(api, /\/api\/v1\/admin\/finance\/adjustment-owners/);
assert.match(api, /\/api\/v1\/admin\/finance\/adjustments/);
assert.match(api, /idempotencyKey/);
assert.match(panel, /if \(!enabled\) return null/);
assert.match(panel, /item\.requested_by === user\?\.id/);
assert.match(panel, /crypto\.randomUUID\(\)/);
assert.match(panel, /BigInt\(minor\)/);
assert.match(payouts, /admin && isAdmin && <BackendFinanceAdjustments \/>/);
assert.doesNotMatch(api + panel, /supabase|\.from\(|\.rpc\(/i);
console.log('finance adjustment frontend contract passed');
