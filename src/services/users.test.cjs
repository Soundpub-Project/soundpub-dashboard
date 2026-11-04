const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

function load(relativePath, imports, globals = {}, transform = source => source) {
  const source = transform(readFileSync(join(__dirname, relativePath), 'utf8'));
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require: name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, ...globals });
  return exports;
}

(async () => {
  let backend = true;
  let pageCalls = 0;
  let profilePatch;
  let roleCalls = 0;
  const roleArguments = [];
  const api = {
    profile: async () => ({ profile: { id: 'backend-id', logo_url_light: 'light' }, roles: ['label', 'admin'] }),
    updateProfile: async patch => { profilePatch = patch; },
    list: async cursor => {
      pageCalls++;
      return cursor
        ? { items: [{ id: 'label', full_name: 'Label', status: 'active', roles: ['label', 'admin'] }], nextCursor: null }
        : { items: [{ id: 'artist', parent_label_id: 'outside', parent_label_name: 'Preserved', roles: ['artist'] }], nextCursor: 'next' };
    },
    roles: async (...args) => { roleCalls++; roleArguments.push(args); },
    status: async () => { throw Object.assign(new Error('FORBIDDEN'), { status: 403 }); },
  };
  const services = load('users.ts', {
    '@/api/routing': { usesBackendDomain: () => backend },
    '@/api/users': { usersApi: api },
    '@/api/labels': { labelsApi: { transfer: async (id, labelId, oldId, phrase) => { assert.equal(phrase, 'PINDAH LABEL'); assert.equal(oldId, 'old-label'); return { artistId: id, parentLabelId: labelId }; }, assign: async () => {}, remove: async () => {} } },
    '@/integrations/supabase/client': { supabase: new Proxy({}, { get() { throw new Error('Unexpected legacy access'); } }) },
  });
  const profile = await services.getCurrentProfile('legacy-id');
  assert.equal(profile.profile.id, 'backend-id');
  assert.equal(profile.profile.logo_url_light, 'light');
  assert.equal(profile.role, 'admin');
  await services.updateCurrentProfile('ignored-id', { full_name: 'Name', avatar_url: null });
  assert.equal(profilePatch.full_name, 'Name');
  assert.equal(profilePatch.avatar_url, null);
  const users = await services.listUsers();
  assert.equal(pageCalls, 2);
  assert.equal(users[0].parent_label_name, 'Preserved');
  assert.equal((await services.listLabels())[0].id, 'label');
  await assert.rejects(services.updateUserStatus('id', 'inactive'), error => error.status === 403);
  const role = { userId: 'id', role: 'user', previousRole: 'artist', parentLabelId: null, previousParentLabelId: 'label' };
  await assert.rejects(services.updateUserRole(role), /Perubahan role dan relasi label harus dilakukan terpisah/);
  assert.equal(roleCalls, 0);
  await services.updateUserRole({ ...role, previousParentLabelId: null });
  assert.equal(roleCalls, 1);
  assert.equal(JSON.stringify(roleArguments[0]), JSON.stringify(['id', ['user']]));
  await services.updateUserRole({ ...role, role: 'artist', previousRole: 'user', parentLabelId: 'new-label', previousParentLabelId: null });
  assert.equal(roleCalls, 2);
  assert.equal(JSON.stringify(roleArguments[1]), JSON.stringify(['id', ['artist'], 'new-label']));
  assert.deepEqual(await services.updateUserRole({ ...role, role: 'artist', previousRole: 'artist', parentLabelId: 'new-label', previousParentLabelId: 'old-label', transferConfirmation: 'PINDAH LABEL' }), { artistId: 'id', parentLabelId: 'new-label' });
  api.list = async () => ({ items: [], nextCursor: 'repeat' });
  await assert.rejects(services.listUsers(), /Invalid users pagination/);
  api.list = async () => ({ items: [], nextCursor: null });
  assert.equal((await services.listUsers()).length, 0);
  backend = false;
  await assert.rejects(services.updateCurrentProfile('id', { full_name: 'Legacy' }), /Unexpected legacy access/);
  console.log('Users frontend adapter checks: PASS');
  const requests = [];
  const { usersApi } = load('../api/users.ts', { './client': { apiRequest: async (...args) => { requests.push(args); } } });
  await usersApi.create({ email: 'new@example.test', password: 'twelve-chars!', fullName: 'New', role: 'user' });
  await usersApi.updateProfile({ phone: null });
  await usersApi.list('cursor+/?');
  await usersApi.roles('user/id', ['artist']);
  await usersApi.composerCode('copyright/id', 'UTR001');
  await usersApi.delete('user/id');
  assert.equal(requests[0][0], '/api/v1/admin/users');
  assert.equal(requests[0][1].method, 'POST');
  assert.equal(requests[1][0], '/api/v1/profile');
  assert.equal(requests[1][1].method, 'PATCH');
  assert.equal(requests[1][1].body.phone, null);
  assert.equal(requests[2][0], '/api/v1/admin/users?limit=100&cursor=cursor%2B%2F%3F');
  assert.equal(requests[3][0], '/api/v1/admin/users/user%2Fid/roles');
  assert.equal(requests[3][1].body.parentLabelId, undefined);
  assert.equal(requests[4][0], '/api/v1/admin/users/copyright%2Fid/composer-code');
  assert.equal(requests[4][1].body.composerCode, 'UTR001');
  assert.equal(requests[5][0], '/api/v1/admin/users/user%2Fid');
  assert.equal(requests[5][1].method, 'DELETE');
  console.log('Users frontend API contract checks: PASS');
  for (const [development, domains, expected] of [[true, ' users , releases ', true], [false, 'users', true], [true, '', false], [false, '', false]]) {
    const routing = load('../api/routing.ts', {}, {}, source => source
      .replaceAll('import.meta.env.DEV', String(development))
      .replaceAll('import.meta.env.VITE_SOUNDPUB_BACKEND_DOMAINS', JSON.stringify(domains)));
    assert.equal(routing.usesBackendDomain('users'), expected);
  }
  console.log('Users frontend explicit domain routing checks: PASS');
  for (const file of ['../pages/Settings.tsx', '../hooks/useAuth.tsx', '../components/settings/LabelLogoSettings.tsx']) {
    const source = readFileSync(join(__dirname, file), 'utf8');
    assert.doesNotMatch(source, /\.from\s*\(\s*['"](?:profiles|user_roles)['"]\s*\)/, file);
  }
  for (const file of ['../pages/Settings.tsx', '../components/settings/LabelLogoSettings.tsx']) {
    const source = readFileSync(join(__dirname, file), 'utf8');
    assert.match(source, /if \(backendUsers\) return;/, file);
    assert.match(source, /disabled=\{backendUsers \|\|/, file);
  }
  const addUserDialog = readFileSync(join(__dirname, '../components/users/AddUserDialog.tsx'), 'utf8');
  assert.doesNotMatch(addUserDialog, /if \(usesBackendArtistLabels\(\)\) return;/);
  assert.match(addUserDialog, /if \(usesBackendArtistLabels\(\) && !backendUsers\) return;/);
  assert.match(addUserDialog, /if \(open && isAdmin && \(backendUsers \|\| !usesBackendArtistLabels\(\)\)\)/);
  assert.match(addUserDialog, /value: 'superadmin'/);
  const usersPage = readFileSync(join(__dirname, '../pages/Users.tsx'), 'utf8');
  assert.match(usersPage, /user\.id === currentUserId \? navigate\("\/dashboard\/settings"\) : handleEditPassword\(user\)/);
  assert.match(usersPage, /onClick=\{\(\) => setAddUserDialogOpen\(true\)\}\s+className="gradient-primary"/s);
  assert.match(usersPage, /\{!backendUsers && isSuperadmin &&/);
  assert.match(usersPage, /!isSuperadmin \|\|\s+user\.id === currentUserId/s);
  assert.match(usersPage, /penghapusan user kosong sudah tersedia/);
  assert.match(usersPage, /\{user\.role === "artist" && \(/);
  assert.doesNotMatch(usersPage, /!backendUsers && user\.role === "artist"/);
  const roleDialog = readFileSync(join(__dirname, '../components/users/ChangeRoleDialog.tsx'), 'utf8');
  assert.match(roleDialog, /disabled=\{\['admin', 'superadmin'\]\.includes\(role\.value\) && !isSuperadmin\}/);
  assert.match(roleDialog, /Promosi user menjadi artist dibuat bersama relasi label/);
  const composerDialog = readFileSync(join(__dirname, '../components/users/EditComposerCodeDialog.tsx'), 'utf8');
  assert.match(composerDialog, /usersApi\.composerCode\(user\.id, normalizedCode\)/);
  assert.match(usersPage, /\{user\.role === "copyright" && \(/);
  assert.doesNotMatch(usersPage, /!backendUsers && user\.role === "copyright"/);
  const statusDialog = readFileSync(join(__dirname, '../components/users/ChangeStatusDialog.tsx'), 'utf8');
  assert.match(statusDialog, /User dinonaktifkan dan tidak dapat login sampai status diaktifkan kembali/);
  const deleteDialog = readFileSync(join(__dirname, '../components/users/DeleteUserDialog.tsx'), 'utf8');
  assert.match(deleteDialog, /await usersApi\.delete\(user\.id\)/);
  assert.match(deleteDialog, /confirmation !== user\.email/);
  assert.match(deleteDialog, /user\?\.status !== 'inactive'/);
  console.log('Users frontend direct profile/role write guards: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });

