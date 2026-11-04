const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = file => readFileSync(join(root, file), 'utf8');
const backendOnly = [
  'src/api/royalties.ts', 'src/api/payouts.ts', 'src/api/payments.ts', 'src/api/balance.ts',
  ...readdirSync(join(root, 'src/components/finance')).filter(name => /\.tsx?$/.test(name)).map(name => `src/components/finance/${name}`),
];
for (const file of backendOnly) {
  assert.doesNotMatch(read(file), /integrations\/supabase|supabase\.(?:from|rpc|functions|storage)/, file);
}

const legacyCallers = [
  'src/pages/Royalties.tsx', 'src/pages/RoyaltySummary.tsx', 'src/pages/AllRoyalties.tsx',
  'src/pages/UploadRoyalty.tsx', 'src/pages/ComposerRoyalties.tsx', 'src/pages/Payouts.tsx',
  'src/pages/AdminPayouts.tsx', 'src/pages/Invoices.tsx', 'src/pages/PaymentCallback.tsx',
  'src/pages/Dashboard.tsx', 'src/pages/ReleaseDetail.tsx', 'src/pages/WhitelabelDashboard.tsx',
  'src/pages/CopyrightAnalytics.tsx', 'src/pages/CopyrightDashboard.tsx',
  'src/pages/CopyrightRoyaltySummary.tsx', 'src/pages/CopyrightRoyaltyUpload.tsx',
  'src/pages/CopyrightRoyaltyUploadHistory.tsx', 'src/hooks/useRoyaltyData.ts',
  'src/hooks/useExportCsv.ts', 'src/lib/fetchAllRoyalties.ts', 'src/lib/xendit.ts',
  'src/components/royalty/ComposerRoyaltyUpload.tsx',
  'src/components/layout/DashboardLayout.tsx', 'src/components/settings/PayoutSettings.tsx',
];
for (const file of legacyCallers) {
  const source = read(file);
  assert.match(source, /usesBackend(?:Domain|Releases|Finance)|requireLegacyFinance|backendFinancial/, `${file}: missing backend guard`);
}
console.log(`Phase 3E financial static inventory: ${backendOnly.length} backend-only files and ${legacyCallers.length} guarded legacy callers`);

