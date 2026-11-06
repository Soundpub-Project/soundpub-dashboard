import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

interface EncryptedToken {
  token_ciphertext: string;
  token_iv: string;
  token_tag: string;
}

function key(secret: string) {
  if (secret.length < 32) throw new Error('AUTH_DELIVERY_SECRET must contain at least 32 characters');
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptDeliveryToken(token: string, secret: string): EncryptedToken {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    token_ciphertext: ciphertext.toString('base64url'),
    token_iv: iv.toString('base64url'),
    token_tag: cipher.getAuthTag().toString('base64url'),
  };
}

export function decryptDeliveryToken(payload: unknown, secret: string): string {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid auth delivery payload');
  const value = payload as Partial<EncryptedToken>;
  if (!value.token_ciphertext || !value.token_iv || !value.token_tag) throw new Error('Invalid auth delivery payload');
  const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(value.token_iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(value.token_tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(value.token_ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
