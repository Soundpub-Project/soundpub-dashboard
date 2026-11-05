import type { Role } from '../auth/index.js';
import type { UsersService } from '../users/index.js';
import type { ArtistsService } from '../artists/index.js';
import type { LabelsService } from '../labels/index.js';
import type { LabelCustomService } from '../label-custom/index.js';
import type { ReleasesService } from '../releases/index.js';
import type { TracksService } from '../tracks/index.js';
import type { SubmissionService } from '../submissions/index.js';
import type { NotificationsService } from '../notifications/index.js';
import type { MediaService } from '../media/index.js';
import type { AuditSettingsService } from '../audit-settings/index.js';
import type { BalanceService } from '../finance/service.js';
import type { RoyaltiesService } from '../royalties/index.js';
import type { PayoutsService } from '../payouts/index.js';
import type { PaymentsService } from '../payments/index.js';
import type { FinanceReconciliationService } from '../reconciliation/index.js';
import type { ComposerRoyaltiesService } from '../composer-royalties/index.js';
export interface Principal {
  id: string;
  roles: readonly Role[];
  status: 'active' | 'inactive' | 'suspended';
}

export interface RateLimiter {
  consume(input: { key: string; route: string }): Promise<{
    allowed: boolean;
    retryAfterSeconds?: number;
  }>;
}

export interface ApiDependencies {
  localAuth?: import('../local-auth/index.js').LocalAuthService;
  publicCatalog?: import('../public-catalog/index.js').PublicCatalogService;
  users?: UsersService;
  artists?: ArtistsService;
  labels?: LabelsService;
  labelCustom?: LabelCustomService;
  releases?: ReleasesService;
  tracks?: TracksService;
  submissions?: SubmissionService;
  notifications?: NotificationsService;
  media?: MediaService;
  auditSettings?: AuditSettingsService;
  maintenance?: { isEnabled(): Promise<boolean> };
  balance?: BalanceService;
  royalties?: RoyaltiesService;
  payouts?: PayoutsService;
  payments?: PaymentsService;
  financeReconciliation?: FinanceReconciliationService;
  composerRoyalties?: ComposerRoyaltiesService;
  auth: { authenticate(token: string): Promise<Principal | null> };
  readiness: { check(): Promise<boolean> };
  admin: {
    suspendUser(input: { userId: string; reason: string; actor: Principal; requestId: string }): Promise<void>;
  };
  webhooks: {
    // Verify signatures against these exact bytes; reject invalid signatures with false.
    receive(input: { body: Buffer; signature: string; requestId: string }): Promise<boolean>;
  };
  storage?: {
    upload(actor: Principal, input: { data: Uint8Array; mimeType: string; checksum: string }): Promise<{ id: string }>;
    signedUrl(actor: Principal, id: string, expiresInSeconds: number): Promise<string>;
    signedUploadUrl?(actor: Principal, input: { mimeType: string; size: number; checksum: string }, expiresInSeconds: number): Promise<{ metadata: { id: string }; url: string; method: string; headers: Record<string, string> }>;
    completeUpload?(actor: Principal, id: string): Promise<{ id: string }>;
  };
  asyncActions?: { enqueue(actor: Principal, idempotencyKey: string): Promise<string> };
  rateLimiter: RateLimiter;
}

export class ApiError extends Error {
  constructor(public readonly statusCode: 400 | 401 | 403 | 404 | 409 | 429 | 503, public readonly code: string) {
    super(code);
  }
}






