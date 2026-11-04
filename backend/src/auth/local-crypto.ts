import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const parameters = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;
const keyLength = 64;

function derive(password: Buffer, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, keyLength, parameters,
    (error, result) => error ? reject(error) : resolve(result)));
}

function passwordBytes(password: string) {
  const bytes = Buffer.from(password, 'utf8');
  if (bytes.length < 12 || bytes.length > 1024 || password.includes('\0')) throw new Error('Invalid password');
  return bytes;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(32);
  const derived = await derive(passwordBytes(password), salt);
  return `scrypt$v=1$ln=17,r=8,p=1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const match = /^scrypt\$v=1\$ln=17,r=8,p=1\$([A-Za-z0-9_-]{43})\$([A-Za-z0-9_-]{86})$/.exec(encoded);
  if (!match) return false;
  let candidate: Buffer;
  try { candidate = await derive(passwordBytes(password), Buffer.from(match[1]!, 'base64url')); }
  catch { return false; }
  const expected = Buffer.from(match[2]!, 'base64url');
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function digestOpaqueToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid token');
  return createHash('sha256').update(token, 'ascii').digest();
}
