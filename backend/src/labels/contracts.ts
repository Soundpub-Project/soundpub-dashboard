import { z } from 'zod';

export const rosterQuery = z.strictObject({
  limit: z.string().regex(/^(?:[1-9]|[1-9][0-9]|100)$/).optional(),
  cursor: z.string().min(1).max(1000).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});
export const assignInput = z.strictObject({ labelId: z.uuid(), expectedParentLabelId: z.null() });
export const transferInput = z.strictObject({
  labelId: z.uuid(), expectedParentLabelId: z.uuid(),
  confirmationPhrase: z.literal('PINDAH LABEL'),
  royaltyTransferMode: z.literal('keep_old_label').optional(),
});
export const removeInput = z.strictObject({ expectedParentLabelId: z.uuid() });
export type RosterQuery = z.infer<typeof rosterQuery>;
export type AssignInput = z.infer<typeof assignInput>;
export type TransferInput = z.infer<typeof transferInput>;
export type RemoveInput = z.infer<typeof removeInput>;
export interface ParentDto {
  artistId: string;
  parentLabelId: string | null;
  membershipId: string | null;
}
export interface RosterItem {
  membershipId: string;
  artistId: string;
  labelId: string;
  name: string;
  fullName: string;
  status: 'active' | 'inactive' | 'suspended';
  email: string | null;
  phone: string | null;
  address: string | null;
  passwordSet: boolean;
  createdAt: string;
}
export interface LabelDto {
  id: string;
  ownerId: string;
  full_name: string;
  logo_url: string | null;
  logo_url_light: string | null;
  logo_url_dark: string | null;
  status: 'active' | 'inactive' | 'suspended';
  roles: ('label' | 'whitelabel')[];
}
