const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');

const migration = readFileSync('supabase/migrations/20261026215612_make_contracts_private.sql', 'utf8');
const adminPage = readFileSync('src/pages/CopyrightRegistrationReview.tsx', 'utf8');
const ownerPage = readFileSync('src/pages/CopyrightDashboard.tsx', 'utf8');

test('contracts staged policy defaults private and scopes owner to registration', () => {
  assert.match(migration, /SET public = false/);
  assert.match(migration, /TO authenticated\s+USING\s*\(\s*bucket_id = 'contracts'/);
  assert.match(migration, /registration\.id::text = split_part\(storage\.objects\.name, '\/', 2\)/);
  assert.match(migration, /registration\.user_id = auth\.uid\(\)/);
  assert.match(migration, /TO service_role/);
});

test('browser stores only private object path and signs on demand', () => {
  assert.doesNotMatch(adminPage, /from\(contractBucket\)\.getPublicUrl/);
  assert.match(adminPage, /_stamped_pdf_url: filePath/);
  assert.match(adminPage, /createSignedUrl\(value, 300\)/);
  assert.match(ownerPage, /createSignedUrl\(path, 300\)/);
});

test('PDF request fails closed without same-origin HTTPS and a session', () => {
  assert.doesNotMatch(adminPage, /http:\/\/localhost:3001/);
  assert.match(adminPage, /new URL\(pdfServiceUrl, window\.location\.origin\)\.origin !== window\.location\.origin/);
  assert.match(adminPage, /!session\?\.access_token/);
  assert.match(adminPage, /Authorization: `Bearer \$\{session\.access_token\}`/);
});
