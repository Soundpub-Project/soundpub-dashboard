import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const kinds = ['users', 'units', 'artists', 'releases', 'tracks', 'royalties'] as const;
type Kind = typeof kinds[number];
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const base = { id };
const schemas = {
  users: z.object({ ...base, name: z.string().min(1), email: z.email() }).strict(),
  units: z.object({ ...base, ownerId: id, name: z.string().min(1) }).strict(),
  artists: z.object({ ...base, unitId: id, name: z.string().min(1), email: z.email(), phone: z.string().min(1) }).strict(),
  releases: z.object({ ...base, artistId: id, title: z.string().min(1) }).strict(),
  tracks: z.object({ ...base, releaseId: id, title: z.string().min(1) }).strict(),
  royalties: z.object({ ...base, trackId: id, currency: z.string().regex(/^[A-Z]{3}$/), amountMinor: z.string().regex(/^-?(0|[1-9][0-9]*)$/) }).strict(),
};
const manifestSchema = z.object({ version: z.literal(1), namespace: id,
  files: z.array(z.object({ kind: z.enum(kinds), file: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), rows: z.number().int().min(0).max(100000) }).strict()).length(6),
}).strict();
export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export interface CanonicalRecord { kind: Kind; sourceId: string; canonicalId: string; data: Record<string, string> }
export interface Issue { kind: Kind; row: number; reason: string }
export interface RecoveryReport {
  version: 1; namespace: string; manifestHash: string; mode: 'dry-run' | 'apply';
  accepted: CanonicalRecord[]; rejected: Issue[]; orphan: Issue[];
  reconciliation: { sourceRows: number; accepted: number; rejected: number; orphan: number; royaltyMinorByCurrency: Record<string, string> };
}
function canonical(namespace: string, kind: Kind, sourceId: string): string {
  const hash = digest(JSON.stringify([namespace, kind, sourceId]));
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function denyBackup(value: string): void {
  if (value.split(/[\\/]/).some(part => /^backups?$/i.test(part))) throw new Error('Backup paths prohibited');
}
async function regularFile(root: string, filename: string): Promise<Buffer> {
  if (!/^[a-z][a-z0-9-]*\.json$/.test(filename)) throw new Error('Unsafe staging filename');
  const target = path.join(root, filename);
  const stat = await lstat(target);
  if (!stat.isFile()) throw new Error('Staging file must be regular, without symlinks');
  if (stat.size > 32 * 1024 * 1024) throw new Error('Staging file too large');
  const resolved = await realpath(target);
  denyBackup(resolved);
  if (path.dirname(resolved) !== root) throw new Error('Staging path escape');
  const bytes = await readFile(target);
  if (bytes.length > 32 * 1024 * 1024) throw new Error('Staging file too large');
  return bytes;
}

async function stagingRoot(stagingDirectory: string): Promise<string> {
  if (!path.isAbsolute(stagingDirectory)) throw new Error('Absolute staging directory required');
  denyBackup(stagingDirectory);
  // Reject symlink/junction components before opening any source file.
  let current = path.parse(stagingDirectory).root;
  for (const part of path.relative(current, path.resolve(stagingDirectory)).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Staging links prohibited');
  }
  const root = await realpath(stagingDirectory);
  denyBackup(root);
  return root;
}

/** Exact source bytes, including manifest; never returns source contents. */
export async function snapshotRecoverySource(stagingDirectory: string): Promise<Record<string, string>> {
  const root = await stagingRoot(stagingDirectory);
  const manifestBytes = await regularFile(root, 'manifest.json');
  const manifest = manifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')));
  const hashes: Record<string, string> = { 'manifest.json': digest(manifestBytes) };
  for (const entry of manifest.files) {
    const hash = digest(await regularFile(root, entry.file));
    if (hash !== entry.sha256) throw new Error('Staging checksum mismatch');
    hashes[entry.file] = hash;
  }
  return hashes;
}

/** Reads only explicitly supplied, already-extracted staging files. No environment access. */
export async function planRecovery(stagingDirectory: string): Promise<RecoveryReport> {
  const root = await stagingRoot(stagingDirectory);
  const manifestBytes = await regularFile(root, 'manifest.json');
  const manifest = manifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')));
  if (new Set(manifest.files.map(file => file.kind)).size !== 6 || new Set(manifest.files.map(file => file.file)).size !== 6 || manifest.files.some(file => file.file === 'manifest.json')) throw new Error('Duplicate manifest entries');
  const report: RecoveryReport = { version: 1, namespace: manifest.namespace, manifestHash: digest(manifestBytes), mode: 'dry-run', accepted: [], rejected: [], orphan: [], reconciliation: { sourceRows: 0, accepted: 0, rejected: 0, orphan: 0, royaltyMinorByCurrency: {} } };
  const maps = new Map<Kind, Map<string, CanonicalRecord>>();
  for (const kind of kinds) {
    const entry = manifest.files.find(file => file.kind === kind)!;
    const bytes = await regularFile(root, entry.file);
    if (digest(bytes) !== entry.sha256) throw new Error('Staging checksum mismatch');
    const rows: unknown = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(rows) || rows.length !== entry.rows) throw new Error('Staging row count mismatch');
    report.reconciliation.sourceRows += rows.length;
    const parsed = rows.map(row => schemas[kind].safeParse(row));
    const counts = new Map<string, number>();
    const identities = new Map<string, number>();
    for (const result of parsed) if (result.success) {
      counts.set(result.data.id, (counts.get(result.data.id) ?? 0) + 1);
      const data = result.data as Record<string, string>;
      for (const field of ['name', 'email']) if (data[field] && (kind === 'users' || kind === 'artists')) {
        const key = `${field}:${data[field].trim().toLowerCase()}`;
        identities.set(key, (identities.get(key) ?? 0) + 1);
      }
      if (kind === 'units') identities.set(data.ownerId!, (identities.get(data.ownerId!) ?? 0) + 1);
    }
    const map = new Map<string, CanonicalRecord>(); maps.set(kind, map);
    parsed.forEach((result, row) => {
      const issue = (reason: string): Issue => ({ kind, row: row + 1, reason });
      if (!result.success) { report.rejected.push(issue('INVALID_OR_FORBIDDEN_FIELDS')); return; }
      const data = result.data as Record<string, string>;
      if (counts.get(data.id!)! > 1) { report.rejected.push(issue('DUPLICATE_SOURCE_ID')); return; }
      if (['name', 'email'].some(field => data[field] && (identities.get(`${field}:${data[field].trim().toLowerCase()}`) ?? 0) > 1) || (kind === 'units' && identities.get(data.ownerId!)! > 1)) {
        report.rejected.push(issue('AMBIGUOUS_IDENTITY')); return;
      }
      const links: Partial<Record<Kind, [string, Kind]>> = { units: ['ownerId', 'users'], artists: ['unitId', 'units'], releases: ['artistId', 'artists'], tracks: ['releaseId', 'releases'], royalties: ['trackId', 'tracks'] };
      const output = { ...data }; delete output.id;
      const link = links[kind];
      let parent: CanonicalRecord | undefined;
      if (link) {
        parent = maps.get(link[1])?.get(data[link[0]]!);
        if (!parent) { report.orphan.push(issue(kind === 'units' ? 'UNRESOLVED_OWNER' : 'UNRESOLVED_PARENT')); return; }
        output[link[0]] = parent.canonicalId;
        output.ownerId = parent.kind === 'users' ? parent.canonicalId : parent.data.ownerId!;
        if (kind === 'tracks' || kind === 'royalties') output.artistId = parent.data.artistId!;
      }
      if (kind === 'users') output.requiresReauthentication = 'true';
      if (kind === 'artists') { output.managementMode = 'LABEL_CUSTOM_MANAGED'; output.artistUserId = 'NULL'; }
      const record = { kind, sourceId: data.id!, canonicalId: canonical(manifest.namespace, kind, data.id!), data: output };
      map.set(data.id!, record); report.accepted.push(record);
      if (kind === 'royalties') {
        const totals = report.reconciliation.royaltyMinorByCurrency;
        totals[data.currency!] = (BigInt(totals[data.currency!] ?? '0') + BigInt(data.amountMinor!)).toString();
      }
    });
  }
  Object.assign(report.reconciliation, { accepted: report.accepted.length, rejected: report.rejected.length, orphan: report.orphan.length });
  return report;
}
