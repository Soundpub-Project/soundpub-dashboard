import { supabase } from '@/integrations/supabase/client';

export interface XenditInvoiceResult {
  invoice_url: string;
  invoice_id: string;
  amount: number;
  track_count: number;
  price_per_track: number;
  reused?: boolean;
}

const readFunctionError = async (error: any) => {
  const response = error?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json();
      return body?.details || body?.message || body?.error || error.message;
    } catch {
      return error.message;
    }
  }

  return error?.message || 'Gagal membuat invoice';
};

export async function createXenditInvoice(releaseId: string): Promise<XenditInvoiceResult> {
  const { data, error } = await supabase.functions.invoke('create-xendit-invoice', {
    body: { release_id: releaseId },
  });

  if (error) {
    throw new Error(await readFunctionError(error));
  }

  if (!data?.invoice_url) {
    throw new Error(data?.error || 'Invoice URL tidak ditemukan');
  }

  return data as XenditInvoiceResult;
}

export async function createCopyrightInvoice(registrationId: string): Promise<XenditInvoiceResult> {
  const { data, error } = await supabase.functions.invoke('create-copyright-invoice', { body: { registration_id: registrationId } });
  if (error) throw new Error(await readFunctionError(error));
  if (!data?.invoice_url) throw new Error(data?.error || 'Invoice URL tidak ditemukan');
  return data as XenditInvoiceResult;
}

export function openXenditInvoice(invoiceUrl: string) {
  const paymentWindow = window.open(invoiceUrl, '_blank', 'noopener,noreferrer');
  if (!paymentWindow) {
    throw new Error('Popup diblokir browser. Izinkan popup untuk membuka halaman pembayaran.');
  }
}
