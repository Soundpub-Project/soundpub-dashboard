import assert from 'node:assert/strict';
import test from 'node:test';
import { concurrencyPostgres, dockerTestsEnabled } from './support/concurrency-postgres.js';

const integration=dockerTestsEnabled ? test : test.skip;
integration('copyright payment checkpoint migrates with runtime append-only grants',async()=>{
  const fixture=await concurrencyPostgres();
  try {
    const tables=await fixture.runtime.query(`SELECT to_regclass('soundpub.copyright_registration_mock_invoices') IS NOT NULL mock,
      to_regclass('soundpub.copyright_registration_payment_callback_receipts') IS NOT NULL receipts`);
    assert.deepEqual(tables.rows[0],{mock:true,receipts:true});
    const grants=await fixture.runtime.query(`SELECT
      has_table_privilege(current_user,'soundpub.copyright_registration_mock_invoices','SELECT') can_select,
      has_table_privilege(current_user,'soundpub.copyright_registration_mock_invoices','INSERT') can_insert,
      has_table_privilege(current_user,'soundpub.copyright_registration_mock_invoices','UPDATE') can_update,
      has_table_privilege(current_user,'soundpub.copyright_registration_payment_callback_receipts','DELETE') can_delete`);
    assert.deepEqual(grants.rows[0],{can_select:true,can_insert:true,can_update:false,can_delete:false});
    const triggers=await fixture.owner.query(`SELECT count(*)::int count FROM pg_trigger
      WHERE tgrelid IN ('soundpub.copyright_registration_mock_invoices'::regclass,
        'soundpub.copyright_registration_payment_callback_receipts'::regclass) AND NOT tgisinternal`);
    assert.equal(triggers.rows[0].count,2);
  } finally { await fixture.close(); }
});
