import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Principal } from '../src/auth/index.js';
import { createUsersService } from '../src/users/index.js';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

test('Whitelabel creates artist without login then enables one owned credential after subscription',
  { skip: !dockerTestsEnabled, timeout: 120_000 }, async () => {
    const database = await concurrencyPostgres();
    const labelId = randomUUID();
    const otherLabelId = randomUUID();
    const actor: Principal = { id: labelId, roles: ['whitelabel'], status: 'active' };
    const other: Principal = { id: otherLabelId, roles: ['whitelabel'], status: 'active' };
    try {
      for (const [id,name] of [[labelId,'Synthetic Whitelabel'],[otherLabelId,'Other Whitelabel']] as const) {
        await database.owner.query("INSERT INTO soundpub.backend_users(id,status) VALUES ($1,'active')", [id]);
        await database.owner.query("INSERT INTO soundpub.profiles(id,full_name,subscription_status) VALUES ($1,$2,'active')", [id,name]);
        await database.owner.query("INSERT INTO soundpub.user_roles(user_id,role,verified_at) VALUES ($1,'whitelabel',now())", [id]);
      }
      const service = createUsersService(database.runtime);
      const artist = await service.createWhitelabelArtist(actor, {
        email: 'managed.artist@example.test', fullName: 'Managed Artist', phone: '+6200000000',
      }, 'create-managed');
      assert.equal(artist.parent_label_id, labelId);
      assert.equal(artist.password_set, false);
      assert.deepEqual(artist.roles, ['artist']);
      assert.equal((await database.owner.query('SELECT count(*)::int AS count FROM soundpub.local_auth_credentials WHERE user_id=$1', [artist.id])).rows[0].count, 0);
      await assert.rejects(database.owner.query(`INSERT INTO soundpub.backend_users(id,email,status)
        VALUES ($1,'MANAGED.ARTIST@example.test','active')`, [randomUUID()]), /backend_users_email_unique/);
      assert.deepEqual(await service.whitelabelDashboard(actor), {
        label_id: labelId, subscription_status: 'active', currency: 'IDR', total_artists: 1,
        total_releases: 0, total_revenue: '0.00', artists_with_access: 0, artists_without_access: 1,
      });
      await assert.rejects(service.setWhitelabelArtistPassword(other, artist.id,
        { newPassword: 'valid-password-123' }, 'foreign'), { code: 'NOT_FOUND' });
      assert.deepEqual(await service.setWhitelabelArtistPassword(actor, artist.id,
        { newPassword: 'valid-password-123' }, 'enable-login'), { status: 'ok' });
      const credential = (await database.owner.query('SELECT login_email,password_hash FROM soundpub.local_auth_credentials WHERE user_id=$1', [artist.id])).rows[0];
      assert.equal(credential.login_email, 'managed.artist@example.test');
      assert.match(credential.password_hash, /^scrypt\$v=1\$/);
      assert.equal((await database.owner.query('SELECT password_set FROM soundpub.profiles WHERE id=$1', [artist.id])).rows[0].password_set, true);
      assert.equal((await service.whitelabelDashboard(actor)).artists_with_access, 1);
      await assert.rejects(service.setWhitelabelArtistPassword(actor, artist.id,
        { newPassword: 'another-password-123' }, 'repeat'), { code: 'CONFLICT' });
      const second = await service.createWhitelabelArtist(actor, {
        email: 'locked.artist@example.test', fullName: 'Locked Artist', phone: null,
      }, 'create-locked');
      await database.owner.query("UPDATE soundpub.profiles SET subscription_status='inactive' WHERE id=$1", [labelId]);
      await assert.rejects(service.setWhitelabelArtistPassword(actor, second.id,
        { newPassword: 'valid-password-456' }, 'subscription'), { code: 'WHITELABEL_SUBSCRIPTION_REQUIRED' });
      assert.equal((await database.owner.query(`SELECT count(*)::int AS count FROM soundpub.audit_logs
        WHERE actor_user_id=$1 AND action IN ('whitelabel.artist_created','whitelabel.artist_login_enabled')`, [labelId])).rows[0].count, 3);
    } finally { await database.close(); }
  });
