import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

test('runtime app has no broad sequence grants and can insert identity-backed media', {
  skip: !dockerTestsEnabled, timeout: 120_000,
}, async () => {
  const database = await concurrencyPostgres();
  const sequenceName = 'soundpub.media_objects_request_order_seq';
  try {
    const defaults = await database.owner.query<{ grants: number }>(`SELECT count(*)::int AS grants
      FROM pg_default_acl defaults
      CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
      WHERE defaults.defaclrole=current_user::regrole::oid AND defaults.defaclobjtype='S'
        AND acl.grantee='soundpub_app'::regrole::oid
        AND acl.privilege_type IN ('USAGE','SELECT')`);
    assert.equal(defaults.rows[0]?.grants, 0);

    const privileges = await database.owner.query<{ usage: boolean; select: boolean }>(`SELECT
      has_sequence_privilege('soundpub_app',$1,'USAGE') AS usage,
      has_sequence_privilege('soundpub_app',$1,'SELECT') AS select`, [sequenceName]);
    assert.deepEqual(privileges.rows[0], { usage: false, select: false });

    const userId = randomUUID();
    await database.owner.query('INSERT INTO soundpub.backend_users(id,status) VALUES ($1,$2)', [userId, 'active']);
    const inserted = await database.runtime.query<{ request_order: string }>(`INSERT INTO soundpub.media_objects
      (id,bucket,object_key,owner_user_id,category,resource_type,resource_id,mime_type,size,checksum,expires_at,cleanup_after)
      VALUES ($1,'synthetic','sequence-privilege-test',$2,'USER_AVATAR','user',$2,'image/png',1,$3,
        now()+interval '1 hour',now()+interval '2 hours')
      RETURNING request_order`, [randomUUID(), userId, 'a'.repeat(64)]);
    assert.equal(inserted.rows[0]?.request_order, '1');
  } finally { await database.close(); }
});
