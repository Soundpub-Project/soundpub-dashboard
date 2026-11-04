const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, imports) {
  const source = readFileSync(join(__dirname, file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, URLSearchParams, require: name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
    return imports[name];
  } });
  return exports;
}

function setup(respond = async () => ({})) {
  const requests = [];
  const { labelCustomApi } = load('../api/label-custom.ts', {
    './client': { apiRequest: async (path, options) => {
      const request = { path, ...options };
      requests.push(request);
      return respond(request);
    } },
  });
  const service = load('label-custom.ts', { '@/api/label-custom': { labelCustomApi }, zod: require('zod') });
  return { service, requests, api: labelCustomApi };
}

const input = { name: ' Artis Baru ', contact_email: ' artis@example.test ', contact_phone: ' +62 812 3456 ' };
const normalized = { name: 'Artis Baru', contact_email: 'artis@example.test', contact_phone: '+62 812 3456' };
const scope = { owner_user_id: 'owner/+? &=' };
const json = value => JSON.parse(JSON.stringify(value));

test('all eight endpoint operations use apiRequest and preserve owner scope and DTOs', async () => {
  const dto = { id: 'artist-id', artist_user_id: null, management_mode: 'LABEL_CUSTOM_MANAGED' };
  const { service, requests } = setup(async () => dto);
  assert.equal(await service.getLabelCustomUnit(scope), dto);
  assert.equal(await service.createLabelCustomUnit({ name: ' Unit ' }, scope), dto);
  assert.equal(await service.updateLabelCustomUnit({ status: 'archived' }, scope), dto);
  assert.equal(await service.getLabelCustomArtist('artist/id?#', scope), dto);
  assert.equal(await service.createLabelCustomArtist(input, 'artist-create-test', scope), dto);
  assert.equal(await service.updateLabelCustomArtist('artist/id?#', { contact_phone: ' +62 ' }, scope), dto);
  assert.equal(await service.archiveLabelCustomArtist('artist/id?#', scope), dto);
  const expected = [
    ['unit', undefined, undefined], ['unit', 'POST', { name: 'Unit' }],
    ['unit', 'PATCH', { status: 'archived' }], ['artists/artist%2Fid%3F%23', undefined, undefined],
    ['artists', 'POST', normalized], ['artists/artist%2Fid%3F%23', 'PATCH', { contact_phone: '+62' }],
    ['artists/artist%2Fid%3F%23', 'DELETE', undefined],
  ];
  requests.forEach((request, index) => {
    const url = new URL(request.path, 'http://localhost');
    assert.equal(url.pathname, `/api/v1/label-custom/${expected[index][0]}`);
    assert.equal(url.searchParams.get('owner_user_id'), scope.owner_user_id);
    assert.equal(request.method, expected[index][1]);
    assert.deepEqual(request.body === undefined ? undefined : json(request.body), expected[index][2]);
    if (index === 4) assert.equal(request.idempotencyKey, 'artist-create-test');
  });
  const list = setup(async () => ({ items: [dto], nextCursor: null }));
  assert.equal((await list.service.listLabelCustomArtists({}, scope))[0], dto);
  assert.equal(new URL(list.requests[0].path, 'http://localhost').pathname, '/api/v1/label-custom/artists');
  assert.equal(new URL(list.requests[0].path, 'http://localhost').searchParams.get('limit'), '100');
});

test('pagination retains filters and owner scope; empty roster stays empty', async () => {
  const { service, requests } = setup(async request => {
    const url = new URL(request.path, 'http://localhost');
    return url.searchParams.has('cursor')
      ? { items: [{ id: 'second', status: 'archived' }], nextCursor: null }
      : { items: [{ id: 'first', status: 'archived' }], nextCursor: 'cursor/+?=&' };
  });
  const artists = await service.listLabelCustomArtists({ search: 'Nama & Band', status: 'archived', limit: 25 }, scope);
  assert.deepEqual(Array.from(artists, item => item.id), ['first', 'second']);
  assert.equal(requests.length, 2);
  requests.forEach(request => {
    const params = new URL(request.path, 'http://localhost').searchParams;
    assert.equal(params.get('owner_user_id'), scope.owner_user_id);
    assert.equal(params.get('search'), 'Nama & Band');
    assert.equal(params.get('status'), 'archived');
    assert.equal(params.get('limit'), '25');
  });
  assert.equal(new URL(requests[1].path, 'http://localhost').searchParams.get('cursor'), 'cursor/+?=&');
  const empty = setup(async () => ({ items: [], nextCursor: null }));
  assert.equal((await empty.service.listLabelCustomArtists()).length, 0);
  assert.equal(new URL(empty.requests[0].path, 'http://localhost').searchParams.has('owner_user_id'), false);
});

