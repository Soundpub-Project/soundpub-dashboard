const fs = require('node:fs');
const assert = require('node:assert/strict');

const api = fs.readFileSync('src/api/releases.ts', 'utf8');
const activate = fs.readFileSync('src/components/releases/ActivateReleaseModal.tsx', 'utf8');
const reject = fs.readFileSync('src/components/releases/RejectReleaseModal.tsx', 'utf8');
const page = fs.readFileSync('src/pages/Releases.tsx', 'utf8');

assert.match(api, /\/api\/v1\/admin\/releases\/\$\{encodeURIComponent\(id\)\}\/activate/);
assert.match(activate, /releasesApi\.activate/);
assert.match(activate, /tracksApi\.list/);
assert.match(reject, /releasesApi\.update/);
assert.match(activate, /if \(usesBackendReleases\(\)\) return <BackendActivateReleaseModal/);
assert.match(reject, /if \(usesBackendReleases\(\)\) return <BackendRejectReleaseModal/);
assert.doesNotMatch(page, /handleOpenActivateDialog[\s\S]{0,180}releaseWorkflowUnavailable/);
assert.doesNotMatch(page, /handleOpenRejectDialog[\s\S]{0,180}releaseWorkflowUnavailable/);
console.log('release review frontend contract passed');
