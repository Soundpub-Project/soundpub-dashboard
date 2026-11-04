import type { PicDestination, PayoutRequest } from '@/api/payouts';

/** Whitelist verified backend destination fields; never accept an artist/owner from the form. */
export function picPayoutRequest(amount: string, destination: PicDestination | null | undefined): PayoutRequest {
  if (!destination || destination.verified !== true || destination.currency !== 'IDR') throw new Error('DESTINATION_REQUIRED');
  return { amount, currency: 'IDR', bank_name: destination.bank_name,
    account_number: destination.account_number, account_holder_name: destination.account_holder_name };
}
