import { timingSafeEqual } from 'node:crypto';

export type XenditPaymentStatus = 'PAID' | 'EXPIRED' | 'FAILED' | 'UNSUPPORTED';

export interface XenditInvoiceCallback {
  invoiceId: string;
  externalId?: string;
  status: XenditPaymentStatus;
  amountMinor: string;
  currency: string;
}

export function verifyXenditCallbackToken(expected: string | undefined, received: string | undefined): boolean {
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const receivedBytes = Buffer.from(received, 'utf8');
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function amountToMinor(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)) return null;
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const minor = BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (minor <= 0n || minor > 9007199254740991n) return null;
  return minor.toString();
}

export function parseXenditInvoiceCallback(rawBody: Uint8Array): XenditInvoiceCallback | null {
  if (!(rawBody instanceof Uint8Array) || rawBody.byteLength === 0 || rawBody.byteLength > 1_048_576) return null;
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(payload.id) ||
      (payload.external_id !== undefined && (typeof payload.external_id !== 'string' ||
        !/^[A-Za-z0-9:_-]{1,200}$/.test(payload.external_id))) ||
      typeof payload.status !== 'string' || payload.status.length < 1 || payload.status.length > 64 ||
      typeof payload.currency !== 'string' || !/^[A-Z]{3}$/.test(payload.currency)) return null;
  const amountMinor = amountToMinor(payload.amount);
  if (!amountMinor) return null;
  const status = payload.status.toUpperCase();
  return {
    invoiceId: payload.id,
    ...(typeof payload.external_id === 'string' ? { externalId: payload.external_id } : {}),
    status: status === 'PAID' || status === 'SETTLED' ? 'PAID' :
      status === 'EXPIRED' ? 'EXPIRED' : status === 'FAILED' ? 'FAILED' : 'UNSUPPORTED',
    amountMinor,
    currency: payload.currency,
  };
}
