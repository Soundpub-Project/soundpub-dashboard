const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
function moduleAt(file, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: id => { assert(id in dependencies, id); return dependencies[id]; }, URL, URLSearchParams, setTimeout, clearTimeout, ...globals });
  return exports;
}
(async () => {
  const calls = [];
  const request = async (url, options) => { calls.push({ url, options }); return {}; };
  const settings = moduleAt('src/api/settings.ts', { './client': { apiRequest: request } }).settingsApi;
  await settings.public(); await settings.updateUser(4, { email_notif_release: false });
  assert.equal(calls[0].options.authenticated, false);
  assert.equal(calls[1].url, '/api/v1/settings/me');
  assert.equal(calls[1].options.body.version, 4);
  const notifications = moduleAt('src/api/notifications.ts', { './client': { apiRequest: request } }).notificationsApi;
  await notifications.read('a/b'); await notifications.readAll(); await notifications.announce({ title: 'Synthetic', body: 'Disposable' });
  assert.equal(calls[2].url, '/api/v1/notifications/a%2Fb/read');
  assert.equal(calls[3].url, '/api/v1/notifications/read-all');
  assert.equal(calls[4].url, '/api/v1/admin/announcements');
  const id = '11111111-1111-4111-8111-111111111111';
  let enabled = true, failPut = false, failComplete = false, intent;
  const sequence = [];
  const mediaApi = {
    request: async body => { intent = body; sequence.push('request'); return { object: { id }, url: 'http://127.0.0.1:9000/synthetic', method: 'PUT', headers: { 'Content-Type': 'image/png' } }; },
    complete: async () => { sequence.push('complete'); if (failComplete) throw Error('CONFLICT'); return { id, status: 'ACTIVE' }; },
    abort: async () => sequence.push('abort'),
  };
  const service = moduleAt('src/services/media.ts', { '@/api/media': { mediaApi }, '@/api/routing': { usesBackendDomain: () => enabled },
    '@/lib/fileChecksum': { sha256File: async input => { assert.equal(input.size, 3); sequence.push('hash'); return 'a'.repeat(64); } } }, {
    crypto: webcrypto, fetch: async (url, options) => { sequence.push('put'); assert.equal(options.credentials, 'omit'); assert.equal(options.headers.Authorization, undefined); assert.equal(options.redirect, 'error'); return { ok: !failPut }; }, AbortController,
  });
  const file = { name: 'synthetic.png', type: 'image/png', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  const binding = { category: 'USER_AVATAR', resource_type: 'user', resource_id: id };
  await service.uploadBackendMedia(file, binding);
  assert.deepEqual(sequence, ['hash', 'request', 'put', 'complete']);
  assert.equal(intent.checksum, 'a'.repeat(64)); assert.equal(intent.visibility, 'PRIVATE');
  assert.equal('owner_user_id' in intent, false);
  assert.equal(service.mediaIdFromReference(`/api/v1/storage/objects/${id}/download`), id);
  assert.equal(service.mediaIdFromReference('https://legacy.invalid/avatar.png'), null);
  assert.throws(() => service.capabilityUrl('javascript:alert(1)'));
  sequence.length = 0; failPut = true;
  await assert.rejects(service.uploadBackendMedia(file, binding));
  assert.deepEqual(sequence, ['hash', 'request', 'put', 'abort']);
  sequence.length = 0; failPut = false; failComplete = true;
  await assert.rejects(service.uploadBackendMedia(file, binding));
  assert.deepEqual(sequence, ['hash', 'request', 'put', 'complete']);
  sequence.length = 0; enabled = false;
  await assert.rejects(service.uploadBackendMedia(file, binding), /Backend storage mode required/);
  assert.deepEqual(sequence, []);
  enabled = true;
  let downloadCalls = 0;
  mediaApi.download = async () => { downloadCalls++; return { url: 'http://127.0.0.1/fresh-audio', expires_at: new Date(Date.now() + 60000).toISOString() }; };
  const refs = [];
  let refIndex = 0;
  const audioUi = moduleAt('src/components/settings/BackendMediaUpload.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    react: { useState: value => [value, () => {}], useRef: value => refs[refIndex++] ?? (refs[refIndex - 1] = { current: value }) },
    '@/api/media': { mediaApi }, '@/services/media': service,
    '@/hooks/useMediaUrl': { useMediaUrl: () => 'http://127.0.0.1/expired-audio' },
    '@/components/ui/button': { Button: 'button' }, '@/components/ui/input': { Input: 'input' },
  });
  const audioTree = audioUi.BackendMediaUpload({ binding: { category: 'TRACK_AUDIO' }, reference: `/api/v1/storage/objects/${id}/download`, label: 'Audio', onChange: async () => {} });
  const audioElement = audioTree.props.children[0];
  const audio = { currentTime: 12, isConnected: true, src: 'expired', pause() {}, async play() { assert.equal(this.src, 'http://127.0.0.1/fresh-audio'); } };
  await audioElement.props.onPlay({ currentTarget: audio });
  assert.equal(downloadCalls, 1, 'delayed play obtains fresh authenticated capability');
  assert.equal(audio.currentTime, 12);
  await audioElement.props.onPlay({ currentTarget: audio });
  assert.equal(downloadCalls, 1, 'recursive play event must not renew again');
  refs[2].current.expires = 0;
  await audioElement.props.onPlay({ currentTarget: audio });
  assert.equal(downloadCalls, 2, 'resume after capability expiry renews');
  mediaApi.download = async () => ({ url: 'http://127.0.0.1/expired', expires_at: new Date(0).toISOString() });
  await assert.rejects(service.resolveMediaDownload(`/api/v1/storage/objects/${id}/download`), /Expired media capability/);
  const publicSettings = { auth_notice_config: { enabled: true }, dashboard_logo_light: id, dashboard_logo_dark: id, favicon: id };
  const publicRows = moduleAt('src/services/settings.ts', {
    '@/api/settings': { settingsApi: { public: async () => ({ settings: publicSettings }) } },
    '@/api/routing': { usesBackendDomain: () => true },
    '@/integrations/supabase/client': { supabase: new Proxy({}, { get: () => assert.fail('Backend settings must never query Supabase') }) },
  });
  const rows = await publicRows.getPublicSettingsRows(['dashboard_logo_light', 'auth_notice_config', 'dashboard_logo_dark', 'favicon', 'dashboard_logo', '__proto__']);
  assert.equal(rows[0].value, '/api/v1/settings/public-media/dashboard_logo_light');
  assert.equal(JSON.parse(rows[1].value).enabled, true);
  assert.equal(rows[2].value, '/api/v1/settings/public-media/dashboard_logo_dark');
  assert.equal(rows[3].value, '/api/v1/settings/public-media/favicon');
  assert.equal(rows[4].value, null); assert.equal(rows[5].value, null);
  for (const invalid of [null, '', 'https://evil.invalid/logo.png', '//evil.invalid/logo.png', 'javascript:alert(1)', `${id}/../favicon`, {}, 123]) {
    assert.equal(publicRows.publicBrandingUrl('dashboard_logo_light', invalid), null);
  }
  for (const key of ['dashboard_logo', '__proto__', 'constructor', 'favicon/../private', 'favicon?url=https://evil.invalid']) {
    assert.equal(publicRows.publicBrandingUrl(key, id), null);
  }
  publicSettings.dashboard_logo_light = 'https://evil.invalid/logo.png';
  assert.equal((await publicRows.getPublicSettingsRows(['dashboard_logo_light']))[0].value, null);

  // Synthetic React tree exercises the real file-input handler without a DOM or network.
  const jsx = require('react/jsx-runtime');
  const baseRow = { version: 7, settings: { ...publicSettings, maintenance_enabled: true } };
  let stateIndex, states, uploadFailure, refreshFailure, activeStatus = 'ACTIVE';
  const brandingCalls = [];
  const ui = moduleAt('src/components/settings/BackendSettings.tsx', {
    'react/jsx-runtime': jsx,
    react: { useEffect: () => {}, useState: initial => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = index === 0 ? baseRow : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    } },
    '@/hooks/useAuth': { useAuth: () => ({ user: { id }, isAdmin: true }) },
    '@/api/settings': { settingsApi: { admin: async () => {
      brandingCalls.push({ step: 'refresh' });
      if (refreshFailure) throw Error('Refresh failed');
      return { version: 8, settings: { ...baseRow.settings, dashboard_logo_light: id, dashboard_logo_dark: id, favicon: id } };
    }, updateAdmin: async (version, patch) => {
      brandingCalls.push({ step: 'patch', version, patch });
      return { version: version + 1, settings: { ...baseRow.settings, ...patch } };
    } } },
    '@/api/client': { SoundpubApiError: class SoundpubApiError extends Error {} },
    '@/api/media': { mediaApi: { remove: async mediaId => { brandingCalls.push({ step: 'remove', mediaId }); } } },
    '@/services/media': { uploadBackendMedia: async (chosen, binding) => {
      brandingCalls.push({ step: 'upload', file: chosen, binding });
      if (uploadFailure) throw Error('Upload failed');
      return { id, status: activeStatus };
    } },
    '@/services/settings': publicRows,
    '@/components/ui/alert': { Alert: 'alert', AlertDescription: 'alert-description', AlertTitle: 'alert-title' },
    '@/components/ui/badge': { Badge: 'badge' },
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/card': { Card: 'card', CardContent: 'card-content', CardDescription: 'card-description', CardFooter: 'card-footer', CardHeader: 'card-header', CardTitle: 'card-title' },
    '@/components/ui/input': { Input: 'input' },
    '@/components/ui/label': { Label: 'label' },
    '@/components/ui/switch': { Switch: 'switch' },
    '@/components/ui/textarea': { Textarea: 'textarea' },
    'lucide-react': new Proxy({}, { get: () => 'icon' }),
  });
  assert.equal(ui.displayMoneyValue('100000.00'), '100000');
  assert.equal(ui.displayMoneyValue(null), '');
  assert.equal(ui.normalizeMoneyValue('100000'), '100000.00');
  assert.equal(ui.normalizeMoneyValue('100000.00'), '100000.00');
  assert.equal(ui.normalizeMoneyValue('Rp 100.000'), undefined);

  function descendants(node) {
    if (!node || typeof node !== 'object') return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap(descendants)];
  }
  async function chooseBranding(index) {
    stateIndex = 0; states = []; brandingCalls.length = 0;
    const wrapper = ui.BackendAdminSettings();
    const tree = wrapper.type(wrapper.props);
    const inputs = descendants(tree).filter(node => node.type === 'input' && node.props.type === 'file');
    assert.equal(inputs.length, 3);
    states[0] = { ...states[0], settings: { ...states[0].settings, maintenance_enabled: false } };
    assert(descendants(tree).filter(node => node.type === 'label').some(node => descendants(node).includes(inputs[index])));
    inputs[index].props.onChange({ target: { files: [file], value: 'synthetic.png' } });
    await new Promise(resolve => setImmediate(resolve));
  }
  for (const [index, key, variant] of [[0, 'dashboard_logo_light', 'light'], [1, 'dashboard_logo_dark', 'dark'], [2, 'favicon', 'default']]) {
    await chooseBranding(index);
    assert.deepEqual(brandingCalls.map(call => call.step), ['upload', 'refresh']);
    assert.equal(brandingCalls[0].binding.category, 'OTHER');
    assert.equal(brandingCalls[0].binding.resource_type, 'settings');
    assert.equal(brandingCalls[0].binding.resource_id, '00000000-0000-4000-8000-0000000003d0');
    assert.equal(brandingCalls[0].binding.variant, variant);
    assert.equal(states[0].version, 8);
    assert.equal(states[0].settings.maintenance_enabled, false, 'unsaved settings survive media refresh');
  }
  stateIndex = 0; states = []; brandingCalls.length = 0;
  const removeWrapper = ui.BackendAdminSettings();
  const removeTree = removeWrapper.type(removeWrapper.props);
  states[0] = { ...states[0], settings: { ...states[0].settings, maintenance_enabled: false } };
  const removeButtons = descendants(removeTree).filter(node => node.type === 'button' && node.props.variant === 'destructive');
  assert.equal(removeButtons.length, 3);
  removeButtons[1].props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(brandingCalls.map(call => call.step), ['remove', 'refresh']);
  assert.equal(brandingCalls[0].mediaId, id);
  assert.equal(states[0].version, 8);
  assert.equal(states[0].settings.maintenance_enabled, false, 'unsaved settings survive media removal refresh');

  uploadFailure = true;
  await chooseBranding(0);
  assert.deepEqual(brandingCalls.map(call => call.step), ['upload']);
  assert(states[1]); assert.equal(states[3], false);
  uploadFailure = false; activeStatus = 'PENDING';
  await chooseBranding(0);
  assert.deepEqual(brandingCalls.map(call => call.step), ['upload']);
  activeStatus = 'ACTIVE'; refreshFailure = true;
  await chooseBranding(0);
  assert.equal(states[0].version, 7); assert(states[1]); assert.equal(states[3], false);
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  for (const file of ['src/api/media.ts', 'src/api/notifications.ts', 'src/api/settings.ts', 'src/api/audit.ts', 'src/services/media.ts', 'src/hooks/useBackendNotifications.ts', 'src/hooks/useMediaUrl.ts', 'src/components/notifications/BackendNotificationInbox.tsx', 'src/components/settings/BackendSettings.tsx', 'src/components/settings/BackendAuditLogs.tsx', 'src/components/settings/BackendMediaUpload.tsx', 'src/components/releases/BackendReleaseForm.tsx']) {
    assert(!/supabase|postgrest|gcs-upload|gcs-manage/i.test(read(file)), file);
  }
  for (const [file, component, domain] of [
    ['src/components/notifications/NotificationBell.tsx', 'NotificationBell', 'notifications'],
    ['src/components/notifications/NotificationCenter.tsx', 'NotificationCenter', 'notifications'],
    ...['EmailNotificationSettings', 'SuperAdminSettings', 'StorageSettings', 'IccnIntegrationSettings', 'PricingSettings', 'PayoutSettings', 'AuthNoticeSettings'].map(component => [`src/components/settings/${component}.tsx`, component, 'settings']),
    ['src/pages/AuditLogs.tsx', 'AuditLogs', 'audit'],
  ]) {
    const wrapper = read(file).slice(read(file).indexOf(`function ${component}(`));
    assert(wrapper.indexOf(`usesBackendDomain('${domain}')`) < wrapper.indexOf(`<Legacy${component}`), file);
    assert(wrapper.indexOf(`<Legacy${component}`) >= 0, file);
  }
  assert(read('src/pages/MediaLibrary.tsx').includes("usesBackendDomain('storage') || usesBackendReleases()"));
  assert(/if \(usesBackendDomain\('notifications'\)\) \{\s+await notificationsApi\.announce/.test(read('src/components/notifications/AnnouncementDialog.tsx')));
  assert(read('src/hooks/useExportCsv.ts').includes('downloadBackendExport(table.id)'));
  assert(!read('src/api/exports.ts').includes('supabase'));
  assert(!read('src/hooks/useExportCsv.ts').includes('supabase'));
  assert(read('src/components/layout/DashboardLayout.tsx').includes("if (usesBackendDomain('users')) return;"));
  assert(read('src/App.tsx').includes("getPublicSettingsRows(['favicon'])"));
  assert(read('src/api/audit.ts').includes('detail:'));
  assert(read('src/components/settings/BackendAuditLogs.tsx').includes('Detail audit'));
  assert(read('src/pages/Settings.tsx').includes('if (backendUsers) return;'));
  assert(read('src/pages/Settings.tsx').includes('if (backendStorage) return;'));
  const settingsPage = read('src/pages/Settings.tsx');
  assert(settingsPage.includes("const backendSettings = usesBackendDomain('settings')"));
  assert(settingsPage.includes('backendSettings ? <BackendAdminSettings />'));
  assert(settingsPage.includes('backendSettings ? <BackendUserSettings />'));
  assert(settingsPage.includes('Konfigurasi legacy Supabase dinonaktifkan.'));
  assert(settingsPage.includes('Buka pengelolaan Users'));
  assert(settingsPage.includes('setFormData({'));
  const myArtistsPage = read('src/pages/MyArtists.tsx');
  assert(myArtistsPage.includes('backendArtists || !isLabel'));
  assert(myArtistsPage.includes('defaultParentLabelId={backendArtists ? profile?.id || user?.id : undefined}'));
  const mediaControls = read('src/components/releases/BackendReleaseForm.tsx').split('\n').filter(line => line.includes('<BackendMediaUpload'));
    assert.equal(mediaControls.length, 3);
  for (const control of mediaControls) assert(/disabled=\{[^}]*\bbusy\b[^}]*\bdirty\b/.test(control), 'media controls require saved, idle aggregate');
  console.log('Backend-mode static scan: isolated API components clean; legacy mount guards, settings export, media scan and announcement guards passed');
  console.log('Phase 3D frontend contracts/lifecycle checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
