import { usesBackendDomain } from '@/api/routing';
import { usesBackendReleases } from '@/services/releases';

export const usesBackendFinance = () => usesBackendReleases() || ['royalties', 'payouts', 'payments'].some(usesBackendDomain);
export const financeUnavailable = 'Layanan keuangan backend belum tersedia. Saldo dan status pembayaran belum dapat dikonfirmasi.';
export function requireLegacyFinance() {
  if (usesBackendFinance()) throw new Error(financeUnavailable);
}
