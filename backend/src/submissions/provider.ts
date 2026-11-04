import type { PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../api/types.js';
import type { SubmissionContext } from './index.js';

const identity = z.strictObject({ releaseId: z.uuid(), version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1) });
export interface ProviderSubmission { reference: string; status: string }
export interface SubmissionProvider {
  providerReady(context: SubmissionContext): Promise<boolean>;
  createSubmission(context: SubmissionContext): Promise<ProviderSubmission>;
  getSubmissionStatus(db: PoolClient, releaseId: string, version: number): Promise<ProviderSubmission | null>;
  reconcileSubmission(db: PoolClient, releaseId: string, version: number, local: ProviderSubmission | null): Promise<{
    mode: 'DRY_RUN'; state: 'MATCHED' | 'PROVIDER_AHEAD' | 'MANUAL_REVIEW'; reconciled: boolean;
  }>;
}

// ponytail: immutable local simulator receipts; remote dispatch needs an outbox and independent provider evidence.
export class MockSubmissionProvider implements SubmissionProvider {
  async providerReady() { return true; }

  async createSubmission({ db, release }: SubmissionContext): Promise<ProviderSubmission> {
    const parsed = identity.safeParse({ releaseId: release.id, version: release.version });
    if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST');
    const reference = `mock-submission:${release.id}:${release.version}`;
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,29))', [reference]);
    const existing = await this.getSubmissionStatus(db, release.id, release.version);
    if (existing) return existing;
    const claimed = await db.query(`INSERT INTO soundpub.integration_effects(consumer,idempotency_key)
      VALUES ('mock-submission',$1) ON CONFLICT DO NOTHING RETURNING idempotency_key`, [reference]);
    if (claimed.rowCount !== 1) throw new ApiError(409, 'CONFLICT');
    const receipt = { reference, status: 'ACCEPTED' };
    await db.query(`INSERT INTO soundpub.audit_logs(action,resource_type,resource_id,request_id,metadata)
      VALUES ('submission.mock_accepted','release',$1,$2,$3::jsonb)`, [release.id, reference, JSON.stringify(receipt)]);
    return receipt;
  }

  async getSubmissionStatus(db: PoolClient, releaseId: string, version: number): Promise<ProviderSubmission | null> {
    if (!identity.safeParse({ releaseId, version }).success) throw new ApiError(400, 'BAD_REQUEST');
    const reference = `mock-submission:${releaseId}:${version}`;
    const receipts = await db.query<{ metadata: ProviderSubmission }>(`SELECT metadata FROM soundpub.audit_logs
      WHERE action='submission.mock_accepted' AND resource_type='release' AND resource_id=$1 AND request_id=$2`, [releaseId, reference]);
    if (receipts.rows.length > 1) throw new ApiError(409, 'CONFLICT');
    const receipt = receipts.rows[0]?.metadata;
    if (!receipt) return null;
    if (receipt.reference !== reference || receipt.status !== 'ACCEPTED') throw new ApiError(409, 'CONFLICT');
    return receipt;
  }

  async reconcileSubmission(db: PoolClient, releaseId: string, version: number, local: ProviderSubmission | null) {
    let remote: ProviderSubmission | null;
    try { remote = await this.getSubmissionStatus(db, releaseId, version); }
    catch { return { mode: 'DRY_RUN' as const, state: 'MANUAL_REVIEW' as const, reconciled: false }; }
    if (remote && remote.status !== 'ACCEPTED') return { mode: 'DRY_RUN' as const, state: 'MANUAL_REVIEW' as const, reconciled: false };
    const matched = !!remote && local?.reference === remote.reference && local.status === remote.status;
    const ahead = !!remote && (!local || local.reference === remote.reference && local.status === 'PENDING');
    return { mode: 'DRY_RUN' as const,
      state: matched ? 'MATCHED' as const : ahead ? 'PROVIDER_AHEAD' as const : 'MANUAL_REVIEW' as const,
      reconciled: matched };
  }
}
