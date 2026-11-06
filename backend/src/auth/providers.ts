import { createPublicKey, verify, type JsonWebKey as CryptoJsonWebKey } from 'node:crypto';
import { createPrincipalResolver } from './index.js';
import type { Identity, PrincipalRepository } from './index.js';

export interface IdentityProvider {
  verifyAccessToken(token: string): Promise<Identity | null>;
}

export class MockIdentityProvider implements IdentityProvider {
  private readonly identities = new Map<string, Identity>();

  constructor(environment: string, raw: string = '{}') {
    if (!['development', 'test'].includes(environment)) throw new Error('Mock identity forbidden outside development/test');
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid mock identity mapping');
    for (const [token, identity] of Object.entries(value)) {
      if (token.length < 8 || token.length > 200 || !identity || typeof identity !== 'object' ||
          !('issuer' in identity) || typeof identity.issuer !== 'string' || !identity.issuer.trim() ||
          !('subject' in identity) || typeof identity.subject !== 'string' || !identity.subject.trim()) {
        throw new Error('Invalid mock identity mapping');
      }
      this.identities.set(token, Object.freeze({ issuer: identity.issuer, subject: identity.subject }));
    }
  }

  async verifyAccessToken(token: string): Promise<Identity | null> {
    return this.identities.get(token) ?? null;
  }
}

export class SupabaseLegacyIdentityProvider implements IdentityProvider {
  private readonly endpoint: string;
  private readonly issuer: string;
  private readonly apiKey: string;

  constructor(config: { environment: string; url: string; apiKey: string },
    private readonly transport: typeof fetch = fetch) {
    if (!['development', 'test'].includes(config.environment)) throw new Error('Legacy bridge restricted to development/test');
    const url = new URL(config.url);
    if (!['http:', 'https:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Legacy bridge requires isolated loopback Auth origin');
    }
    if (!config.apiKey.trim() || /[\r\n]/.test(config.apiKey)) throw new Error('Legacy bridge API key required');
    this.issuer = `${url.origin}/auth/v1`;
    this.endpoint = `${this.issuer}/user`;
    this.apiKey = config.apiKey;
  }

  async verifyAccessToken(token: string): Promise<Identity | null> {
    if (!token || token.length > 16384 || /\s/.test(token)) return null;
    try {
      const response = await this.transport(this.endpoint, {
        headers: { apikey: this.apiKey, authorization: `Bearer ${token}` },
        redirect: 'error', signal: AbortSignal.timeout(5000),
      });
      if (response.status !== 200) return null;
      const user: unknown = await response.json();
      if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) return null;
      return Object.freeze({ issuer: this.issuer, subject: user.id });
    } catch {
      return null;
    }
  }
}

type JwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
type JwtClaims = { iss?: unknown; sub?: unknown; aud?: unknown; exp?: unknown; nbf?: unknown; azp?: unknown; resource_access?: unknown };
type Jwks = { keys?: unknown };
type RsaJwk = CryptoJsonWebKey & { kid: string; kty: 'RSA'; use?: string; alg?: string };

function decodeJson<T>(value: string): T | null {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded as T : null;
  } catch { return null; }
}

export class OidcIdentityProvider implements IdentityProvider {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwksUrl: string;
  private readonly clientId: string | undefined;
  private keys = new Map<string, RsaJwk>();
  private keysExpireAt = 0;

  constructor(config: { environment: string; issuer: string; audience: string; jwksUrl: string; clientId?: string },
    private readonly transport: typeof fetch = fetch, private readonly now: () => number = Date.now) {
    const issuer = new URL(config.issuer);
    const jwks = new URL(config.jwksUrl);
    const productionLike = ['staging', 'production'].includes(config.environment);
    if ((productionLike && issuer.protocol !== 'https:') || !['http:', 'https:'].includes(issuer.protocol) ||
        issuer.username || issuer.password || issuer.search || issuer.hash || issuer.pathname === '/' ||
        jwks.origin !== issuer.origin || jwks.protocol !== issuer.protocol || jwks.username || jwks.password ||
        jwks.search || jwks.hash || !jwks.pathname || jwks.pathname === '/') throw new Error('Invalid OIDC endpoints');
    if (issuer.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(issuer.hostname))
      throw new Error('Insecure OIDC issuer forbidden');
    if (!config.audience.trim() || config.audience.length > 200 || /[\s\r\n]/.test(config.audience))
      throw new Error('Invalid OIDC audience');
    this.issuer = issuer.href.replace(/\/$/, '');
    this.audience = config.audience;
    if (config.clientId !== undefined && (!config.clientId.trim() || config.clientId.length > 200 || /\s/.test(config.clientId)))
      throw new Error('Invalid OIDC client ID');
    this.jwksUrl = jwks.href;
    this.clientId = config.clientId;
  }

