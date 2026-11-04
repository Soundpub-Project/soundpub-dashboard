export const ROLES = ['user', 'artist', 'label', 'label_custom', 'copyright', 'whitelabel', 'admin', 'superadmin'] as const;
export type Role = typeof ROLES[number];
export type Status = 'active' | 'inactive' | 'suspended';
export type Identity = Readonly<{ issuer: string; subject: string }>;
export type Principal = Readonly<{ id: string; roles: readonly Role[]; status: Status }>;
export type IdentityResolver = () => Promise<Identity | null>;
export type PrincipalResolver = (identity: Identity | null) => Promise<Principal | null>;
export interface PrincipalRepository {
  /** Query dedicated users and role assignments using bound issuer/subject parameters.
   * Return null for unknown identities. Never provision users or accept client roles here.
   */
  findByIdentity(identity: Identity): Promise<Principal | null>;
}
export type IdentityConfig = Readonly<{
  environment: 'development' | 'test' | 'production';
  mode: 'anonymous' | 'dev' | 'mock';
  identity?: Identity;
}>;
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const roles: readonly string[] = ROLES;

/** Server bootstrap only. No headers, cookies, body, query, or frontend config. */
export function createIdentityResolver(config: IdentityConfig): IdentityResolver {
  if (!['development', 'test', 'production'].includes(config.environment) ||
      !['anonymous', 'dev', 'mock'].includes(config.mode)) {
    throw new Error('Invalid identity configuration');
  }
  if (config.mode === 'anonymous') return async () => null;
  if (config.environment === 'production') throw new Error('Dev/mock identity forbidden in production');
  if (!nonempty(config.identity?.issuer) || !nonempty(config.identity?.subject)) {
    throw new Error('Identity issuer and subject required');
  }
  const identity = Object.freeze({ issuer: config.identity.issuer, subject: config.identity.subject });
  return async () => identity;
}

export function createPrincipalResolver(repository: PrincipalRepository): PrincipalResolver {
  return async identity => {
    if (identity === null) return null;
    if (!nonempty(identity.issuer) || !nonempty(identity.subject)) return null;
    const principal = await repository.findByIdentity(Object.freeze({ ...identity }));
    if (!principal || !nonempty(principal.id) ||
        !['active', 'inactive', 'suspended'].includes(principal.status) ||
        !Array.isArray(principal.roles) || principal.roles.some(role => !roles.includes(role))) return null;
    return Object.freeze({ id: principal.id, status: principal.status,
      roles: Object.freeze([...principal.roles]) });
  };
}

export type Policy = 'authenticated' | 'owner' | 'owner-or-admin' | 'admin' | 'superadmin';
export function createAuthorizer() {
  return (principal: Principal | null, policy: Policy, ownerId?: string): boolean => {
    if (!principal || !nonempty(principal.id) || principal.status !== 'active' ||
        !Array.isArray(principal.roles) || principal.roles.length === 0 ||
        principal.roles.some(role => !roles.includes(role))) return false;
    const admin = principal.roles.includes('admin') || principal.roles.includes('superadmin');
    const owner = nonempty(ownerId) && ownerId === principal.id;
    switch (policy) {
      case 'authenticated': return true;
      case 'owner': return owner;
      case 'owner-or-admin': return owner || admin;
      case 'admin': return admin;
      case 'superadmin': return principal.roles.includes('superadmin');
      default: return false;
    }
  };
}

export class AuthError extends Error {
  readonly statusCode: 401 | 403;
  constructor(statusCode: 401 | 403) {
    super(statusCode === 401 ? 'Unauthorized' : 'Forbidden');
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}
export type OwnerLoader<Request extends object = object> =
  (request: Request) => Promise<string | undefined>;

/** Inject returned async hooks into Fastify preHandler; no request decorations required. */
export function createAuthHooks<Request extends object = object>(deps: {
  resolveIdentity: IdentityResolver;
  resolvePrincipal: PrincipalResolver;
}) {
  const principals = new WeakMap<Request, Principal | null>();
  const allows = createAuthorizer();
  const authenticate = async (request: Request): Promise<void> => {
    principals.delete(request);
    const principal = await deps.resolvePrincipal(await deps.resolveIdentity());
    principals.set(request, principal);
  };
  const getPrincipal = (request: Request): Principal | null => principals.get(request) ?? null;
  const authorize = (policy: Policy, loadOwnerId?: OwnerLoader<Request>) =>
    async (request: Request): Promise<void> => {
      // Resolve on every guard: a previous hook must never leave a stale grant.
      await authenticate(request);
      const principal = getPrincipal(request);
      if (!principal) throw new AuthError(401);
      if (!allows(principal, 'authenticated')) throw new AuthError(403);
      const needsOwner = policy === 'owner' || policy === 'owner-or-admin';
      const ownerId = needsOwner && loadOwnerId ? await loadOwnerId(request) : undefined;
      if (!allows(principal, policy, ownerId)) throw new AuthError(403);
    };
  return { authenticate, getPrincipal, authorize };
}
