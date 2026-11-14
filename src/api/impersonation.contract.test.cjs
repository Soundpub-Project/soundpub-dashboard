const fs = require('node:fs');
const assert = require('node:assert/strict');

const api = fs.readFileSync('src/api/auth.ts', 'utf8');
const auth = fs.readFileSync('src/hooks/useAuth.tsx', 'utf8');
const users = fs.readFileSync('src/pages/Users.tsx', 'utf8');
const layout = fs.readFileSync('src/components/layout/DashboardLayout.tsx', 'utf8');

assert.match(api, /\/api\/v1\/admin\/impersonations'/);
assert.match(api, /\/api\/v1\/admin\/impersonations\/stop/);
assert.match(api, /body: \{ targetUserId, reason, currentPassword \}/);
assert.match(auth, /setImpersonation\(result\.impersonation \?\? null\)/);
assert.match(auth, /applyLocalSession\(await authApi\.startImpersonation/);
assert.match(auth, /applyLocalSession\(await authApi\.stopImpersonation/);
assert.match(users, /type="password" autoComplete="current-password"/);
assert.match(users, /if \(backendUsers\) \{\s*setImpersonationTarget\(target\)/);
assert.doesNotMatch(users, /sessionStorage\.setItem\([^)]*impersonationPassword/);
assert.match(layout, /impersonation: backendImpersonation, stopImpersonation/);
assert.match(layout, /await stopImpersonation\(\)/);
console.log('backend impersonation frontend contract passed');
