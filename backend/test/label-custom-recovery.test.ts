import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { digest, kinds, planRecovery } from '../src/recovery/index.js';
import { guardTarget, recover, writeRecoveryTransaction } from '../src/recovery/apply.js';

async function fixture(run: (directory: string, rows: Record<string, unknown[]>, save: () => Promise<void>) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'soundpub-recovery-'));
  const rows: Record<string, unknown[]> = {
    users: [{ id: 'pic', name: 'Synthetic PIC', email: 'pic@example.invalid' }],
    units: [{ id: 'unit', ownerId: 'pic', name: 'Synthetic Unit' }],
    artists: [{ id: 'artist', unitId: 'unit', name: 'Synthetic Artist', email: 'artist@example.invalid', phone: '000000' }],
    releases: [{ id: 'release', artistId: 'artist', title: 'Synthetic Release' }],
    tracks: [{ id: 'track', releaseId: 'release', title: 'Synthetic Track' }],
    royalties: [{ id: 'royalty', trackId: 'track', currency: 'IDR', amountMinor: '9007199254740993' }],
  };
  const save = async () => {
    const files = [];
    for (const kind of kinds) {
      const content = JSON.stringify(rows[kind]);
      await writeFile(path.join(directory, `${kind}.json`), content);
      files.push({ kind, file: `${kind}.json`, sha256: digest(content), rows: rows[kind]!.length });
    }
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version: 1, namespace: 'synthetic-v1', files }));
  };
  try { await save(); await run(directory, rows, save); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('dry-run deterministic canonical identities and exact PIC reconciliation', async () => fixture(async directory => {
  const first = await recover(directory);
  assert.deepEqual(first, await recover(directory));
  assert.equal(first.mode, 'dry-run');
  assert.equal(first.accepted.length, 6);
  assert.equal(first.reconciliation.royaltyMinorByCurrency.IDR, '9007199254740993');
  assert.equal(first.accepted[5]!.data.ownerId, first.accepted[0]!.canonicalId);
  assert.equal(first.accepted[5]!.data.artistId, first.accepted[2]!.canonicalId);
  assert.equal(first.accepted[2]!.data.artistUserId, 'NULL');
}));
test('credential and unknown fields rejected without leaking values; descendants orphaned', async () => fixture(async (directory, rows, save) => {
  rows.users = [{ ...(rows.users![0] as object), password_hash: 'DO_NOT_LEAK', sessions: [], refresh_token: 'DO_NOT_LEAK' }];
  await save(); const report = await planRecovery(directory);
  assert.equal(report.rejected.length, 1); assert.equal(report.orphan.length, 5);
  assert.ok(!JSON.stringify(report).includes('DO_NOT_LEAK'));
}));
test('ambiguous names/emails and duplicate IDs reject all competing identities', async () => fixture(async (directory, rows, save) => {
  rows.users!.push({ id: 'pic2', name: 'Other', email: 'PIC@example.invalid' });
  await save(); let report = await planRecovery(directory);
  assert.equal(report.rejected.length, 2); assert.equal(report.accepted.length, 0);
  rows.users = [rows.users![0], rows.users![0]]; await save(); report = await planRecovery(directory);
  assert.equal(report.rejected[0]!.reason, 'DUPLICATE_SOURCE_ID');
}));
test('missing parents orphaned and dirty apply refused before connecting', async () => fixture(async (directory, rows, save) => {
  rows.tracks = [{ id: 'track', releaseId: 'missing', title: 'Synthetic' }]; await save();
  assert.equal((await planRecovery(directory)).orphan.length, 2);
  await assert.rejects(recover(directory, { apply: true, target: { databaseUrl: 'postgresql://soundpub_recovery:synthetic@127.0.0.1:55433/soundpub_recovery_test_fixture', confirmDisposableDatabase: 'soundpub_recovery_test_fixture' } }), /zero rejected/);
}));
test('hash, count and traversal violations fail closed', async () => fixture(async (directory, _rows, save) => {
  await writeFile(path.join(directory, 'users.json'), '[]');
  await assert.rejects(planRecovery(directory), /checksum/);
  await save();
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version: 1, namespace: 'synthetic', files: kinds.map(kind => ({ kind, file: '../users.json', rows: 1, sha256: 'a'.repeat(64) })) }));
  await assert.rejects(planRecovery(directory));
  await assert.rejects(planRecovery(path.join(directory, 'backups')), /Backup paths/);
}));
test('target guard denies live, remote, default and unconfirmed databases', () => {
  for (const databaseUrl of ['postgresql://soundpub_recovery:synthetic@remote:55433/soundpub_recovery_test_fixture', 'postgresql://soundpub_recovery:synthetic@localhost:55433/soundpub_dev', 'postgresql://soundpub_recovery:synthetic@localhost:5432/soundpub_recovery_test_fixture']) {
    assert.throws(() => guardTarget({ databaseUrl, confirmDisposableDatabase: 'soundpub_recovery_test_fixture' }));
  }
});
test('transaction commits replay-compatible writes; conflicts and target mismatch roll back', async () => fixture(async directory => {
  const report = await planRecovery(directory);
  for (const failure of ['none', 'conflict', 'identity']) {
    const sql: string[] = [];
    const client = { query: async (statement: string) => {
      sql.push(statement);
      if (statement.startsWith('SELECT current_database')) return { rows: [{ database: failure === 'identity' ? 'live' : 'soundpub_recovery_test_fixture', username: 'soundpub_recovery' }], rowCount: 1 };
      return { rows: [], rowCount: failure === 'conflict' ? 0 : 1 };
    } };
    const operation = writeRecoveryTransaction(client as never, report, 'soundpub_recovery_test_fixture');
    if (failure === 'none') { await operation; assert.equal(sql.at(-1), 'COMMIT'); }
    else { await assert.rejects(operation); assert.equal(sql.at(-1), 'ROLLBACK'); assert.ok(!sql.includes('COMMIT')); }
  }
}));