  private async refreshKeys(): Promise<boolean> {
    try {
      const response = await this.transport(this.jwksUrl, { redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { accept: 'application/json' } });
      if (response.status !== 200) return false;
      const body = await response.json() as Jwks;
      if (!Array.isArray(body.keys) || body.keys.length > 20) return false;
      const keys = new Map<string, RsaJwk>();
      for (const candidate of body.keys) {
        if (!candidate || typeof candidate !== 'object') continue;
        const key = candidate as Record<string, unknown>;
        if (key.kty !== 'RSA' || typeof key.kid !== 'string' || !key.kid || key.kid.length > 200 ||
            typeof key.n !== 'string' || typeof key.e !== 'string' || (key.use !== undefined && key.use !== 'sig') ||
            (key.alg !== undefined && key.alg !== 'RS256')) continue;
        keys.set(key.kid, candidate as RsaJwk);
      }
      if (!keys.size) return false;
      this.keys = keys;
      this.keysExpireAt = this.now() + 300_000;
      return true;
    } catch { return false; }
  }

  async verifyAccessToken(token: string): Promise<Identity | null> {
    if (!token || token.length > 16384 || /\s/.test(token)) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !part || !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const header = decodeJson<JwtHeader>(parts[0]!);
    const claims = decodeJson<JwtClaims>(parts[1]!);
    if (!header || !claims || header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid ||
        (header.typ !== undefined && header.typ !== 'JWT') || claims.iss !== this.issuer ||
        typeof claims.sub !== 'string' || !claims.sub.trim() || claims.sub.length > 255 ||
        typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp)) return null;
    const audience = typeof claims.aud === 'string' ? [claims.aud] : Array.isArray(claims.aud) ? claims.aud : [];
    if (!audience.includes(this.audience)) return null;
    if (this.clientId) {
      const resourceAccess = claims.resource_access;
      if (claims.azp !== this.clientId || !resourceAccess || typeof resourceAccess !== 'object' ||
          Array.isArray(resourceAccess)) return null;
      const client = (resourceAccess as Record<string, unknown>)[this.clientId];
      const clientRoles = client && typeof client === 'object' && !Array.isArray(client)
        ? (client as Record<string, unknown>).roles : null;
      if (!Array.isArray(clientRoles) || !clientRoles.length ||
          clientRoles.some(role => typeof role !== 'string' || !role.trim())) return null;
    }
    const nowSeconds = Math.floor(this.now() / 1000);
    if (claims.exp <= nowSeconds - 30 || (claims.nbf !== undefined &&
        (typeof claims.nbf !== 'number' || !Number.isSafeInteger(claims.nbf) || claims.nbf > nowSeconds + 30))) return null;
    if (this.now() >= this.keysExpireAt && !await this.refreshKeys()) return null;
    let key = this.keys.get(header.kid);
    if (!key) {
      if (!await this.refreshKeys()) return null;
      key = this.keys.get(header.kid);
    }
    if (!key) return null;
    try {
      const valid = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`),
        createPublicKey({ key: key as CryptoJsonWebKey, format: 'jwk' }), Buffer.from(parts[2]!, 'base64url'));
      return valid ? Object.freeze({ issuer: this.issuer, subject: claims.sub }) : null;
    } catch { return null; }
  }
}

export function createIdentityAuthenticator(provider: IdentityProvider, repository: PrincipalRepository) {
  const resolvePrincipal = createPrincipalResolver(repository);
  return { async authenticate(token: string) {
    return resolvePrincipal(await provider.verifyAccessToken(token));
  } };
}

export function createConfiguredIdentityProvider(environment: NodeJS.ProcessEnv): IdentityProvider {
  const mode = environment.IDENTITY_PROVIDER ?? 'mock';
  const nodeEnvironment = environment.NODE_ENV ?? 'development';
  if (mode === 'mock') return new MockIdentityProvider(nodeEnvironment, environment.DEV_AUTH_TOKENS_JSON);
  if (mode === 'supabase-legacy') return new SupabaseLegacyIdentityProvider({
    environment: nodeEnvironment, url: environment.LEGACY_AUTH_URL ?? '', apiKey: environment.LEGACY_AUTH_API_KEY ?? '',
  });
  if (mode === 'oidc') return new OidcIdentityProvider({ environment: nodeEnvironment,
    issuer: environment.OIDC_ISSUER ?? '', audience: environment.OIDC_AUDIENCE ?? '',
    jwksUrl: environment.OIDC_JWKS_URL ?? '',
    ...(environment.OIDC_CLIENT_ID !== undefined ? { clientId: environment.OIDC_CLIENT_ID } : {}),
  });
  throw new Error('Unknown identity provider');
}