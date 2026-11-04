const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');

const component = readFileSync(join(__dirname, 'LabelCustomArtistsAdminDialog.tsx'), 'utf8');
const usersPage = readFileSync(join(__dirname, '../../pages/Users.tsx'), 'utf8');

test('admin Label Custom manager scopes every read and mutation to selected owner', () => {
  assert.match(component, /owner_user_id: owner\.id/);
  for (const call of [
    'getLabelCustomUnit(scope)',
    'listLabelCustomArtists({ status: "active" }, scope)',
    'listLabelCustomArtists({ status: "archived" }, scope)',
    'createLabelCustomUnit({ name }, scope)',
    'archiveLabelCustomArtist(archiveTarget.id, scope)',
  ]) assert.ok(component.includes(call), call);
  assert.match(component, /LabelCustomArtistDialog mode="edit"[\s\S]*scope=\{scope\}/);
  assert.match(component, /LabelCustomArtistDialog mode="create"[\s\S]*scope=\{scope\}/);
});

test('users page exposes manager only for backend Label Custom users', () => {
  assert.match(usersPage, /user\.role === "label_custom" \|\| user\.roles\?\.includes\("label_custom"\)/);
  assert.match(usersPage, /&& backendUsers/);
  assert.match(usersPage, /Kelola Artis/);
  assert.match(usersPage, /LabelCustomArtistsAdminDialog/);
});

test('ordinary admin receives read-only UI for protected owner hierarchy', () => {
  assert.match(usersPage, /if \(isSuperadmin\) return true/);
  assert.match(usersPage, /role === "admin" \|\| role === "superadmin"/);
  assert.match(component, /const readOnly = !canMutate/);
  assert.match(component, /Hanya lihat/);
});

test('archived artists remain visible but cannot be edited or archived again', () => {
  assert.match(component, /artist\.status !== "active"/);
  assert.match(component, /Release dan histori royalti tetap dipertahankan/);
});