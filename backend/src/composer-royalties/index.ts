import { createAuthorizer, type Principal } from '../auth/index.js';
import { ApiError } from '../api/types.js';
import { previewComposerStatement } from './contracts.js';

export interface ComposerRoyaltiesService {
  preview(actor: Principal, input: unknown): ReturnType<typeof previewComposerStatement>;
}

export function createComposerRoyaltiesService(): ComposerRoyaltiesService {
  const authorize = createAuthorizer();
  return {
    preview(actor, input) {
      if (!authorize(actor, 'admin')) throw new ApiError(403, 'FORBIDDEN');
      return previewComposerStatement(input);
    },
  };
}