test('repeated or cyclic cursors fail instead of looping', async () => {
  for (const cursors of [['same', 'same'], ['a', 'b', 'a']]) {
    let index = 0;
    const { service, requests } = setup(async () => ({ items: [], nextCursor: cursors[index++] }));
    await assert.rejects(service.listLabelCustomArtists(), /Pagination artis Label Custom tidak valid/);
    assert.equal(requests.length, cursors.length);
  }
});

test('create requires all contact fields; rejects password, ownership injection and unsupported fields', () => {
  const { service, requests } = setup();
  for (const field of Object.keys(input)) {
    const missing = { ...input };
    delete missing[field];
    assert.throws(() => service.createLabelCustomArtist(missing));
    assert.throws(() => service.createLabelCustomArtist({ ...input, [field]: '   ' }));
    assert.throws(() => service.createLabelCustomArtist({ ...input, [field]: null }));
  }
  for (const extra of [{ password: 'secret' }, { artist_user_id: 'login-id' }, { label_id: 'another-owner' }, { status: 'archived' }]) {
    assert.throws(() => service.createLabelCustomArtist({ ...input, ...extra }));
    assert.throws(() => service.updateLabelCustomArtist('artist', extra));
  }
  for (const bad of [
    { contact_email: 'invalid' }, { name: 'x'.repeat(201) },
    { contact_email: `${'x'.repeat(310)}@example.test` }, { contact_phone: '1'.repeat(51) },
  ]) assert.throws(() => service.createLabelCustomArtist({ ...input, ...bad }));
  assert.equal(requests.length, 0);
});

test('PATCH supports individual contact fields but rejects empty changes and invalid unit state', async () => {
  const { service, requests } = setup();
  for (const field of Object.keys(input)) {
    await service.updateLabelCustomArtist('id', { [field]: input[field] });
    assert.deepEqual(json(requests.at(-1).body), { [field]: normalized[field] });
  }
  assert.throws(() => service.updateLabelCustomArtist('id', {}));
  assert.throws(() => service.updateLabelCustomArtist('id', { name: undefined }));
  assert.throws(() => service.updateLabelCustomArtist('id', { contact_email: '' }));
  assert.throws(() => service.createLabelCustomUnit({ name: ' ' }));
  assert.throws(() => service.updateLabelCustomUnit({}));
  assert.throws(() => service.updateLabelCustomUnit({ status: 'inactive' }));
  assert.throws(() => service.updateLabelCustomUnit({ owner_user_id: 'other-owner' }));
});

test('backend errors propagate unchanged for every operation, including subsequent pages', async () => {
  for (const status of [0, 400, 401, 403, 404, 409, 429, 503]) {
    const failure = Object.assign(new Error('backend error'), { status, requestId: 'trace-id' });
    const { service } = setup(async () => { throw failure; });
    const operations = [
      () => service.getLabelCustomUnit(), () => service.createLabelCustomUnit({ name: 'Unit' }),
      () => service.updateLabelCustomUnit({ name: 'New' }), () => service.listLabelCustomArtists(),
      () => service.getLabelCustomArtist('id'), () => service.createLabelCustomArtist(input),
      () => service.updateLabelCustomArtist('id', { name: 'New' }), () => service.archiveLabelCustomArtist('id'),
    ];
    for (const operation of operations) await assert.rejects(operation(), error => error === failure);
  }
  const failure = new Error('second page failed');
  let calls = 0;
  const { service } = setup(async () => {
    if (calls++) throw failure;
    return { items: [{ id: 'partial' }], nextCursor: 'next' };
  });
  await assert.rejects(service.listLabelCustomArtists(), error => error === failure);
});
