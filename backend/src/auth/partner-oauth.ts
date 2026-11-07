import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Identity } from './index.js';

type Transaction = { state: string; codeVerifier: string; redirectUri: string; createdAt: number };

export interface PartnerAuthorizationProvider {
  createAuthorizationUrl(input: { redirectUri: string; state: string; codeChallenge: string },
    allowedRedirectOrigins: readonly string[]): string | null;
  exchangeAuthorizationCode(input: { code: string; redirectUri: string; codeVerifier: string },
    allowedRedirectOrigins: readonly string[]): Promise<Identity | null>;
}

function encryptionKey(secret: string) {
  if (secret.length < 32) throw new Error('Partner OAuth transaction secret must contain at least 32 characters');
  return createHash('sha256').update(secret, 'utf8').digest();
}

function encryptTransaction(transaction: Transaction, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(transaction), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

function decryptTransaction(token: string, secret: string): Transaction | null {
  if (!/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{80,2048}\.[A-Za-z0-9_-]{22}$/.test(token)) return null;
  try {
    const [iv, ciphertext, tag] = token.split('.');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(iv!, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag!, 'base64url'));
    const decoded: unknown = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(ciphertext!, 'base64url')), decipher.final(),
    ]).toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
    const value = decoded as Partial<Transaction>;
    if (typeof value.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.state) ||
        typeof value.codeVerifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.codeVerifier) ||
        typeof value.redirectUri !== 'string' || value.redirectUri.length > 2048 ||
        typeof value.createdAt !== 'number' || !Number.isSafeInteger(value.createdAt)) return null;
    return value as Transaction;
  } catch { return null; }
}

function equalState(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function createPartnerOAuthService(provider: PartnerAuthorizationProvider, options: {
  secret: string; allowedRedirectOrigins: readonly string[]; now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const consumedStates = new Map<string, number>();
  encryptionKey(options.secret);
  return {
    start(redirectUri: string) {
      const state = randomBytes(32).toString('base64url');
      const codeVerifier = randomBytes(32).toString('base64url');
      const codeChallenge = createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
      const authorizationUrl = provider.createAuthorizationUrl({ redirectUri, state, codeChallenge }, options.allowedRedirectOrigins);
      if (!authorizationUrl) return null;
      return { authorizationUrl, transaction: encryptTransaction({ state, codeVerifier, redirectUri, createdAt: now() }, options.secret) };
    },
    async exchange(input: { code: string; state: string; transaction: string }) {
      const transaction = decryptTransaction(input.transaction, options.secret);
      if (!transaction || now() - transaction.createdAt < 0 || now() - transaction.createdAt > 10 * 60 * 1000 ||
          !equalState(transaction.state, input.state)) return null;
      for (const [state, expiresAt] of consumedStates) if (expiresAt <= now()) consumedStates.delete(state);
      if (consumedStates.has(transaction.state)) return null;
      consumedStates.set(transaction.state, transaction.createdAt + 10 * 60 * 1000);
      return provider.exchangeAuthorizationCode({ code: input.code, redirectUri: transaction.redirectUri,
        codeVerifier: transaction.codeVerifier }, options.allowedRedirectOrigins);
    },
  };
}

export type PartnerOAuthService = ReturnType<typeof createPartnerOAuthService>;
