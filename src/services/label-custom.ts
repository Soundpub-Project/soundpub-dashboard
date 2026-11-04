import { z } from 'zod';
import {
  labelCustomApi,
  type LabelCustomArtist,
  type LabelCustomArtistCreate,
  type LabelCustomArtistPatch,
  type LabelCustomArtistQuery,
  type LabelCustomOwnerScope,
  type LabelCustomUnitCreate,
  type LabelCustomUnitPatch,
} from '@/api/label-custom';

export type {
  LabelCustomArtist, LabelCustomArtistCreate, LabelCustomArtistPatch, LabelCustomArtistQuery,
  LabelCustomOwnerScope, LabelCustomStatus, LabelCustomUnit, LabelCustomUnitCreate, LabelCustomUnitPatch,
} from '@/api/label-custom';

const name = z.string().trim().min(1, 'Nama wajib diisi.').max(200, 'Nama maksimal 200 karakter.');
const artistFieldsSchema = z.object({
  name,
  contact_email: z.string().trim().min(1, 'Email kontak wajib diisi.')
    .max(320, 'Email kontak maksimal 320 karakter.').email('Masukkan email kontak yang valid.'),
  contact_phone: z.string().trim().min(1, 'Nomor telepon kontak wajib diisi.')
    .max(50, 'Nomor telepon kontak maksimal 50 karakter.'),
}).strict();
// Explicit output keeps required create fields intact with this repo's strictNullChecks setting.
export const labelCustomArtistSchema = artistFieldsSchema.transform((value): LabelCustomArtistCreate => ({
  name: value.name, contact_email: value.contact_email, contact_phone: value.contact_phone,
}));
const artistPatchSchema = artistFieldsSchema.partial()
  .refine(value => Object.values(value).some(field => field !== undefined), 'Isi minimal satu kolom perubahan.');
const unitCreateSchema = z.object({ name }).strict();
const unitPatchSchema = unitCreateSchema.extend({ status: z.enum(['active', 'archived']).optional() }).partial()
  .refine(value => Object.values(value).some(field => field !== undefined), 'Isi minimal satu kolom perubahan.');

// Label Custom always uses the backend, independently of legacy domain routing.
export const getLabelCustomUnit = (scope?: LabelCustomOwnerScope) => labelCustomApi.getUnit(scope);
export const createLabelCustomUnit = (input: LabelCustomUnitCreate, scope?: LabelCustomOwnerScope) => {
  const data = unitCreateSchema.parse(input);
  return labelCustomApi.createUnit({ name: data.name }, scope);
};
export const updateLabelCustomUnit = (input: LabelCustomUnitPatch, scope?: LabelCustomOwnerScope) =>
  labelCustomApi.updateUnit(unitPatchSchema.parse(input), scope);
export const getLabelCustomArtist = (id: string, scope?: LabelCustomOwnerScope) => labelCustomApi.getArtist(id, scope);
export const createLabelCustomArtist = (input: LabelCustomArtistCreate, idempotencyKey: string, scope?: LabelCustomOwnerScope) =>
  labelCustomApi.createArtist(labelCustomArtistSchema.parse(input), idempotencyKey, scope);
export const updateLabelCustomArtist = (id: string, input: LabelCustomArtistPatch, scope?: LabelCustomOwnerScope) =>
  labelCustomApi.updateArtist(id, artistPatchSchema.parse(input), scope);
export const archiveLabelCustomArtist = (id: string, scope?: LabelCustomOwnerScope) => labelCustomApi.archiveArtist(id, scope);

export async function listLabelCustomArtists(
  query: Omit<LabelCustomArtistQuery, 'cursor'> = {}, scope?: LabelCustomOwnerScope,
): Promise<LabelCustomArtist[]> {
  const items: LabelCustomArtist[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await labelCustomApi.listArtists({ ...query, cursor }, scope);
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    if (cursor && visited.has(cursor)) throw new Error('Pagination artis Label Custom tidak valid.');
    if (cursor) visited.add(cursor);
  } while (cursor);
  return items;
}
