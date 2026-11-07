const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');

const api = readFileSync(join(__dirname, '../../api/users.ts'), 'utf8');
const component = readFileSync(join(__dirname, 'IccnIdentityDialog.tsx'), 'utf8');
const usersPage = readFileSync(join(__dirname, '../../pages/Users.tsx'), 'utf8');

test('ICCN API client matches admin identity routes and request body', () => {
  assert.match(api, /iccnIdentity:.*apiRequest<IccnIdentity>/s);
  assert.match(api, /bindIccnIdentity:.*method: 'PUT', body: \{ subject \}/s);
  assert.match(api, /unbindIccnIdentity:.*method: 'DELETE', body: \{ subject \}/s);
  assert.match(api, /admin\/users\/\$\{encodeURIComponent\(id\)\}\/iccn-identity/);
});

test('users page exposes ICCN manager only to superadmin for backend artist rows', () => {
  assert.match(usersPage, /user\.role === "artist"[\s\S]*backendUsers && isSuperadmin[\s\S]*Kelola ICCN/);
  assert.match(usersPage, /IccnIdentityDialog/);
});

test('dialog loads eligibility and requires exact subject before unbind', () => {
  assert.match(component, /usersApi\.iccnIdentity\(user\.id/);
  assert.match(component, /!identity\.eligible && !binding/);
  assert.match(component, /confirmation === binding\.subject/);
  assert.match(component, /usersApi\.unbindIccnIdentity\(user\.id, identity\.binding\.subject\)/);
  assert.match(component, /await onSuccess\?\.\(\)/);
  assert.match(component, /id="iccn-issuer"[\s\S]*readOnly/);
  assert.match(component, /!binding\.verifiedAt[\s\S]*Verifikasi ICCN/);
  assert.match(component, /binding\.issuer !== identity\?\.issuer/);
  assert.match(component, /usersApi\.bindIccnIdentity\(user\.id, identity\.binding\.subject\)/);
  assert.match(component, /activeUserId\.current === targetId/);
  assert.match(component, /SoundpubApiError/);
});
