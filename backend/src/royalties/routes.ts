import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ApiError } from '../api/types.js';
import type { Principal } from '../auth/index.js';
import type { RoyaltiesService } from './index.js';

export function registerRoyaltiesRoutes(app: FastifyInstance, service: RoyaltiesService,
  authenticate: (request: FastifyRequest) => Promise<Principal>) {
  app.post('/api/v1/royalties/imports/csv/preview', async request => service.previewCsv(await authenticate(request), request.body));
  app.post('/api/v1/royalties/imports/csv/commit', async request => service.commitCsv(await authenticate(request), request.body, request.id));
  app.post('/api/v1/royalties/import-files', async request => service.requestFileUpload(await authenticate(request), request.body, request.id));
  app.post<{ Params: { id: string } }>('/api/v1/royalties/imports/:id/replacement-file-sessions', async request => {
    const requestKey = request.headers['idempotency-key'];
    if (typeof requestKey !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(requestKey))
      throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED');
    return service.requestReplacementFileUpload(await authenticate(request), request.params.id, request.body,
      requestKey, request.id);
  });
  app.post<{ Params: { id: string } }>('/api/v1/royalties/import-files/:id/complete', async request => service.completeFileUpload(await authenticate(request), request.params.id, request.id));
  app.get('/api/v1/royalties/import-files', async request => service.fileSessions(await authenticate(request), request.query));
  app.get<{ Params: { id: string } }>('/api/v1/royalties/import-files/:id', async request => service.fileSession(await authenticate(request), request.params.id));
  app.get<{ Params: { id: string } }>('/api/v1/royalties/import-files/:id/rows', async request =>
    service.fileSessionRows(await authenticate(request), request.params.id, request.query));
  app.post<{ Params: { id: string } }>('/api/v1/admin/royalties/import-files/:id/approve', async request =>
    service.approveFileSession(await authenticate(request), request.params.id, request.body, request.id));
  app.post<{ Params: { id: string } }>('/api/v1/royalties/import-files/:id/retry', async request => service.retryFileSession(await authenticate(request), request.params.id));
  app.post<{ Params: { id: string } }>('/api/v1/royalties/import-files/:id/commit', async request => service.commitFileSession(await authenticate(request), request.params.id, request.id));
  app.get<{ Params: { id: string } }>('/api/v1/royalties/import-files/:id/download', async request => service.fileDownload(await authenticate(request), request.params.id));
  app.post('/api/v1/royalties/imports/preview', async request => service.preview(await authenticate(request), request.body));
  app.post('/api/v1/royalties/imports/commit', async request => service.commit(await authenticate(request), request.body, request.id));
  app.get('/api/v1/royalties/imports', async request => service.history(await authenticate(request), request.query));
  app.get<{ Params: { id: string } }>('/api/v1/royalties/imports/:id', async request =>
    service.detail(await authenticate(request), request.params.id, request.query));
  app.get<{ Params: { id: string } }>('/api/v1/admin/royalties/imports/:id/reconciliation', async request =>
    service.reconciliation(await authenticate(request), request.params.id));
  app.post<{ Params: { id: string } }>('/api/v1/admin/royalties/imports/:id/reconciliation', async request =>
    service.reconcile(await authenticate(request), request.params.id, request.body, request.id));
  app.post<{ Params: { id: string } }>('/api/v1/royalties/imports/:id/correction', async request =>
    service.correct(await authenticate(request), request.params.id, request.body, request.id));
  app.post<{ Params: { id: string } }>('/api/v1/royalties/imports/:id/replacement/csv', async request =>
    service.replaceCsv(await authenticate(request), request.params.id, request.body, request.id));
  app.get('/api/v1/royalties/breakdown', async request => service.breakdown(await authenticate(request), request.query));
  app.get('/api/v1/royalties/analytics', async request => service.analytics(await authenticate(request), request.query));
  app.get('/api/v1/royalties/periods', async request => service.periods(await authenticate(request)));
  app.get('/api/v1/royalties/report', async request => service.report(await authenticate(request), request.query));
  app.get<{ Params: { id: string } }>('/api/v1/royalties/releases/:id', async request =>
    service.breakdown(await authenticate(request), { ...(request.query as object), release_id: request.params.id }));
  app.get('/api/v1/royalties/summary', async request => service.summary(await authenticate(request), request.query));
}

