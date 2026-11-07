const fs = require('node:fs');
const assert = require('node:assert/strict');

const api = fs.readFileSync('src/api/exports.ts', 'utf8');
const hook = fs.readFileSync('src/hooks/useExportCsv.ts', 'utf8');
const client = fs.readFileSync('src/api/client.ts', 'utf8');

for (const dataset of ['profiles', 'artists', 'releases', 'tracks', 'royalties', 'royalty_uploads',
  'payout_requests', 'audit_logs', 'user_roles', 'app_settings']) assert.match(api, new RegExp(`'${dataset}'`));
assert.match(api, /\/api\/v1\/admin\/exports\/\$\{encodeURIComponent\(dataset\)\}/);
assert.match(api, /credentials: 'include'/);
assert.match(api, /getApiAccessToken\(\)/);
assert.match(api, /Authorization: `Bearer \$\{token\}`/);
assert.match(api, /x-export-row-count/);
assert.doesNotMatch(api, /x-export-next-offset|offset|supabase/i);
assert.match(client, /export function getApiAccessToken/);
assert.match(hook, /downloadBackendExport\(table\.id\)/);
assert.doesNotMatch(hook, /supabase|convertToCSV|usesBackendDomain/i);
console.log('frontend export contract passed');
