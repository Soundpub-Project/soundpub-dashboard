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
  throw new Error('Unknown identity provider');
}
