export function idrAmountFromMinor(value: string): number {
  if (!/^[1-9][0-9]{0,15}$/.test(value)) throw new Error('Invalid Xendit IDR amount');
  const minor = BigInt(value);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor % 100n !== 0n) {
    throw new Error('Xendit IDR amount must be whole rupiah');
  }
  return Number(minor / 100n);
}
export interface XenditInvoiceRequest {
  external_id: string;
  amount: number;
  currency: 'IDR';
  description: string;
  payer_email: string;
  customer: { given_names: string; email: string };
  success_redirect_url: string;
  failure_redirect_url: string;
}

export interface XenditInvoice {
  id: string;
  external_id: string;
  invoice_url: string;
  amount: number;
  currency: 'IDR';
  status: string;
}

export interface XenditInvoiceClientOptions {
  secretKey: string;
  fetch?: typeof fetch;
}

function parseInvoice(value: unknown): XenditInvoice | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const invoice = value as Record<string, unknown>;
  if (typeof invoice.id !== 'string' || invoice.id.length < 1 || invoice.id.length > 200 ||
      typeof invoice.external_id !== 'string' || typeof invoice.invoice_url !== 'string' ||
      !Number.isSafeInteger(invoice.amount) || typeof invoice.currency !== 'string' || invoice.currency !== 'IDR' ||
      typeof invoice.status !== 'string') return null;
  let url: URL;
  try { url = new URL(invoice.invoice_url); } catch { return null; }
  if (url.protocol !== 'https:' || !['checkout.xendit.co', 'invoice.xendit.co'].includes(url.hostname)) return null;
  return invoice as unknown as XenditInvoice;
}

export class XenditInvoiceClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: XenditInvoiceClientOptions) {
    if (!/^xnd_development_[A-Za-z0-9+/=_-]{16,}$/.test(options.secretKey)) {
      throw new Error('Xendit adapter accepts development API keys only');
    }
    this.fetcher = options.fetch ?? fetch;
  }

  async createOrRecover(request: XenditInvoiceRequest): Promise<XenditInvoice> {
    if (!/^[A-Za-z0-9:_-]{1,200}$/.test(request.external_id) ||
        !Number.isSafeInteger(request.amount) || request.amount < 1 || request.currency !== 'IDR' ||
        !request.payer_email || request.customer.email !== request.payer_email) {
      throw new Error('Invalid Xendit invoice request');
    }
    const existing = await this.findByExternalId(request.external_id);
    if (existing) return this.assertMatches(existing, request);
    try {
      const response = await this.request('/v2/invoices', { method: 'POST', body: JSON.stringify(request) });
      const invoice = parseInvoice(await response.json().catch(() => null));
      if (!response.ok || !invoice) throw new Error('Xendit invoice creation failed');
      return this.assertMatches(invoice, request);
    } catch {
      const recovered = await this.findByExternalId(request.external_id);
      if (recovered) return this.assertMatches(recovered, request);
      throw new Error('Xendit invoice creation failed or could not be recovered');
    }
  }

  async getById(invoiceId: string): Promise<XenditInvoice> {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(invoiceId)) throw new Error('Invalid Xendit invoice ID');
    const response = await this.request(`/v2/invoices/${encodeURIComponent(invoiceId)}`, { method: 'GET' });
    const invoice = parseInvoice(await response.json().catch(() => null));
    if (!response.ok || !invoice || invoice.id !== invoiceId) throw new Error('Xendit invoice lookup failed');
    return invoice;
  }

  private async findByExternalId(externalId: string): Promise<XenditInvoice | null> {
    const query = new URLSearchParams({ external_id: externalId, limit: '10' });
    const response = await this.request(`/v2/invoices?${query}`, { method: 'GET' });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body)) throw new Error('Xendit invoice recovery failed');
    const matches = body.map(parseInvoice).filter((invoice): invoice is XenditInvoice =>
      invoice?.external_id === externalId);
    if (matches.length > 1) throw new Error('Multiple Xendit invoices share the same external ID');
    return matches[0] ?? null;
  }

  private assertMatches(invoice: XenditInvoice, request: XenditInvoiceRequest): XenditInvoice {
    if (invoice.external_id !== request.external_id || invoice.amount !== request.amount ||
        invoice.currency !== request.currency) throw new Error('Xendit invoice recovery mismatch');
    return invoice;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const authorization = Buffer.from(`${this.options.secretKey}:`).toString('base64');
    return this.fetcher(`https://api.xendit.co${path}`, {
      ...init,
      headers: { authorization: `Basic ${authorization}`, 'content-type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(10_000),
    });
  }
}