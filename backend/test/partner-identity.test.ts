import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/api/index.js';
import type { Principal } from '../src/api/types.js';
import { createLocalAuthService } from '../src/local-auth/index.js';
import { createUsersService } from '../src/users/index.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const integration = dockerTestsEnabled ? test : test.skip;
const superadminId = '00000000-0000-4000-8000-000000000701';
const adminId = '00000000-0000-4000-8000-000000000702';
const labelId = '00000000-0000-4000-8000-000000000703';
const artistId = '00000000-0000-4000-8000-000000000704';
const secondArtistId = '00000000-0000-4000-8000-000000000705';
const foreignLabelId = '00000000-0000-4000-8000-000000000706';
const foreignArtistId = '00000000-0000-4000-8000-000000000707';
const issuer = 'https://sso.example.test/realms/partner';

integration('admin ICCN binding is explicit, roster-scoped, unique, audited and reversible', async () => {
  const database = await concurrencyPostgres();
  const { owner, runtime } = database;
  try {
    for (const [id, email] of [
      [superadminId, 'superadmin@example.test'], [adminId, 'admin@example.test'], [labelId, 'label@example.test'],
      [artistId, 'artist@example.test'], [secondArtistId, 'artist-two@example.test'],
      [foreignLabelId, 'foreign-label@example.test'], [foreignArtistId, 'foreign-artist@example.test'],
    ]) await owner.query("INSERT INTO soundpub.backend_users(id,email,status) VALUES ($1,$2,'active')", [id, email]);
    await owner.query(`INSERT INTO soundpub.profiles(id,full_name,parent_label_id,sso_provider) VALUES
      ($1,'Partner Label',NULL,NULL),($2,'Partner Artist',$1,NULL),($3,'Second Artist',$1,NULL),
      ($4,'Foreign Label',NULL,NULL),($5,'Foreign Artist',$4,'iccn')`,
    [labelId, artistId, secondArtistId, foreignLabelId, foreignArtistId]);
    await owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
      ($1,'superadmin',now()),($2,'admin',now()),($3,'label',now()),($4,'artist',now()),
      ($5,'artist',now()),($6,'label',now()),($7,'artist',now())`,
    [superadminId, adminId, labelId, artistId, secondArtistId, foreignLabelId, foreignArtistId]);
    for (const [id, name] of [[artistId, 'Partner Artist'], [secondArtistId, 'Second Artist'], [foreignArtistId, 'Foreign Artist']]) {
      await owner.query('INSERT INTO soundpub.artist_profiles(user_id,artist_name) VALUES ($1,$2)', [id, name]);
    }
    await owner.query(`INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at) VALUES
      ($1,$2,'Partner Artist',now()),($1,$3,'Second Artist',now()),($4,$5,'Foreign Artist',now())`,
    [labelId, artistId, secondArtistId, foreignLabelId, foreignArtistId]);

    const users = createUsersService(runtime, { partnerIdentity: { labelId, issuer } });
    const admin: Principal = { id: adminId, roles: ['admin'], status: 'active' };
    const superadmin: Principal = { id: superadminId, roles: ['superadmin'], status: 'active' };
    const artist: Principal = { id: artistId, roles: ['artist'], status: 'active' };
    const subject = 'keycloak-subject-701';

    assert.deepEqual(await users.partnerIdentity(admin, artistId), { eligible: true, issuer, binding: null });
    await assert.rejects(users.bindPartnerIdentity(artist, artistId, { subject }, 'non-admin'),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 403);
    await assert.rejects(users.bindPartnerIdentity(superadmin, foreignArtistId, { subject }, 'foreign-label'),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 409);

    await assert.rejects(users.bindPartnerIdentity(admin, artistId, { subject }, 'admin-bind-denied'),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 403);
    const bound = await users.bindPartnerIdentity(superadmin, artistId, { subject }, 'bind-1');
    assert.equal(bound.binding?.subject, subject);
    assert.equal(bound.binding?.issuer, issuer);
    assert.equal((await users.bindPartnerIdentity(superadmin, artistId, { subject }, 'bind-idempotent')).binding?.subject, subject);
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM soundpub.external_identities WHERE application_user_id=$1',
      [artistId])).rows[0].count, 1);
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM soundpub.local_auth_credentials WHERE user_id=$1',
      [artistId])).rows[0].count, 0);
    assert.equal((await owner.query('SELECT sso_provider FROM soundpub.profiles WHERE id=$1', [artistId])).rows[0].sso_provider, 'iccn');
    const localAuth = createLocalAuthService(runtime, { deliverySecret: 'synthetic-partner-delivery-secret-32-chars' });
    const partnerSession = await localAuth.loginPartner({ issuer, subject }, labelId, 'partner-login');
    assert.equal((await localAuth.authenticate(partnerSession.token))?.id, artistId);
    await assert.rejects(users.bindPartnerIdentity(superadmin, secondArtistId, { subject }, 'duplicate-subject'),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 409);
    await assert.rejects(users.unbindPartnerIdentity(superadmin, artistId, { subject: 'stale-subject' }, 'stale-unbind'),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 409);
    assert.deepEqual(await users.unbindPartnerIdentity(superadmin, artistId, { subject }, 'unbind-1'), { deleted: true });
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM soundpub.external_identities WHERE application_user_id=$1',
      [artistId])).rows[0].count, 0);
    assert.equal((await owner.query('SELECT sso_provider FROM soundpub.profiles WHERE id=$1', [artistId])).rows[0].sso_provider, null);
    assert.equal(await localAuth.authenticate(partnerSession.token), null);
    await assert.rejects(localAuth.loginPartner({ issuer, subject }, labelId, 'partner-login-after-unbind'),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 401);
    assert.deepEqual((await owner.query(`SELECT action FROM soundpub.audit_logs WHERE resource_id=$1
      AND action LIKE 'auth.iccn_identity_%' ORDER BY created_at`, [artistId])).rows.map(row => row.action),
    ['auth.iccn_identity_bound', 'auth.iccn_identity_binding_confirmed', 'auth.iccn_identity_unbound']);

    let actor = admin;
    const app = buildApp({ users, auth: { authenticate: async () => actor }, readiness: { check: async () => true },
      rateLimiter: { consume: async () => ({ allowed: true }) }, admin: { suspendUser: async () => {} },
      webhooks: { receive: async () => false } });
    try {
      const get = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${artistId}/iccn-identity`,
        headers: { authorization: 'Bearer synthetic' } });
      assert.equal(get.statusCode, 200, get.body);
      assert.deepEqual(get.json(), { eligible: true, issuer, binding: null });
      const invalid = await app.inject({ method: 'PUT', url: `/api/v1/admin/users/${artistId}/iccn-identity`,
        headers: { authorization: 'Bearer synthetic' }, payload: { subject: '', issuer } });
      assert.equal(invalid.statusCode, 400);
      actor = artist;
      assert.equal((await app.inject({ method: 'GET', url: `/api/v1/admin/users/${artistId}/iccn-identity`,
        headers: { authorization: 'Bearer synthetic' } })).statusCode, 403);
      const operation = (await app.inject({ method: 'GET', url: '/openapi.json' })).json()
        .paths['/api/v1/admin/users/{id}/iccn-identity'];
      assert.equal(operation.get.operationId, 'getIccnIdentity');
      assert.equal(operation.put.operationId, 'bindIccnIdentity');
      assert.equal(operation.delete.operationId, 'unbindIccnIdentity');
    } finally { await app.close(); }

    const legacySubject = 'legacy-keycloak-subject-701';
    await owner.query(`INSERT INTO soundpub.external_identities
      (application_user_id,provider,issuer,subject,verified_at,binding_provenance)
      VALUES ($1,'iccn',$2,$3,NULL,'{"method":"legacy"}'::jsonb)`, [artistId, issuer, legacySubject]);
    await owner.query("UPDATE soundpub.profiles SET sso_provider='iccn' WHERE id=$1", [artistId]);
    const legacy = await users.partnerIdentity(admin, artistId);
    assert.equal(legacy.binding?.verifiedAt, null);
    const reverified = await users.bindPartnerIdentity(superadmin, artistId, { subject: legacySubject }, 'reverify-legacy');
    assert.ok(reverified.binding?.verifiedAt);
    const legacySession = await localAuth.loginPartner({ issuer, subject: legacySubject }, labelId, 'legacy-partner-login');
    assert.equal((await localAuth.authenticate(legacySession.token))?.id, artistId);
    await users.unbindPartnerIdentity(superadmin, artistId, { subject: legacySubject }, 'unbind-legacy');

    const oldIssuer = 'https://sso.example.test/realms/legacy-partner';
    const oldIssuerSubject = 'old-issuer-keycloak-subject-701';
    await owner.query(`INSERT INTO soundpub.external_identities
      (application_user_id,provider,issuer,subject,verified_at,binding_provenance)
      VALUES ($1,'iccn',$2,$3,now(),'{"method":"legacy"}'::jsonb)`, [artistId, oldIssuer, oldIssuerSubject]);
    const oldBinding = await users.partnerIdentity(superadmin, artistId);
    assert.equal(oldBinding.issuer, issuer);
    assert.equal(oldBinding.binding?.issuer, oldIssuer);
    await users.unbindPartnerIdentity(superadmin, artistId, { subject: oldIssuerSubject }, 'unbind-old-issuer');

    await owner.query('UPDATE soundpub.user_roles SET verified_at=NULL WHERE user_id=$1 AND role=$2', [secondArtistId, 'artist']);
    await assert.rejects(users.bindPartnerIdentity(superadmin, secondArtistId, { subject: 'unverified-role-subject' },
      'bind-unverified-role'), (error: unknown) => (error as { statusCode?: number }).statusCode === 409);
    await owner.query('UPDATE soundpub.user_roles SET verified_at=now() WHERE user_id=$1 AND role=$2', [secondArtistId, 'artist']);

    const concurrentSubject = 'concurrent-keycloak-subject-701';
    const attempts = await Promise.allSettled([
      users.bindPartnerIdentity(superadmin, artistId, { subject: concurrentSubject }, 'bind-concurrent-artist'),
      users.bindPartnerIdentity(superadmin, secondArtistId, { subject: concurrentSubject }, 'bind-concurrent-second'),
    ]);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = attempts.find(result => result.status === 'rejected');
    assert.equal((rejected as PromiseRejectedResult).reason.statusCode, 409);
    assert.equal((await owner.query(`SELECT count(*)::int AS count FROM soundpub.external_identities
      WHERE provider='iccn' AND issuer=$1 AND subject=$2`, [issuer, concurrentSubject])).rows[0].count, 1);
  } finally { await database.close(); }
});
