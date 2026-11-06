import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Principal } from '../auth/index.js';
import type { ComposerRoyaltiesService } from '../composer-royalties/index.js';
import { beneficiaryMapping, beneficiaryMappingCreate, beneficiaryMappingList, beneficiaryMappingQuery,
  beneficiaryMappingRevoke, composerStatement, composerStatementPreview, copyrightRoyaltyBatch,
  copyrightRoyaltyCorrection, copyrightRoyaltyCorrectionCreate, copyrightRoyaltyEntry,
  copyrightRoyaltyImportCreate, copyrightRoyaltyImportDetail, copyrightRoyaltyImportList,
  copyrightRoyaltyListQuery, copyrightRoyaltyPostingResult, copyrightRoyaltyReconciliation,
  copyrightRoyaltyReconciliationCreate, copyrightRoyaltySummary, copyrightRoyaltySummaryQuery } from '../composer-royalties/contracts.js';

export function registerComposerRoyaltiesRoutes(app: FastifyInstance, service: ComposerRoyaltiesService,
  authenticate: (request: FastifyRequest) => Promise<Principal>, paths: Record<string, Record<string, unknown>>,
  errorSchema: object) {
  const definitions = [
    { method: 'GET' as const, url: '/api/v1/copyright/royalties/summary', operationId: 'copyrightRoyaltySummary',
      query: copyrightRoyaltySummaryQuery, response: copyrightRoyaltySummary },
    { method: 'POST' as const, url: '/api/v1/copyright/royalties/preview', operationId: 'previewComposerRoyalties',
      body: composerStatement, response: composerStatementPreview },
    { method: 'POST' as const, url: '/api/v1/admin/copyright/royalties/imports', operationId: 'importCopyrightRoyalties',
      body: copyrightRoyaltyImportCreate, response: copyrightRoyaltyPostingResult },
    { method: 'GET' as const, url: '/api/v1/admin/copyright/royalties/imports', operationId: 'listCopyrightRoyaltyImports',
      query: copyrightRoyaltyListQuery, response: copyrightRoyaltyImportList },
    { method: 'GET' as const, url: '/api/v1/admin/copyright/royalties/imports/:id', operationId: 'getCopyrightRoyaltyImport',
      params: z.strictObject({ id: z.uuid() }), response: copyrightRoyaltyImportDetail },
    { method: 'GET' as const, url: '/api/v1/copyright/royalties', operationId: 'listCopyrightRoyalties',
      query: copyrightRoyaltyListQuery, response: z.strictObject({ items: z.array(copyrightRoyaltyEntry), next_offset: z.number().int().nullable() }) },
    { method: 'POST' as const, url: '/api/v1/admin/copyright/royalties/imports/:id/corrections', operationId: 'correctCopyrightRoyaltyImport',
      params: z.strictObject({ id: z.uuid() }), body: copyrightRoyaltyCorrectionCreate, response: copyrightRoyaltyCorrection },
    { method: 'POST' as const, url: '/api/v1/admin/copyright/royalties/imports/:id/reconciliation', operationId: 'reconcileCopyrightRoyaltyImport',
      params: z.strictObject({ id: z.uuid() }), body: copyrightRoyaltyReconciliationCreate, response: copyrightRoyaltyReconciliation },
    { method: 'POST' as const, url: '/api/v1/admin/copyright/beneficiary-mappings', operationId: 'createCopyrightBeneficiaryMapping',
      body: beneficiaryMappingCreate, response: beneficiaryMapping },
    { method: 'GET' as const, url: '/api/v1/admin/copyright/beneficiary-mappings', operationId: 'listCopyrightBeneficiaryMappings',
      query: beneficiaryMappingQuery, response: beneficiaryMappingList },
    { method: 'POST' as const, url: '/api/v1/admin/copyright/beneficiary-mappings/:id/revoke', operationId: 'revokeCopyrightBeneficiaryMapping',
      params: z.strictObject({ id: z.uuid() }), body: beneficiaryMappingRevoke, response: beneficiaryMapping },
  ];
  for (const def of definitions) {
    const body = def.body ? z.toJSONSchema(def.body, { target: 'openapi-3.0', io: 'input' }) : undefined;
    const query = def.query ? z.toJSONSchema(def.query, { target: 'openapi-3.0', io: 'input' }) : undefined;
    const params = def.params ? z.toJSONSchema(def.params, { target: 'openapi-3.0', io: 'input' }) : undefined;
    const response = z.toJSONSchema(def.response, { target: 'openapi-3.0' });
    const responses = Object.fromEntries([200, 400, 401, 403, 404, 409, 429, 500, 503].map(status => [status, {
      description: status === 200 ? 'Success' : 'Error', content: { 'application/json': { schema: status === 200 ? response : errorSchema } },
    }]));
    const openapiPath = def.url.replace(':id', '{id}');
    paths[openapiPath] = { ...paths[openapiPath], [def.method.toLowerCase()]: {
      operationId: def.operationId, security: [{ bearerAuth: [] }],
      ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
      ...(query ? { parameters: Object.entries(query.properties ?? {}).map(([name, schema]) => ({ name, in: 'query', required: false, schema })) } : {}),
      ...(params ? { parameters: [{ name: 'id', in: 'path', required: true, schema: params.properties!.id }] } : {}), responses,
    } };
    app.route({ method: def.method, url: def.url,
      schema: { ...(body ? { body } : {}), ...(query ? { querystring: query } : {}), ...(params ? { params } : {}),
        response: Object.fromEntries(Object.entries(responses).map(([status, value]) => [status, value.content['application/json'].schema])) },
      handler: async request => {
        const actor = await authenticate(request);
        if (def.operationId === 'copyrightRoyaltySummary') return service.summary(actor, request.query);
        if (def.operationId === 'previewComposerRoyalties') return service.preview(actor, request.body);
        if (def.operationId === 'importCopyrightRoyalties') return service.postImport(actor, request.body, request.id);
        if (def.operationId === 'listCopyrightRoyaltyImports') return service.listImports(actor, request.query);
        if (def.operationId === 'getCopyrightRoyaltyImport') return service.getImport(actor, (request.params as { id: string }).id);
        if (def.operationId === 'listCopyrightRoyalties') return service.listRoyalties(actor, request.query);
        if (def.operationId === 'correctCopyrightRoyaltyImport') return service.correct(actor, (request.params as { id: string }).id, request.body, request.id);
        if (def.operationId === 'reconcileCopyrightRoyaltyImport') return service.reconcile(actor, (request.params as { id: string }).id, request.body, request.id);
        if (def.operationId === 'createCopyrightBeneficiaryMapping') return service.createMapping(actor, request.body);
        if (def.operationId === 'listCopyrightBeneficiaryMappings') return service.listMappings(actor, request.query);
        return service.revokeMapping(actor, (request.params as { id: string }).id, request.body);
      },
    });
  }
}
