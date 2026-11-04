const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..');
const read = file => readFileSync(join(root, file), 'utf8');
for (const file of ['src/api/releases.ts', 'src/api/tracks.ts', 'src/api/public-catalog.ts', 'src/services/releases.ts', 'src/services/tracks.ts', 'src/components/releases/BackendReleaseForm.tsx']) {
  assert.doesNotMatch(read(file), /integrations\/supabase|supabase\.(?:from|rpc|functions|storage)/, file);
}
for (const name of ['ReleaseFormPage', 'ReleaseFormDialog', 'ArtistReleaseFormDialog', 'ActivateReleaseModal', 'ArchiveReleaseDialog', 'DeleteReleaseDialog', 'RejectReleaseModal']) {
  const text = read(`src/components/releases/${name}.tsx`);
  assert.match(text, new RegExp(`function Legacy${name}\\(`), name);
  assert.match(text, new RegExp(`export function ${name}\\([\\s\\S]*usesBackendReleases\\(\\)`), name);
}
for (const name of ['ReleaseCreate', 'ReleaseEdit']) {
  const text = read(`src/pages/${name}.tsx`);
  assert.match(text, new RegExp(`function Legacy${name}\\(`), name);
  assert.match(text, /usesBackendReleases\(\).*BackendReleaseForm/s, name);
}
for (const name of ['Invoices', 'MediaLibrary', 'Takedown', 'TakedownDetail', 'UploadRoyalty', 'WhitelabelDashboard']) {
  const text = read(`src/pages/${name}.tsx`);
  assert.match(text, new RegExp(`function Legacy${name}\\(`), name);
  assert.match(text, new RegExp(`export default function ${name}\\([\\s\\S]*usesBackendReleases\\(\\)`), name);
}
assert.match(read('src/pages/Releases.tsx'), /usesBackendReleases\(\)[\s\S]*listBackendReleases/);
assert.match(read('src/pages/ReleaseDetail.tsx'), /usesBackendReleases\(\)[\s\S]*getBackendRelease/);
assert.match(read('src/pages/Tracks.tsx'), /usesBackendReleases\(\)[\s\S]*listBackendTracks/);
assert.match(read('src/pages/Dashboard.tsx'), /usesBackendReleases\(\)[\s\S]*listBackendReleases/);
assert.match(read('src/hooks/useExportCsv.ts'), /usesBackendReleases\(\).*listBackendReleases/);
assert.match(read('src/pages/LandingPage.tsx'), /publicCatalogApi\.list/);
assert.doesNotMatch(read('src/pages/LandingPage.tsx'), /integrations\/supabase|supabase\./);
console.log('Phase 3C backend-mode Release/Track Supabase static gate: PASS (unexpected 0)');
