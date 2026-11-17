const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let backend = true;
const exportsObject = {};
const source = ts.transpileModule(read('src/services/releases.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, {
  exports: exportsObject,
  require: id => id === '@/api/routing' ? { usesBackendDomain: domain => backend && domain === 'releases' } : { releasesApi: {} },
});
(async () => {
  const collect = exportsObject.collectReleasePages;
  const calls = [];
  assert.deepEqual(Array.from(await collect(async cursor => {
    calls.push(cursor);
    return cursor ? { items: [2], nextCursor: null } : { items: [1], nextCursor: 'next' };
  })), [1, 2]);
  assert.deepEqual(calls, [undefined, 'next']);
  await assert.rejects(collect(async () => ({ items: [], nextCursor: 'loop' })), /cursor/);
  await assert.rejects(collect(async () => ({ items: [] })), /pagination/);
  backend = false;
  await assert.rejects(collect(async () => assert.fail('Legacy mode must not call API')), /Backend releases mode required/);
  for (const name of ['ReleaseFormPage', 'ReleaseFormDialog', 'ArtistReleaseFormDialog', 'ActivateReleaseModal', 'ArchiveReleaseDialog', 'DeleteReleaseDialog', 'RejectReleaseModal']) {
    const text = read(`src/components/releases/${name}.tsx`);
    const wrapper = text.slice(text.indexOf(`export function ${name}(`));
    assert(wrapper.indexOf('if (usesBackendReleases())') < wrapper.indexOf(`<Legacy${name}`), name);
    assert(wrapper.includes('releaseWorkflowUnavailable') || wrapper.includes(`<Backend${name} `), name);
  }
  for (const name of ['ReleaseCreate', 'ReleaseEdit']) {
    const text = read(`src/pages/${name}.tsx`);
    const wrapper = text.slice(text.indexOf(`export default function ${name}(`));
    assert(wrapper.indexOf('if (usesBackendReleases())') < wrapper.indexOf(`<Legacy${name}`), name);
  }
  const releaseCreate = read('src/pages/ReleaseCreate.tsx');
  assert.match(releaseCreate, /<ArtistOnboardingDialog[\s\S]*?onComplete=\{async/);

  const callsApi = [];
  for (const file of ['releases', 'tracks']) {
    const apiExports = {};
    vm.runInNewContext(ts.transpileModule(read(`src/api/${file}.ts`), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports: apiExports, require: () => ({ apiRequest: async (url, options) => { callsApi.push({ url, options }); return {}; } }) });
    if (file === 'releases') {
      await apiExports.releasesApi.createAggregate({ title: 'Draft', artist_name: 'Artist', artist_user_id: 'artist', release_type: 'single', status: 'draft', tracks: [{ title: 'Track', artist_name: 'Artist' }] });
      await apiExports.releasesApi.updateAggregate('release', { version: 3, tracks: [{ id: 'track', version: 2, title: 'Track', artist_name: 'Artist' }] });
      await apiExports.releasesApi.readiness('release');
      await apiExports.releasesApi.submit('release', { version: 4 });
    } else {
      await apiExports.tracksApi.list('release');
      await apiExports.tracksApi.create('release', { title: 'Track', artist_name: 'Artist', release_version: 4 });
      await apiExports.tracksApi.update('track', { title: 'Changed', artist_name: 'Artist', version: 2, release_version: 5 });
    }
  }
  assert.equal(callsApi[0].url, '/api/v1/releases/aggregate');
  assert.equal(callsApi[0].options.body.tracks.length, 1);
  assert.equal(callsApi[1].url, '/api/v1/releases/release/aggregate');
  assert.equal(callsApi[2].url, '/api/v1/releases/release/submission-readiness');
  assert.equal(callsApi[3].url, '/api/v1/releases/release/submit');
  assert.equal(callsApi[4].url, '/api/v1/releases/release/tracks');
  assert.equal(callsApi[5].options.body.release_version, 4);
  assert.equal(callsApi[6].options.method, 'PATCH');
  assert.equal(callsApi[6].options.body.version, 2);
  console.log('Release pagination, mount guards, and versioned API contracts passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
