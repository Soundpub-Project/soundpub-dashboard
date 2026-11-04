import { parseArgs } from 'node:util';
import { repairOrphans } from './orphan-repair.js';

const { values } = parseArgs({ options: {
  apply: { type: 'boolean', default: false }, actor: { type: 'string' }, reason: { type: 'string' },
  'rollback-batch': { type: 'string' },
}, strict: true, allowPositionals: false });
try {
  const result = await repairOrphans({ databaseUrl: process.env.ORPHAN_REPAIR_DATABASE_URL ?? '', apply: values.apply,
    ...(values.actor ? { actor: values.actor } : {}), ...(values.reason ? { reason: values.reason } : {}),
    ...(values['rollback-batch'] ? { rollbackBatch: values['rollback-batch'] } : {}),
  });
  console.log(JSON.stringify(result, null, 2));
  if ('status' in result && result.status === 'AMBIGUOUS_REPAIR') process.exitCode = 2;
} catch (error) {
  console.error(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'ORPHAN_REPAIR_FAILED');
  process.exitCode = 1;
}
