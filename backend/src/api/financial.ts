import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ApiError } from './types.js';
import type { Principal } from '../auth/index.js';
import type { BalanceService } from '../finance/service.js';
import type { RoyaltiesService } from '../royalties/index.js';
import type { PayoutsService } from '../payouts/index.js';
import type { PaymentsService } from '../payments/index.js';
import type { FinanceReconciliationService } from '../reconciliation/index.js';

const secured = [{ bearerAuth: [] }];
const key = (request: FastifyRequest) => {
  const value = request.headers['idempotency-key'];
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(value)) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED');
  return value;
};

export function registerFinancialRoutes(app: FastifyInstance, services: {
  balance?: BalanceService; royalties?: RoyaltiesService; payouts?: PayoutsService; payments?: PaymentsService;
  financeReconciliation?: FinanceReconciliationService;
}, authenticate: (request: FastifyRequest) => Promise<Principal>, paths: Record<string, Record<string, unknown>>, errorSchema: object) {
  const add = (method: string, path: string, operationId: string) => {
    const normalized = path.replaceAll(':id', '{id}');
    const pagination = method === 'GET' && path === '/api/v1/royalties/imports/:id' ? { parameters: [
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } },
      { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0, maximum: 100000, default: 0 } },
    ] } : method === 'GET' && path === '/api/v1/royalties/import-files/:id/rows' ? { parameters: [
      { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['ALL','MATCHED','INVALID'], default: 'ALL' } },
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
      { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0, maximum: 100000, default: 0 } },
    ] } : {};
    paths[normalized] = { ...paths[normalized], [method.toLowerCase()]: { operationId, security: secured, ...pagination,
      responses: Object.fromEntries([200,400,401,403,404,409,429,500,503].map(status => [status, {
        description: status === 200 ? 'Success' : 'Error', content: { 'application/json': { schema: status === 200 ? { type: 'object' } : errorSchema } },
      }])) } };
  };
  if (services.balance) {
    app.get('/api/v1/balance', async request => services.balance!.get(await authenticate(request), (request.query as { owner_id?: string }).owner_id));
    add('GET', '/api/v1/balance', 'getBalance');
  }
  if (services.financeReconciliation) {
    app.get('/api/v1/admin/finance/reconciliation/latest', async request =>
      services.financeReconciliation!.latest(await authenticate(request)));
    app.get('/api/v1/admin/finance/reconciliation/runs', async request =>
      services.financeReconciliation!.history(await authenticate(request), request.query));
    add('GET', '/api/v1/admin/finance/reconciliation/latest', 'getLatestFinanceReconciliation');
    add('GET', '/api/v1/admin/finance/reconciliation/runs', 'listFinanceReconciliationRuns');
  }
  if (services.royalties) {
    const service = services.royalties;
    app.get('/api/v1/royalties/breakdown', async request => service.breakdown(await authenticate(request), request.query));
    app.get('/api/v1/royalties/analytics', async request => service.analytics(await authenticate(request), request.query));
    app.get('/api/v1/royalties/periods', async request => service.periods(await authenticate(request)));
    app.get('/api/v1/royalties/report', async request => service.report(await authenticate(request), request.query));
    app.get<{ Params: { id: string } }>('/api/v1/royalties/releases/:id', async request =>
      service.breakdown(await authenticate(request), { ...(request.query as object), release_id: request.params.id }));
    app.get('/api/v1/royalties/summary', async request => service.summary(await authenticate(request), request.query));
    app.post('/api/v1/royalties/imports/csv/preview', async request => service.previewCsv(await authenticate(request), request.body));
    app.post('/api/v1/royalties/imports/csv/commit', async request => service.commitCsv(await authenticate(request), request.body, request.id));
    app.post('/api/v1/royalties/import-files', async request => service.requestFileUpload(await authenticate(request), request.body, request.id));
    app.post('/api/v1/royalties/imports/:id/replacement-file-sessions', async request =>
      service.requestReplacementFileUpload(await authenticate(request), (request.params as { id: string }).id,
        request.body, key(request), request.id));
    app.post('/api/v1/royalties/import-files/:id/complete', async request => service.completeFileUpload(await authenticate(request), (request.params as { id: string }).id, request.id));
    app.get('/api/v1/royalties/import-files', async request => service.fileSessions(await authenticate(request), request.query));
    app.get('/api/v1/royalties/import-files/:id', async request => service.fileSession(await authenticate(request), (request.params as { id: string }).id));
    app.get('/api/v1/royalties/import-files/:id/rows', async request => service.fileSessionRows(await authenticate(request),
      (request.params as { id: string }).id, request.query));
    app.post('/api/v1/admin/royalties/import-files/:id/approve', async request => service.approveFileSession(await authenticate(request),
      (request.params as { id: string }).id, request.body, request.id));
    app.post('/api/v1/royalties/import-files/:id/retry', async request => service.retryFileSession(await authenticate(request), (request.params as { id: string }).id));
    app.post('/api/v1/royalties/import-files/:id/commit', async request => service.commitFileSession(await authenticate(request), (request.params as { id: string }).id, request.id));
    app.get('/api/v1/royalties/import-files/:id/download', async request => service.fileDownload(await authenticate(request), (request.params as { id: string }).id));
    app.post('/api/v1/royalties/imports/preview', async request => service.preview(await authenticate(request), request.body));
    app.post('/api/v1/royalties/imports/commit', async request => service.commit(await authenticate(request), request.body, request.id));
    app.get('/api/v1/royalties/imports', async request => service.history(await authenticate(request), request.query));
    app.get('/api/v1/royalties/imports/:id', async request => service.detail(await authenticate(request),
      (request.params as { id: string }).id, request.query));
    app.get('/api/v1/admin/royalties/imports/:id/reconciliation', async request => service.reconciliation(await authenticate(request),
      (request.params as { id: string }).id));
    app.post('/api/v1/admin/royalties/imports/:id/reconciliation', async request => service.reconcile(await authenticate(request),
      (request.params as { id: string }).id, request.body, request.id));
    app.post('/api/v1/royalties/imports/:id/correction', async request => service.correct(await authenticate(request), (request.params as { id: string }).id, request.body, request.id));
    app.post('/api/v1/royalties/imports/:id/replacement/csv', async request => service.replaceCsv(await authenticate(request), (request.params as { id: string }).id, request.body, request.id));
    add('GET', '/api/v1/royalties/breakdown', 'getRoyaltyBreakdown');
    add('GET', '/api/v1/royalties/analytics', 'getRoyaltyAnalytics');
    add('GET', '/api/v1/royalties/periods', 'listRoyaltyPeriods');
    add('GET', '/api/v1/royalties/report', 'getRoyaltyReport');
    add('GET', '/api/v1/royalties/releases/:id', 'getReleaseRoyaltyBreakdown');
    for (const [method,path,id] of [['GET','/api/v1/royalties/summary','getRoyaltySummary'],['POST','/api/v1/royalties/imports/csv/preview','previewRoyaltyCsvImport'],['POST','/api/v1/royalties/imports/csv/commit','commitRoyaltyCsvImport'],['POST','/api/v1/royalties/import-files','requestRoyaltyFileUpload'],['POST','/api/v1/royalties/imports/:id/replacement-file-sessions','requestRoyaltyReplacementFileUpload'],['POST','/api/v1/royalties/import-files/:id/complete','completeRoyaltyFileUpload'],['GET','/api/v1/royalties/import-files','listRoyaltyFileUploads'],['GET','/api/v1/royalties/import-files/:id','getRoyaltyFileUpload'],['GET','/api/v1/royalties/import-files/:id/rows','listRoyaltyFileRows'],['POST','/api/v1/admin/royalties/import-files/:id/approve','approveRoyaltyFilePreview'],['POST','/api/v1/royalties/import-files/:id/retry','retryRoyaltyFileUpload'],['POST','/api/v1/royalties/import-files/:id/commit','commitRoyaltyFileUpload'],['GET','/api/v1/royalties/import-files/:id/download','downloadRoyaltyFileUpload'],['POST','/api/v1/royalties/imports/preview','previewRoyaltyImport'],['POST','/api/v1/royalties/imports/commit','commitRoyaltyImport'],['GET','/api/v1/royalties/imports','listRoyaltyImports'],['GET','/api/v1/royalties/imports/:id','getRoyaltyImport'],['GET','/api/v1/admin/royalties/imports/:id/reconciliation','getRoyaltyReconciliation'],['POST','/api/v1/admin/royalties/imports/:id/reconciliation','approveRoyaltyReconciliation'],['POST','/api/v1/royalties/imports/:id/correction','correctRoyaltyImport'],['POST','/api/v1/royalties/imports/:id/replacement/csv','replaceRoyaltyCsvImport']]) add(method!,path!,id!);
  }
  if (services.payouts) {
    const service = services.payouts;
    app.get('/api/v1/payouts/destination', async request => service.destination(await authenticate(request)));
    app.put('/api/v1/payouts/destination', async request => service.updateDestination(await authenticate(request), request.body));
    app.post('/api/v1/admin/payouts/readiness/:id', async request => service.reviewReadiness(await authenticate(request), (request.params as { id: string }).id, request.body, key(request)));
    add('GET', '/api/v1/payouts/destination', 'getPayoutDestination');
    add('PUT', '/api/v1/payouts/destination', 'updatePayoutDestination');
    add('POST', '/api/v1/admin/payouts/readiness/:id', 'reviewPayoutReadiness');
    app.get('/api/v1/payouts/eligibility', async request => service.eligibility(await authenticate(request)));
    app.get('/api/v1/payouts', async request => service.list(await authenticate(request), request.query));
    app.post('/api/v1/payouts', async request => service.request(await authenticate(request), request.body, key(request)));
    app.get('/api/v1/payouts/:id', async request => service.detail(await authenticate(request), (request.params as { id: string }).id));
    app.post('/api/v1/payouts/:id/cancel', async request => service.cancel(await authenticate(request), (request.params as { id: string }).id, key(request)));
    app.get('/api/v1/admin/payouts', async request => service.list(await authenticate(request), request.query, true));
    app.post('/api/v1/admin/payouts/:id/transition', async request => service.transition(await authenticate(request), (request.params as { id: string }).id, request.body, key(request)));
    app.post('/api/v1/admin/payouts/:id/settle', async request => service.settle(await authenticate(request), (request.params as { id: string }).id, request.body, key(request)));
    for (const [method,path,id] of [['GET','/api/v1/payouts/eligibility','getPayoutEligibility'],['GET','/api/v1/payouts','listPayouts'],['POST','/api/v1/payouts','requestPayout'],['GET','/api/v1/payouts/:id','getPayout'],['POST','/api/v1/payouts/:id/cancel','cancelPayout'],['GET','/api/v1/admin/payouts','listAdminPayouts'],['POST','/api/v1/admin/payouts/:id/transition','transitionPayout'],['POST','/api/v1/admin/payouts/:id/settle','settlePayout']]) add(method!,path!,id!);
  }
  if (services.payments) {
    const service = services.payments;
    app.post('/api/v1/payments/invoices', async request => service.createInvoice(await authenticate(request), request.body, request.id));
    app.get('/api/v1/payments/releases/:id', async request => service.status(await authenticate(request), (request.params as { id: string }).id));
    app.post('/api/v1/admin/payments/refunds', async request => service.refund(await authenticate(request), request.body, request.id));
    app.get('/api/v1/admin/payments/reconciliation', async request => service.reconcile(await authenticate(request)));
    for (const [method,path,id] of [['POST','/api/v1/payments/invoices','createPaymentInvoice'],['GET','/api/v1/payments/releases/:id','getReleasePayment'],['POST','/api/v1/admin/payments/refunds','refundPayment'],['GET','/api/v1/admin/payments/reconciliation','reconcilePayments']]) add(method!,path!,id!);
  }
}

