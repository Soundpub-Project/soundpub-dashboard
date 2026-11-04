const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const source = readFileSync(join(__dirname, 'MyArtists.tsx'), 'utf8');
const ast = ts.createSourceFile('MyArtists.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functionSource = name => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast);

class SoundpubApiError extends Error {
  constructor(category, status) { super(category); this.category = category; this.status = status; }
}
const unit = { id: 'unit-1', name: 'Unit PIC', status: 'active' };
const artist = {
  id: 'custom-artist-1', name: 'Artis Satu', contact_email: 'kontak@example.test',
  contact_phone: '+62 812 3456', status: 'active', artist_user_id: null,
  management_mode: 'LABEL_CUSTOM_MANAGED', label_custom_unit_id: unit.id,
};
const archivedArtist = { ...artist, id: 'custom-artist-2', name: 'Artis Arsip', status: 'archived' };
const missing = () => new SoundpubApiError('NOT_FOUND', 404);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const event = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

// Shallow hook harness: run page logic with service doubles, never mount legacy
// account dialogs, providers, network clients, or a browser session.
function setup(overrides = {}) {
  const calls = [];
  const methods = {
    getLabelCustomUnit: async () => unit,
    listLabelCustomArtists: async query => query.status === 'archived' ? [archivedArtist] : [artist],
    createLabelCustomUnit: async input => ({ ...unit, ...input }),
    archiveLabelCustomArtist: async id => ({ ...artist, id, status: 'archived' }),
    ...overrides,
  };
  const services = Object.fromEntries(Object.keys(methods).map(name => [name, (...args) => {
    calls.push({ name, args });
    return methods[name](...args);
  }]));
  const auth = { loading: false, user: { id: 'pic-1' }, isLabelCustom: true };
  const slots = [];
  let cursor = 0;
  let effects = [];
  let unmounted = false;
  let lateUpdates = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        if (unmounted) lateUpdates += 1;
        slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  const element = (type, props, key) => ({ type, props: props || {}, key });
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-router-dom': { useNavigate: () => () => assert.fail('Unexpected navigation') },
    '@/hooks/useAuth': { useAuth: () => auth },
    '@/api/client': { SoundpubApiError },
    '@/services/label-custom': services,
    '@/services/labels': {
      usesBackendArtistLabels: () => assert.fail('Custom page must not consult legacy backend routing'),
      listLabelArtists: () => assert.fail('Custom page must not fall back to legacy artists'),
    },
  };
  const exports = {};
  const compiled = ts.transpileModule(`${source}\nexport { LabelCustomMyArtists, LegacyMyArtists };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(compiled, { exports, console, require: name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name.startsWith('@/components/') || name === 'lucide-react') return new Proxy({}, { get: (_target, key) => key });
    assert.fail(`Unexpected page dependency: ${name}`);
  } });
  function render() {
    cursor = 0;
    const tree = exports.LabelCustomMyArtists();
    const pending = effects;
    effects = [];
    pending.forEach(effect => effect());
    return tree;
  }
  return {
    auth, calls, exports, render,
    async settle() { await new Promise(resolve => setImmediate(resolve)); return render(); },
    unmount() { unmounted = true; slots.forEach(slot => slot.cleanup?.()); },
    get lateUpdates() { return lateUpdates; },
  };
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const all = (tree, type) => nodes(tree, node => node.type === type);
const one = (tree, type) => { const found = all(tree, type); assert.equal(found.length, 1, type); return found[0]; };
const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree);
const button = (tree, label) => {
  const found = nodes(tree, node => node.type === 'Button' && (node.props['aria-label'] || text(node).trim()) === label);
  assert.equal(found.length, 1, label);
  return found[0];
};
const input = (tree, id) => {
  const found = nodes(tree, node => node.type === 'Input' && node.props.id === id);
  assert.equal(found.length, 1, id);
  return found[0];
};
const callsFor = (harness, name) => harness.calls.filter(call => call.name === name);

test('role gate isolates label_custom, waits for auth, and retains legacy roles', () => {
  const h = setup();
  let route = h.exports.default();
  assert.equal(route.type.name, 'LabelCustomMyArtists');
  assert.equal(route.key, 'pic-1');
  h.auth.user = { id: 'pic-2' };
  assert.equal(h.exports.default().key, 'pic-2', 'PIC change remounts private state');
  h.auth.loading = true;
  assert.equal(h.exports.default(), null);
  h.auth.loading = false;
  h.auth.user = null;
  assert.equal(h.exports.default(), null);
  for (const role of ['label', 'whitelabel', 'admin', 'superadmin']) {
    Object.assign(h.auth, { user: { id: role }, role, isLabelCustom: false });
    route = h.exports.default();
    assert.equal(route.type.name, 'LegacyMyArtists', role);
  }
  assert.equal(h.calls.length, 0);
});

test('static boundary excludes account actions, Supabase fallback, and unit-code input', () => {
  const custom = functionSource('LabelCustomMyArtists');
  assert.doesNotMatch(custom, /supabase|listLabelArtists\b|usesBackendArtistLabels|AddUserDialog|LabelAddArtistDialog|RequestDeletionDialog|DeleteArtistDialog|ChangePasswordDialog|unit_code|unitCode|owner_user_id/);
  assert.match(custom, /<AlertDialog\b/);
  assert.doesNotMatch(custom, /window\.confirm/);
  assert.match(custom, /Saldo dan royalti seluruh artis terakumulasi ke PIC Label Custom/);
  assert.match(custom, /Artis tidak bisa login/);
  assert.match(custom, /grid-cols-1[^"\n]*md:grid-cols-2[^"\n]*xl:grid-cols-3/);
  assert.match(custom, /break-all/);
  const legacy = functionSource('LegacyMyArtists');
  assert.match(legacy, /backendArtists \|\| !isLabel/);
  assert.match(legacy, /<AddUserDialog/);
  assert.match(legacy, /<ChangePasswordDialog/);
  assert.match(legacy, /listLabelArtists\(/);
});

test('loads active and archived contacts through custom services without owner spoofing', async () => {
  const h = setup();
  assert.match(text(h.render()), /Memuat artis/);
  const tree = await h.settle();
  assert.equal(callsFor(h, 'getLabelCustomUnit').length, 1);
  assert.deepEqual(callsFor(h, 'getLabelCustomUnit')[0].args, []);
  assert.deepEqual(callsFor(h, 'listLabelCustomArtists').map(call => call.args[0].status).sort(), ['active', 'archived']);
  assert.ok(callsFor(h, 'listLabelCustomArtists').every(call => call.args.length === 1));
  assert.match(text(tree), /kontak@example\.test/);
  assert.match(text(tree), /\+62 812 3456/);
  assert.match(text(tree), /Aktif/);
  assert.match(text(tree), /Diarsipkan/);
  assert.equal(button(tree, 'Edit Artis Arsip').props.disabled, true);
  assert.equal(button(tree, 'Arsipkan Artis Arsip').props.disabled, true);
});

test('unit 404 offers name-only setup, trims name, blocks duplicate submit, then reloads', async () => {
  let created = false;
  const pending = deferred();
  const h = setup({
    getLabelCustomUnit: async () => { if (!created) throw missing(); return unit; },
    createLabelCustomUnit: async () => { await pending.promise; created = true; return unit; },
  });
  h.render();
  let tree = await h.settle();
  assert.equal(callsFor(h, 'listLabelCustomArtists').length, 0);
  assert.match(text(tree), /Siapkan Unit Label Custom/);
  assert.equal(all(tree, 'Input').length, 1);
  input(tree, 'label-custom-unit-name').props.onChange({ target: { value: '   ' } });
  await one(h.render(), 'form').props.onSubmit(event());
  assert.equal(callsFor(h, 'createLabelCustomUnit').length, 0);
  assert.match(text(h.render()), /1–200 karakter/);
  input(h.render(), 'label-custom-unit-name').props.onChange({ target: { value: ' Unit Baru ' } });
  const form = one(h.render(), 'form');
  const submitting = form.props.onSubmit(event());
  await form.props.onSubmit(event());
  assert.equal(callsFor(h, 'createLabelCustomUnit').length, 1);
  assert.equal(JSON.stringify(callsFor(h, 'createLabelCustomUnit')[0].args), '[{"name":"Unit Baru"}]');
  assert.equal(button(h.render(), 'Membuat unit…').props.disabled, true);
  pending.resolve();
  await submitting;
  tree = await h.settle();
  assert.match(text(tree), /Unit Label Custom berhasil dibuat/);
  assert.match(text(tree), /Artis Satu/);
  assert.equal(all(tree, 'form').length, 0);
});

test('setup failure preserves name and offers reload for concurrent-unit conflict', async () => {
  let exists = false;
  const h = setup({
    getLabelCustomUnit: async () => { if (!exists) throw missing(); return unit; },
    createLabelCustomUnit: async () => { exists = true; throw new SoundpubApiError('CONFLICT', 409); },
  });
  h.render();
  let tree = await h.settle();
  input(tree, 'label-custom-unit-name').props.onChange({ target: { value: 'Nama Tetap' } });
  await one(h.render(), 'form').props.onSubmit(event());
  tree = h.render();
  assert.equal(input(tree, 'label-custom-unit-name').props.value, 'Nama Tetap');
  assert.match(text(tree), /Status data sudah berubah/);
  button(tree, 'Muat ulang').props.onClick();
  assert.match(text(await h.settle()), /Artis Satu/);
});

test('non-404 unit failures and artist-list 404 never expose unit setup or legacy fallback', async () => {
  for (const status of [401, 403, 503]) {
    const h = setup({ getLabelCustomUnit: async () => { throw new SoundpubApiError('ERROR', status); } });
    h.render();
    const tree = await h.settle();
    assert.equal(all(tree, 'form').length, 0);
    assert.equal(callsFor(h, 'listLabelCustomArtists').length, 0);
    assert.ok(nodes(tree, node => node.props.role === 'alert').length);
    assert.equal(button(tree, 'Coba lagi').props.disabled, false);
  }
  const h = setup({ listLabelCustomArtists: async () => { throw missing(); } });
  h.render();
  const tree = await h.settle();
  assert.equal(all(tree, 'form').length, 0);
  assert.match(text(tree), /belum dapat dimuat/);
});

test('create and edit use LabelCustomArtistDialog with unmodified artist DTO and refresh', async () => {
  const h = setup();
  h.render();
  let tree = await h.settle();
  button(tree, 'Tambah Artist').props.onClick();
  let dialog = one(h.render(), 'LabelCustomArtistDialog');
  assert.equal(dialog.props.mode, 'create');
  assert.equal(dialog.props.scope, undefined);
  assert.equal(dialog.props.artist, undefined);
  dialog.props.onOpenChange(false);
  button(h.render(), 'Edit Artis Satu').props.onClick();
  dialog = one(h.render(), 'LabelCustomArtistDialog');
  assert.equal(dialog.props.mode, 'edit');
  assert.equal(dialog.props.artist, artist);
  dialog.props.onOpenChange(false);
  dialog.props.onSuccess({ ...artist, name: 'Updated' });
  tree = await h.settle();
  assert.equal(callsFor(h, 'getLabelCustomUnit').length, 2);
  assert.equal(all(tree, 'LabelCustomArtistDialog').length, 0);
});

test('search matches contact email and telephone and distinguishes no results', async () => {
  const h = setup();
  h.render();
  let tree = await h.settle();
  for (const value of ['KONTAK@EXAMPLE', '812 3456']) {
    input(tree, 'label-custom-artist-search').props.onChange({ target: { value } });
    tree = h.render();
    assert.match(text(tree), /Artis Satu/);
  }
  input(tree, 'label-custom-artist-search').props.onChange({ target: { value: 'no-match' } });
  assert.match(text(h.render()), /Tidak ada artis yang cocok/);
});

test('archive requires confirmation, cancel does nothing, and pending blocks repeat mutation', async () => {
  const pending = deferred();
  const h = setup({ archiveLabelCustomArtist: async () => { await pending.promise; return { ...artist, status: 'archived' }; } });
  h.render();
  let tree = await h.settle();
  button(tree, 'Arsipkan Artis Satu').props.onClick();
  tree = h.render();
  assert.equal(one(tree, 'AlertDialog').props.open, true);
  assert.equal(callsFor(h, 'archiveLabelCustomArtist').length, 0);
  one(tree, 'AlertDialog').props.onOpenChange(false);
  assert.equal(one(h.render(), 'AlertDialog').props.open, false);
  button(h.render(), 'Arsipkan Artis Satu').props.onClick();
  const action = one(h.render(), 'AlertDialogAction');
  const click = event();
  action.props.onClick(click);
  action.props.onClick(event());
  assert.equal(click.prevented, true, 'confirmation must remain open while request runs');
  assert.equal(callsFor(h, 'archiveLabelCustomArtist').length, 1);
  assert.deepEqual(callsFor(h, 'archiveLabelCustomArtist')[0].args, [artist.id]);
  tree = h.render();
  assert.equal(one(tree, 'AlertDialogAction').props.disabled, true);
  assert.equal(one(tree, 'AlertDialogCancel').props.disabled, true);
  one(tree, 'AlertDialog').props.onOpenChange(false);
  assert.equal(one(h.render(), 'AlertDialog').props.open, true);
  pending.resolve();
  tree = await h.settle();
  assert.equal(one(tree, 'AlertDialog').props.open, false);
  assert.equal(button(tree, 'Edit Artis Satu').props.disabled, true);
  assert.match(text(tree), /berhasil diarsipkan/);
});

test('archive failure keeps confirmation and target available for retry', async () => {
  let fail = true;
  const h = setup({ archiveLabelCustomArtist: async () => {
    if (fail) throw new Error('offline');
    return { ...artist, status: 'archived' };
  } });
  h.render();
  let tree = await h.settle();
  button(tree, 'Arsipkan Artis Satu').props.onClick();
  one(h.render(), 'AlertDialogAction').props.onClick(event());
  tree = await h.settle();
  assert.equal(one(tree, 'AlertDialog').props.open, true);
  assert.match(text(tree), /belum dapat diarsipkan/);
  assert.equal(one(tree, 'AlertDialogAction').props.disabled, false);
  fail = false;
  one(tree, 'AlertDialogAction').props.onClick(event());
  assert.equal(one(await h.settle(), 'AlertDialog').props.open, false);
  assert.equal(callsFor(h, 'archiveLabelCustomArtist').length, 2);
});

test('archived unit disables all artist mutations', async () => {
  const h = setup({ getLabelCustomUnit: async () => ({ ...unit, status: 'archived' }) });
  h.render();
  const tree = await h.settle();
  for (const label of ['Tambah Artist', 'Edit Artis Satu', 'Arsipkan Artis Satu']) {
    assert.equal(button(tree, label).props.disabled, true, label);
  }
  assert.match(text(tree), /Unit diarsipkan/);
});

test('late private responses after unmount do not set state or load artists', async () => {
  const pending = deferred();
  const h = setup({ getLabelCustomUnit: () => pending.promise });
  h.render();
  h.unmount();
  pending.resolve(unit);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.lateUpdates, 0);
  assert.equal(callsFor(h, 'listLabelCustomArtists').length, 0);
});
