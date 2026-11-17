import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { hashPassword } from '../src/auth/local-crypto.js';
import { createUsersService } from '../src/users/index.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

test('managed royalty artist owns profile without any login or privileged role',
  { skip: !dockerTestsEnabled, timeout: 120_000 }, async () => {
    const database = await concurrencyPostgres();
    const adminId = randomUUID();
    const labelId = randomUUID();
    const artistUserId = randomUUID();
    const actor: Principal = { id: adminId, roles: ['admin'], status: 'active' };
    try {
      await database.owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active'),($2,'active')`,
        [adminId,labelId]);
      await database.owner.query(`INSERT INTO soundpub.profiles(id,full_name) VALUES
        ($1,'Synthetic Admin'),($2,'Synthetic Label')`, [adminId,labelId]);
      await database.owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES
        ($1,'admin',now()),($1,'superadmin',now()),($2,'label',now())`, [adminId,labelId]);
      await database.runtime.query(`INSERT INTO soundpub.backend_users(id,status,account_kind)
        VALUES ($1,'active','MANAGED_ARTIST')`, [artistUserId]);
      await database.owner.query(`INSERT INTO soundpub.profiles(id,full_name,parent_label_id,password_set)
        VALUES ($1,'Synthetic Royalty Artist',$2,false)`, [artistUserId,labelId]);
      await database.owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at)
        VALUES ($1,'artist',now())`, [artistUserId]);
      await database.owner.query(`INSERT INTO soundpub.artist_profiles(user_id,artist_name)
        VALUES ($1,'Synthetic Royalty Artist')`, [artistUserId]);
      await database.owner.query(`INSERT INTO soundpub.artists(label_id,artist_user_id,name,verified_at)
        VALUES ($1,$2,'Synthetic Royalty Artist',now())`, [labelId,artistUserId]);
      const user = await createUsersService(database.runtime).profile({ id: artistUserId, roles: ['artist'], status: 'active' });
      assert.equal(user.profile.account_kind, 'MANAGED_ARTIST');
      assert.equal(user.profile.email, null);
      assert.equal(user.profile.password_set, false);
      assert.deepEqual(user.roles, ['artist']);
      const passwordHash = await hashPassword('synthetic-test-password-123');
      await assert.rejects(database.runtime.query(`INSERT INTO soundpub.local_auth_credentials(user_id,login_email,password_hash)
        VALUES ($1,'managed@example.test',$2)`, [artistUserId,passwordHash]), /MANAGED_ARTIST_LOGIN_DISABLED/);
      await assert.rejects(database.runtime.query(`INSERT INTO soundpub.auth_sessions
        (user_id,token_sha256,csrf_sha256,idle_expires_at,expires_at)
        VALUES ($1,$2,$3,now()+interval '1 hour',now()+interval '1 day')`,
      [artistUserId,Buffer.alloc(32,1),Buffer.alloc(32,2)]), /MANAGED_ARTIST_LOGIN_DISABLED/);
      await assert.rejects(database.runtime.query(`INSERT INTO soundpub.external_identities
        (application_user_id,provider,issuer,subject) VALUES ($1,'partner','test','managed')`, [artistUserId]),
      /MANAGED_ARTIST_LOGIN_DISABLED/);
      await assert.rejects(database.runtime.query(`INSERT INTO soundpub.auth_one_time_tokens
        (user_id,purpose,token_sha256,expires_at) VALUES($1,'password_reset',$2,now()+interval '1 hour')`,
      [artistUserId,Buffer.alloc(32,3)]), /MANAGED_ARTIST_LOGIN_DISABLED/);
      await assert.rejects(database.owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at)
        VALUES ($1,'admin',now())`, [artistUserId]), /MANAGED_ARTIST_ROLE_REQUIRED/);
      await assert.rejects(database.owner.query("DELETE FROM soundpub.user_roles WHERE user_id=$1 AND role='artist'",
        [artistUserId]), /MANAGED_ARTIST_ROLE_REQUIRED/);
      const service = createUsersService(database.runtime, { partnerIdentity: { labelId, issuer: 'synthetic-issuer' } });
      const superadmin = { ...actor, roles: ['superadmin'] as const };
      await assert.rejects(service.setRoles(actor,artistUserId,{ roles: ['artist','user'] },'managed-role'),
        { code: 'MANAGED_ARTIST_IDENTITY_LOCKED' });
      await assert.rejects(service.setRoles(actor,artistUserId,{ roles: ['artist'] },'managed-role-noop'),
        { code: 'MANAGED_ARTIST_IDENTITY_LOCKED' });
      assert.equal((await service.partnerIdentity(superadmin,artistUserId)).eligible, false);
      await assert.rejects(service.bindPartnerIdentity(superadmin,artistUserId,
        { subject: 'synthetic-managed-subject' },'managed-partner'), { code: 'CONFLICT' });
      await assert.rejects(service.resetPassword(actor,artistUserId,
        { newPassword: 'synthetic-admin-reset-123' },'admin-reset'), { code: 'MANAGED_ARTIST_LOGIN_DISABLED' });
      assert.equal((await database.owner.query('SELECT count(*)::int AS count FROM soundpub.local_auth_credentials WHERE user_id=$1',
        [artistUserId])).rows[0]?.count, 0);
    } finally { await database.close(); }
  });

test('existing credential or privileged role blocks managed-artist designation',
  { skip: !dockerTestsEnabled, timeout: 120_000 }, async () => {
    const database = await concurrencyPostgres();
    const standardId = randomUUID();
    const adminId = randomUUID();
    try {
      await database.owner.query(`INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active'),($2,'active')`,
        [standardId,adminId]);
      await database.owner.query(`INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'admin',now())`,
        [adminId]);
      await database.owner.query(`INSERT INTO soundpub.local_auth_credentials(user_id,login_email,password_hash)
        VALUES ($1,'standard@example.test',$2)`, [standardId,await hashPassword('synthetic-standard-123')]);
      await assert.rejects(database.owner.query(`UPDATE soundpub.backend_users SET account_kind='MANAGED_ARTIST' WHERE id=$1`,
        [standardId]), /MANAGED_ARTIST_IDENTITY_CONFLICT/);
      await assert.rejects(database.owner.query(`UPDATE soundpub.backend_users SET account_kind='MANAGED_ARTIST' WHERE id=$1`,
        [adminId]), /MANAGED_ARTIST_IDENTITY_CONFLICT/);
      const managedId = randomUUID();
      await database.owner.query(`INSERT INTO soundpub.backend_users(id,status,account_kind)
        VALUES($1,'active','MANAGED_ARTIST')`, [managedId]);
      await assert.rejects(database.runtime.query(`UPDATE soundpub.backend_users SET account_kind='STANDARD' WHERE id=$1`,
        [managedId]), /MANAGED_ARTIST_CLAIM_REQUIRED/);
      const tokenUserId = randomUUID();
      await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES($1,'active')", [tokenUserId]);
      await database.owner.query(`INSERT INTO soundpub.auth_one_time_tokens
        (user_id,purpose,token_sha256,expires_at) VALUES($1,'password_reset',$2,now()+interval '1 hour')`,
      [tokenUserId,Buffer.alloc(32,4)]);
      await assert.rejects(database.owner.query(`UPDATE soundpub.backend_users SET account_kind='MANAGED_ARTIST' WHERE id=$1`,
        [tokenUserId]), /MANAGED_ARTIST_IDENTITY_CONFLICT/);
      assert.equal((await database.owner.query('SELECT account_kind FROM soundpub.backend_users WHERE id=$1',
        [standardId])).rows[0]?.account_kind, 'STANDARD');
    } finally { await database.close(); }
  });
