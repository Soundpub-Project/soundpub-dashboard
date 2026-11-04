const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: id => { assert(id in imports, `Unexpected import ${id}`); return imports[id]; } });
  return exports;
}
(async () => {
  const requests = [];
  const { releasesApi } = load('src/api/releases.ts', { './client': { apiRequest: async (url, options) => { requests.push({ url, ...options }); return {}; } } });
  await releasesApi.createAggregate({ artist_id: 'catalog-artist', title: 'Custom', artist_name: 'Catalog', release_type: 'single', status: 'draft', tracks: [] });
  assert.equal(requests[0].body.artist_id, 'catalog-artist');
  assert.equal(requests[0].body.artist_user_id, undefined);
  await releasesApi.createAggregate({ artist_user_id: 'login-artist', title: 'Login', artist_name: 'Login', release_type: 'single', status: 'draft', tracks: [] });
  assert.equal(requests[1].body.artist_user_id, 'login-artist');
  let backend = true;
  const service = load('src/services/releases.ts', { '@/api/releases': { releasesApi }, '@/api/routing': { usesBackendDomain: () => backend } });
  await service.archiveBackendRelease({ id: 'release/id', version: 7, archived_at: null });
  assert.equal(requests[2].url, '/api/v1/releases/release%2Fid');
  assert.equal(requests[2].method, 'PATCH');
  assert.equal(requests[2].body.version, 7);
  assert.equal(requests[2].body.status, 'inactive');
  assert(!Number.isNaN(Date.parse(requests[2].body.archived_at)));
  await service.archiveBackendRelease({ id: 'release', version: 8, archived_at: '2026-11-03T00:00:00Z' });
  assert.equal(requests[3].body.archived_at, null);
  assert.equal(requests[3].body.status, undefined);
  backend = false;
  assert.throws(() => service.archiveBackendRelease({ id: 'release', version: 9, archived_at: null }), /Backend releases mode required/);
  assert.equal(requests.length, 4);
  const form = read('src/components/releases/BackendReleaseForm.tsx');
  assert(form.includes("listLabelCustomArtists({ status: 'active' })"));
  assert(form.includes("rows.filter(row => row.status === 'active')"));
  assert(form.includes('htmlFor="release-artist"'));
  assert(form.includes('id="release-artist" required'));
  assert(form.includes('value={artist.id}'));
  assert(form.includes('!releaseId && !isLabelCustom'));
  assert(form.includes('!releaseId && isLabelCustom'));
  assert(form.includes('artistsError &&'));
  assert(form.includes('artists.length === 0'));
  assert(form.includes('return () => { active = false; }'));
  assert(form.includes('artists.some(artist => artist.id === artistId)'));
  const update = form.match(/releasesApi\.updateAggregate\([^\n]+/)[0];
  assert(!update.includes('artist_id') && !update.includes('artist_user_id'));
  const app = read('src/App.tsx');
  for (const component of ['Releases', 'ReleaseCreate', 'ReleaseEdit', 'ReleaseDetail', 'Tracks']) {
    const grant = app.slice(0, app.indexOf(`<${component} />`)).split('<ProtectedRoute').pop();
    assert(grant.includes('usesBackendReleases()') && grant.includes('"label_custom"'), component);
  }
  console.log('Label Custom canonical create, login compatibility, immutable edit, selector guards, routes, versioned archive/restore passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
