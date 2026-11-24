import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const supabaseDir = path.join(root, 'supabase', 'migrations');
const backendDir = path.join(root, 'backend', 'migrations');
const outIndex = process.argv.indexOf('--out');
const outputFile = outIndex >= 0 ? process.argv[outIndex + 1] : null;

function listSql(dir) {
  return readdirSync(dir).filter(file => file.endsWith('.sql')).sort();
}

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function stripComments(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

function stripSql(input) {
  return stripComments(input)
    .replace(/\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, ' $BODY$ ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' $BODY$ ');
}

function cleanName(name) {
  return String(name).replace(/"/g, '').toLowerCase();
}

function matches(text, pattern) {
  return Array.from(text.matchAll(pattern)).length;
}

function versionInfo(files, pattern) {
  const versions = files.map(file => file.match(pattern)?.[1] ?? null);
  const counts = new Map();
  for (const version of versions) {
    if (version) counts.set(version, (counts.get(version) ?? 0) + 1);
  }
  const widths = new Map();
  for (const version of versions) {
    if (!version) continue;
    widths.set(version.length, (widths.get(version.length) ?? 0) + 1);
  }
  return {
    duplicates: [...counts.entries()].filter(([, count]) => count > 1).map(([version, count]) => `${version} (${count})`),
    missing: versions.filter(version => !version).length,
    widths: [...widths.entries()].sort(([a], [b]) => a - b).map(([width, count]) => `${width}:${count}`),
  };
}

const patterns = [
  ['table', /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:([a-z0-9_]+)\.)?((?:"[^"]+"|[a-z0-9_]+))/gi, 2],
  ['alteredTable', /\balter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:([a-z0-9_]+)\.)?((?:"[^"]+"|[a-z0-9_]+))/gi, 2],
  ['index', /\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?((?:"[^"]+"|[a-z0-9_]+))/gi, 1],
  ['policy', /\bcreate\s+policy\s+((?:"[^"]+"|[a-z0-9_]+))/gi, 1],
  ['function', /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:([a-z0-9_]+)\.)?((?:"[^"]+"|[a-z0-9_]+))\s*\(/gi, 2],
  ['trigger', /\bcreate\s+(?:constraint\s+)?trigger\s+((?:"[^"]+"|[a-z0-9_]+))/gi, 1],
];

function scan(files) {
  const names = Object.fromEntries(patterns.map(([kind]) => [kind, new Set()]));
  const counts = Object.fromEntries(patterns.map(([kind]) => [kind, 0]));
  const flags = { dynamic: 0, defaultPrivileges: 0, transactionControl: 0, psqlMeta: 0 };
  const hashes = [];
  for (const file of files) {
    hashes.push({ file, sha256: hashFile(path.join(root, file)) });
    const plain = stripComments(readFileSync(path.join(root, file), 'utf8'));
    const text = stripSql(plain);
    for (const [kind, pattern, nameIndex] of patterns) {
      for (const match of text.matchAll(pattern)) {
        counts[kind] += 1;
        names[kind].add(cleanName(match[nameIndex]));
      }
    }
    flags.dynamic += matches(plain, /\bdo\s*\$\$/gi) + matches(plain, /\b(?:execute|exec)\s+format\b/gi);
    flags.defaultPrivileges += matches(plain, /\balter\s+default\s+privileges\b/gi);
    flags.transactionControl += matches(text, /\b(?:begin|commit|rollback)\b/gi);
    flags.psqlMeta += matches(text, /^\s*\\/gmi);
  }
  names.tables = new Set([...names.table, ...names.alteredTable]);
  return { counts, names, flags, hashes };
}

function sorted(set) {
  return [...set].sort();
}

function compare(a, b) {
  const both = sorted(a).filter(value => b.has(value));
  const onlyA = sorted(a).filter(value => !b.has(value));
  const onlyB = sorted(b).filter(value => !a.has(value));
  return { both, onlyA, onlyB };
}

function renderList(values, limit = 25) {
  if (!values.length) return '—';
  const shown = values.slice(0, limit).map(value => `\`${value}\``).join(', ');
  return values.length > limit ? `${shown}, … (+${values.length - limit})` : shown;
}

function inventory(label, files, info, scanned) {
  const checksums = scanned.hashes.map(item => `\`${item.file}\` \`${item.sha256.slice(0, 12)}…\``).join('\n');
  return `### ${label}\n\n- Files: ${files.length}\n- Version widths: ${info.widths.join(', ') || '—'}\n- Missing versions: ${info.missing}\n- Duplicate versions: ${renderList(info.duplicates)}\n- SHA-256 manifest entries: ${scanned.hashes.length}\n\n<details>\n<summary>Checksums</summary>\n\n${checksums}\n\n</details>\n`;
}

function statementTable(supabase, backend) {
  const rows = patterns.map(([kind]) => `| ${kind} | ${supabase.counts[kind]} | ${backend.counts[kind]} |`).join('\n');
  return `| Object pattern | Supabase | Backend |\n|---|---:|---:|\n${rows}\n`;
}

function compareSection(title, supabaseSet, backendSet) {
  const result = compare(supabaseSet, backendSet);
  return `### ${title}\n\n- Both: ${result.both.length} — ${renderList(result.both)}\n- Supabase only: ${result.onlyA.length} — ${renderList(result.onlyA)}\n- Backend only: ${result.onlyB.length} — ${renderList(result.onlyB)}\n`;
}

const supabaseFiles = listSql(supabaseDir);
const backendFiles = listSql(backendDir);
const supabaseInfo = versionInfo(supabaseFiles, /^(\d{8}|\d{14})_/);
const backendInfo = versionInfo(backendFiles, /^(\d{4})_/);
const supabase = scan(supabaseFiles.map(file => path.join('supabase', 'migrations', file)));
const backend = scan(backendFiles.map(file => path.join('backend', 'migrations', file)));

const report = `# 14 — Static Migration Diff\n\nStatus: **NON-AUTHORITATIVE REPOSITORY-ONLY COMPARISON**\n\nGenerated: ${new Date().toISOString()}\n\nNo database, backup key, decrypted data, production host, or Docker container was used. This report compares SQL text only. It does not prove that migrations were applied, that final schema definitions are equivalent, or that effective privileges match.\n\n## Inventory\n\n${inventory('supabase/migrations', supabaseFiles, supabaseInfo, supabase)}\n${inventory('backend/migrations', backendFiles, backendInfo, backend)}\n## Statement counts\n\n${statementTable(supabase, backend)}\n## Name-level comparison\n\n${compareSection('Tables seen in CREATE or ALTER TABLE', supabase.names.tables, backend.names.tables)}\n${compareSection('CREATE TABLE names', supabase.names.table, backend.names.table)}\n${compareSection('Indexes', supabase.names.index, backend.names.index)}\n${compareSection('Policies', supabase.names.policy, backend.names.policy)}\n${compareSection('Functions', supabase.names.function, backend.names.function)}\n${compareSection('Triggers', supabase.names.trigger, backend.names.trigger)}\n## Dynamic or unresolved SQL\n\n| Signal | Supabase | Backend |\n|---|---:|---:|\n| DO block or EXECUTE format | ${supabase.flags.dynamic} | ${backend.flags.dynamic} |\n| ALTER DEFAULT PRIVILEGES | ${supabase.flags.defaultPrivileges} | ${backend.flags.defaultPrivileges} |\n| Transaction-control tokens | ${supabase.flags.transactionControl} | ${backend.flags.transactionControl} |\n| psql meta commands | ${supabase.flags.psqlMeta} | ${backend.flags.psqlMeta} |\n\nDynamic ACL/trigger generation, function bodies, RLS expressions, defaults, constraints, and final object state remain unresolved by static text comparison.\n\n## Interpretation\n\n- Supabase migration files use mixed 8-digit and 14-digit prefixes with duplicate day prefixes; filesystem order is not a durable ledger.\n- Backend migrations use contiguous four-digit versions with runner-enforced unique filenames and checksums.\n- Name overlap does not prove definition equivalence, and name absence does not prove behavioral absence because function bodies, policies, and grants may be created dynamically.\n- Existing \`docs/migration/CANONICAL_SCHEMA.sql\` and \`docs/migration/DATABASE_OBJECT_MANIFEST.md\` remain the authoritative inspected schema snapshot for object counts; this report does not replace them.
\n\n## Gates after the backup key arrives\n\n1. Run the read-only verifier and require \`Verified 24 files\`.\n2. Decrypt only the schema artifact to an explicit output outside the repository and OneDrive.\n3. Produce a schema-only metadata view and compare it against \`CANONICAL_SCHEMA.sql\`, \`supabase/migrations\`, and \`backend/migrations\`.\n4. Use isolated PostgreSQL only if SQL execution is required for definition-level or data-level verification.\n5. Do not treat this static report as approval for restore, migration replay, or cutover.\n`;

process.stdout.write(report);
if (outputFile) {
  writeFileSync(path.resolve(root, outputFile), report);
  process.stderr.write(`Wrote ${outputFile}\n`);
}
