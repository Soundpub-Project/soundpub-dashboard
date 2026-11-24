import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [dumpPathArg, sqlPathArg, reportPathArg] = process.argv.slice(2);
if (!dumpPathArg || !sqlPathArg || !reportPathArg) {
  throw Error('Usage: node scripts/inspect-pg-custom-dump.mjs <dump> <schema-sql-out> <report-out>');
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dumpPath = path.resolve(dumpPathArg);
const sqlPath = path.resolve(sqlPathArg);
const reportPath = path.resolve(reportPathArg);

function isInside(target, parent) {
  const relative = path.relative(parent, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isOneDrive(target) {
  return target.split(path.sep).some(part => /^onedrive/i.test(part));
}

for (const output of [sqlPath, reportPath]) {
  assert.ok(!isInside(output, repoRoot) && output !== repoRoot, 'Outputs must be outside the repository');
  assert.ok(!isOneDrive(output), 'Outputs must be outside OneDrive');
  assert.ok(!existsSync(output), `Refusing to overwrite ${output}`);
}

const buffer = readFileSync(dumpPath);
assert.equal(buffer.toString('ascii', 0, 5), 'PGDMP', 'Not a PostgreSQL custom dump');
let pos = 5;

const major = buffer[pos++];
const minor = buffer[pos++];
const revision = buffer[pos++];
const version = (major * 256 + minor) * 256 + revision;
const intSize = buffer[pos++];
const offSize = version >= 0x010700 ? buffer[pos++] : intSize;
const format = buffer[pos++];
assert.equal(format, 1, 'Not a custom-format dump');

class Reader {
  constructor(buf, start) {
    this.buf = buf;
    this.pos = start;
  }
  byte() {
    return this.buf[this.pos++];
  }
  int() {
    const sign = version > 0x010000 ? this.byte() : 0;
    let value = 0;
    for (let i = 0; i < intSize; i += 1) value += this.buf[this.pos++] * 2 ** (8 * i);
    return sign ? -value : value;
  }
  str() {
    const length = this.int();
    if (length < 0) return null;
    const value = this.buf.toString('utf8', this.pos, this.pos + length);
    this.pos += length;
    return value;
  }
  offset() {
    const state = this.byte();
    let value = 0;
    for (let i = 0; i < offSize; i += 1) value += this.buf[this.pos++] * 2 ** (8 * i);
    return { state, value };
  }
}

const reader = new Reader(buffer, pos);
let compressionAlgorithm = 1;
if (version >= 0x010f00) compressionAlgorithm = reader.byte();
else if (version >= 0x010200) {
  const level = version <= 0x010300 ? reader.byte() : reader.int();
  compressionAlgorithm = level ? 1 : 0;
}
const created = [];
if (version >= 0x010400) {
  for (let i = 0; i < 7; i += 1) created.push(reader.int());
}
const database = version >= 0x010400 ? reader.str() : null;
const remoteVersion = version >= 0x010a00 ? reader.str() : null;
const dumpVersion = version >= 0x010a00 ? reader.str() : null;
const tocCount = reader.int();
const entries = [];

for (let i = 0; i < tocCount; i += 1) {
  const dumpId = reader.int();
  const hadDumper = Boolean(reader.int());
  const tableoid = version >= 0x010800 ? reader.str() : null;
  const oid = reader.str();
  const tag = reader.str();
  const desc = reader.str();
  const section = version >= 0x010b00 ? reader.int() : null;
  const defn = reader.str();
  const dropStmt = reader.str();
  const copyStmt = version >= 0x010300 ? reader.str() : null;
  const namespace = version >= 0x010600 ? reader.str() : null;
  const tablespace = version >= 0x010a00 ? reader.str() : null;
  const tableam = version >= 0x010e00 ? reader.str() : null;
  const relkind = version >= 0x011000 ? String.fromCharCode(reader.int()) : null;
  const owner = reader.str();
  const withOids = version >= 0x010900 ? reader.str() : null;
  const dependencies = [];
  if (version >= 0x010500) {
    for (;;) {
      const dependency = reader.str();
      if (dependency === null) break;
      dependencies.push(Number(dependency));
    }
  }
  const dataOffset = version >= 0x010700 ? reader.offset() : { state: reader.int(), value: 0 };
  entries.push({ dumpId, hadDumper, tableoid, oid, tag, desc, section, defn, dropStmt, copyStmt, namespace, tablespace, tableam, relkind, owner, withOids, dependencies, dataOffset });
}

const byDesc = new Map();
for (const entry of entries) {
  const desc = entry.desc ?? 'UNKNOWN';
  byDesc.set(desc, (byDesc.get(desc) ?? 0) + 1);
}

const scoped = entries.filter(entry => entry.namespace === 'soundpub');
const scopedTables = scoped.filter(entry => entry.desc === 'TABLE');
const scopedFunctions = scoped.filter(entry => entry.desc === 'FUNCTION');
const scopedPolicies = scoped.filter(entry => entry.desc === 'POLICY');
const scopedTriggers = scoped.filter(entry => entry.desc === 'TRIGGER');
const scopedIndexes = scoped.filter(entry => entry.desc === 'INDEX');
const scopedConstraints = scoped.filter(entry => (entry.desc ?? '').includes('CONSTRAINT'));
const scopedForeignKeys = scoped.filter(entry => entry.desc === 'FK CONSTRAINT');
const scopedTypes = scoped.filter(entry => entry.desc === 'TYPE');
const scopedRowSecurity = scoped.filter(entry => entry.desc === 'ROW SECURITY');
const rlsEnabled = scopedRowSecurity.length;

const schemaSql = entries
  .filter(entry => entry.defn && entry.desc !== 'TABLE DATA' && entry.desc !== 'BLOBS')
  .map(entry => entry.defn)
  .join('\n\n');
writeFileSync(sqlPath, schemaSql);

const comparisons = [
  ['Tables', 33, scopedTables.length],
  ['Functions', 56, scopedFunctions.length],
  ['Policies', 78, scopedPolicies.length],
  ['Non-internal table triggers', 47, scopedTriggers.length],
  ['Foreign keys', 43, scopedForeignKeys.length],
  ['Enums', 4, scopedTypes.length],
  ['ROW SECURITY entries', 32, rlsEnabled],
  ['Explicit INDEX TOC entries', null, scopedIndexes.length],
  ['Constraint TOC entries', null, scopedConstraints.length],
];

const rows = comparisons.map(([name, reference, actual]) => {
  const result = reference === null ? 'NOT DIRECTLY COMPARABLE' : reference === actual ? 'PASS' : 'DIFF';
  return `| ${name} | ${reference ?? '—'} | ${actual} | ${result} |`;
}).join('\n');

const names = (label, list) => `- ${label}: ${list.length} — ${list.map(entry => entry.tag).sort().join(', ') || '—'}`;

const report = `# Backup Schema Metadata

Generated: ${new Date().toISOString()}

Source: decrypted \`soundpub-schema.dump.enc\` from the verified 2026-10-30 backup. No row data, Auth sessions, refresh tokens, or Storage files were decrypted. The source dump and outputs stayed outside the repository and OneDrive.

## Archive header

| Field | Value |
|---|---|
| Archive version | ${major}.${minor}-${revision} |
| Integer size | ${intSize} |
| Offset size | ${offSize} |
| Format | ${format} (custom) |
| Compression algorithm | ${compressionAlgorithm} |
| Database | ${database ?? '—'} |
| Remote version | ${remoteVersion ?? '—'} |
| Dump version | ${dumpVersion ?? '—'} |
| TOC entries | ${tocCount} |
| SHA-256 of decrypted dump | ${createHash('sha256').update(buffer).digest('hex')} |

## Counts versus inspected live manifest

| Object | Reference | Backup dump | Result |
|---|---:|---:|---|
${rows}

## Scoped object names

${names('Tables', scopedTables)}
${names('Functions', scopedFunctions)}
${names('Policies', scopedPolicies)}
${names('Triggers', scopedTriggers)}
${names('Indexes', scopedIndexes)}
${names('Constraints', scopedConstraints)}

## TOC breakdown

| Description | Count |
|---|---:|
${[...byDesc.entries()].sort().map(([desc, count]) => `| ${desc} | ${count} |`).join('\n')}

## Limitations

- This is metadata extracted from the custom dump TOC, not a restored database.
- Counts use object descriptions and \`soundpub\` namespace; overloaded functions, ACL items, comments, and extension-owned objects may affect comparisons.
- Manifest index and constraint totals include inline and constraint-backed objects, while this report counts explicit TOC entries; those two rows are not directly comparable.
- Definition equivalence, grants, function bodies, RLS expressions, defaults, constraints, and behavior still require a formal diff against repository migrations.
- This report does not authorize restore, migration replay, production contact, or cutover.
`;
writeFileSync(reportPath, report);
process.stdout.write(`Wrote ${sqlPath}\nWrote ${reportPath}\n`);
