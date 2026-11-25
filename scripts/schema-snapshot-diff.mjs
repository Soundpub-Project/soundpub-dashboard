import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const identifier = token => token?.type === 'word' || token?.type === 'quotedIdentifier';

function quotedStringEnd(sql, start, quote, backslashEscapes = false) {
  let index = start + 1;
  while (index < sql.length) {
    if (backslashEscapes && sql[index] === '\\') {
      index += 2;
      continue;
    }
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  throw new Error(`Unterminated ${quote === "'" ? 'string' : 'identifier'} at offset ${start}`);
}

function tokenizeStatements(sql) {
  const statements = [];
  let tokens = [];
  let index = 0;

  const push = (type, value) => tokens.push({ type, value });
  const finish = () => {
    if (tokens.length) statements.push(tokens);
    tokens = [];
  };

  while (index < sql.length) {
    const character = sql[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (sql.startsWith('--', index)) {
      const newline = sql.indexOf('\n', index + 2);
      index = newline < 0 ? sql.length : newline + 1;
      continue;
    }
    if (sql.startsWith('/*', index)) {
      const start = index;
      let depth = 1;
      index += 2;
      while (index < sql.length && depth) {
        if (sql.startsWith('/*', index)) {
          depth += 1;
          index += 2;
        } else if (sql.startsWith('*/', index)) {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      if (depth) throw new Error(`Unterminated block comment at offset ${start}`);
      continue;
    }
    if (character === ';') {
      finish();
      index += 1;
      continue;
    }
    if (character === "'") {
      const prefix = sql.slice(Math.max(0, index - 2), index);
      const backslashEscapes = /(?:^|[^a-z0-9_$])e$/i.test(prefix)
        || /u&$/i.test(prefix);
      const end = quotedStringEnd(sql, index, "'", backslashEscapes);
      push('string', sql.slice(index, end));
      index = end;
      continue;
    }
    if (character === '"') {
      const end = quotedStringEnd(sql, index, '"');
      push('quotedIdentifier', sql.slice(index, end));
      index = end;
      continue;
    }
    if (character === '$') {
      const opening = sql.slice(index).match(/^\$([a-z_][a-z0-9_]*)?\$/i);
      if (opening) {
        const tag = opening[0];
        const contentStart = index + tag.length;
        const closing = sql.indexOf(tag, contentStart);
        if (closing < 0) throw new Error(`Unterminated dollar-quoted string at offset ${index}`);
        push('dollarString', sql.slice(contentStart, closing));
        index = closing + tag.length;
        continue;
      }
    }

    const word = sql.slice(index).match(/^[a-z_][a-z0-9_$]*/i);
    if (word) {
      push('word', word[0].toLowerCase());
      index += word[0].length;
      continue;
    }
    const number = sql.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) {
      push('number', number[0].toLowerCase());
      index += number[0].length;
      continue;
    }
    const operator = sql.slice(index).match(/^[+\-*/<>=~!@#%^&|?:]+/);
    if (operator) {
      push('operator', operator[0]);
      index += operator[0].length;
      continue;
    }
    push('punctuation', character);
    index += 1;
  }
  finish();
  return statements;
}

function tokenText(tokens, normalizePolicyRoles = false) {
  const values = tokens.map(token => token.value);
  if (normalizePolicyRoles) {
    const toIndex = tokens.findIndex(token => token.type === 'word' && token.value === 'to');
    if (toIndex >= 0) {
      let depth = 0;
      let end = tokens.length;
      for (let index = toIndex + 1; index < tokens.length; index += 1) {
        const value = tokens[index].value;
        if (value === '(') depth += 1;
        else if (value === ')') depth -= 1;
        else if (depth === 0 && tokens[index].type === 'word' && ['using', 'with'].includes(value)) {
          end = index;
          break;
        }
      }
      const roleGroups = [];
      let current = [];
      for (let index = toIndex + 1; index < end; index += 1) {
        if (tokens[index].value === ',') {
          roleGroups.push(current);
          current = [];
        } else {
          current.push(values[index]);
        }
      }
      if (current.length) roleGroups.push(current);
      if (roleGroups.length > 1) {
        roleGroups.sort((left, right) => left.join(' ').localeCompare(right.join(' ')));
        values.splice(toIndex + 1, end - toIndex - 1, ...roleGroups.flatMap((group, index) => (
          index ? [',', ...group] : group
        )));
      }
    }
  }
  return values.join(' ');
}

function readName(tokens, start) {
  if (!identifier(tokens[start])) return null;
  const parts = [tokens[start]];
  let index = start + 1;
  while (tokens[index]?.value === '.' && identifier(tokens[index + 1])) {
    parts.push(tokens[index + 1]);
    index += 2;
  }
  const identifierName = token => token.type === 'quotedIdentifier'
    ? token.value.slice(1, -1).replaceAll('""', '"')
    : token.value;
  const name = parts.map(identifierName).join('.');
  return { name, next: index, schema: parts.length > 1 ? identifierName(parts.at(-2)) : null };
}

function findWord(tokens, value, start = 0) {
  return tokens.findIndex((token, index) => index >= start && token.type === 'word' && token.value === value);
}

function functionIdentity(tokens, keywordIndex) {
  const name = readName(tokens, keywordIndex + 1);
  if (!name) return null;
  return name.name;
}

function ownershipDescriptor(tokens, normalized) {
  if (tokens[0]?.value !== 'alter') return null;
  const ownerIndex = tokens.findLastIndex(token => token.type === 'word' && token.value === 'owner');
  if (ownerIndex < 0) return null;

  let type = tokens[1]?.value;
  let nameIndex = 2;
  if (type === 'materialized' || type === 'foreign') {
    type = `${type} ${tokens[2]?.value}`;
    nameIndex = 3;
  }
  if (type === 'table' && ['only', 'if', 'exists', 'not'].includes(tokens[nameIndex]?.value)) {
    while (['only', 'if', 'exists', 'not'].includes(tokens[nameIndex]?.value)) nameIndex += 1;
  }
  if (type === 'function' || type === 'procedure') {
    const name = functionIdentity(tokens, 1);
    return name ? { kind: 'ownership', id: `${type}:${name}`, normalized } : null;
  }
  if (!['table', 'schema', 'sequence', 'type', 'view', 'materialized view', 'index', 'foreign table'].includes(type)) {
    return null;
  }
  const name = readName(tokens, nameIndex);
  return name ? { kind: 'ownership', id: `${type}:${name.name}`, normalized } : null;
}

function descriptor(tokens) {
  const first = tokens[0]?.value;
  const second = tokens[1]?.value;
  const normalized = tokenText(tokens);

  if (first === 'set' || (first === 'select' && normalized.startsWith('select pg_catalog . set_config '))) {
    return null;
  }
  if (
    first === 'comment'
    || ['begin', 'commit', 'rollback'].includes(first)
    || (['create', 'alter'].includes(first) && second === 'database')
  ) return null;

  const ownership = ownershipDescriptor(tokens, normalized);
  if (ownership) return ownership;

  if (first === 'alter' && second === 'default') {
    return { kind: 'privilege', id: createHash('sha256').update(normalized).digest('hex'), normalized };
  }

  if (first === 'create' || first === 'alter') {
    const tableIndex = findWord(tokens, 'table', 1);
    if (tableIndex >= 0 && (second === 'table' || first === 'alter')) {
      let nameIndex = tableIndex + 1;
      while (['only', 'if', 'exists', 'not'].includes(tokens[nameIndex]?.value)) nameIndex += 1;
      const name = readName(tokens, nameIndex);
      if (name) return { kind: 'table', id: name.name, normalized };
    }
    const functionIndex = findWord(tokens, 'function', 1);
    if (functionIndex >= 0 && (first === 'alter' || second === 'function' || second === 'or')) {
      const signature = functionIdentity(tokens, functionIndex);
      if (signature) return { kind: 'function', id: signature, normalized };
    }
    const policyIndex = findWord(tokens, 'policy', 1);
    if (first === 'create' && policyIndex >= 0) {
      const policyName = readName(tokens, policyIndex + 1);
      const onIndex = findWord(tokens, 'on', policyIndex + 1);
      const tableName = onIndex >= 0 ? readName(tokens, onIndex + 1) : null;
      if (policyName && tableName) {
        return {
          kind: 'policy',
          id: `${tableName.name}.${policyName.name}`,
          normalized: tokenText(tokens, true),
        };
      }
    }
    const triggerIndex = findWord(tokens, 'trigger', 1);
    if (first === 'create' && triggerIndex >= 0) {
      const triggerName = readName(tokens, triggerIndex + 1);
      const onIndex = findWord(tokens, 'on', triggerIndex + 1);
      const tableName = onIndex >= 0 ? readName(tokens, onIndex + 1) : null;
      if (triggerName && tableName) {
        return { kind: 'trigger', id: `${tableName.name}.${triggerName.name}`, normalized };
      }
    }
    const indexIndex = findWord(tokens, 'index', 1);
    if (first === 'create' && indexIndex >= 0) {
      let nameIndex = indexIndex + 1;
      while (['concurrently', 'if', 'not', 'exists'].includes(tokens[nameIndex]?.value)) nameIndex += 1;
      const indexName = readName(tokens, nameIndex);
      if (indexName) {
        const onIndex = findWord(tokens, 'on', indexName.next);
        const tableName = onIndex >= 0 ? readName(tokens, onIndex + 1) : null;
        const fullName = indexName.name.includes('.') || !tableName?.schema
          ? indexName.name
          : `${tableName.schema}.${indexName.name}`;
        return { kind: 'index', id: fullName, normalized };
      }
    }
    if (second === 'schema') {
      const name = readName(tokens, 2);
      if (name) return { kind: 'schema', id: name.name, normalized };
    }
    if (second === 'type') {
      const name = readName(tokens, 2);
      if (name) return { kind: 'type', id: name.name, normalized };
    }
    if (second === 'sequence') {
      let nameIndex = 2;
      while (['if', 'not', 'exists'].includes(tokens[nameIndex]?.value)) nameIndex += 1;
      const name = readName(tokens, nameIndex);
      if (name) return { kind: 'sequence', id: name.name, normalized };
    }
    const viewIndex = second === 'view' ? 1 : second === 'materialized' && tokens[2]?.value === 'view' ? 2 : -1;
    if (viewIndex >= 0) {
      const name = readName(tokens, viewIndex + 1);
      if (name) return { kind: 'view', id: name.name, normalized };
    }
    if (first === 'create' && second === 'extension') {
      let nameIndex = 2;
      while (['if', 'not', 'exists'].includes(tokens[nameIndex]?.value)) nameIndex += 1;
      const name = readName(tokens, nameIndex);
      if (name) return { kind: 'extension', id: name.name, normalized };
    }
  }

  if (first === 'grant' || first === 'revoke') {
    return { kind: 'privilege', id: createHash('sha256').update(normalized).digest('hex'), normalized };
  }
  return { kind: 'other', id: createHash('sha256').update(normalized).digest('hex'), normalized };
}

function analyzeSql(sql) {
  const groups = new Map();
  for (const tokens of tokenizeStatements(sql)) {
    const item = descriptor(tokens);
    if (!item) continue;
    const key = `${item.kind}:${item.id}`;
    if (!groups.has(key)) groups.set(key, { kind: item.kind, id: item.id, statements: [] });
    groups.get(key).statements.push(item.normalized);
  }
  for (const group of groups.values()) group.statements.sort();
  return groups;
}

function compareSnapshots(backupSql, canonicalSql) {
  const backup = analyzeSql(backupSql);
  const canonical = analyzeSql(canonicalSql);
  const ownershipCount = groups => [...groups.values()]
    .filter(group => group.kind === 'ownership')
    .reduce((count, group) => count + group.statements.length, 0);
  const ownership = { backup: ownershipCount(backup), canonical: ownershipCount(canonical) };
  const keys = new Set([...backup.keys(), ...canonical.keys()]);
  const result = [];
  for (const key of [...keys].sort()) {
    const before = backup.get(key);
    const after = canonical.get(key);
    if ((before ?? after).kind === 'ownership') continue;
    const same = before && after
      && before.statements.length === after.statements.length
      && before.statements.every((statement, index) => statement === after.statements[index]);
    const sameIgnoringLineEndings = before && after
      && before.statements.length === after.statements.length
      && before.statements.every((statement, index) => (
        normalizeLineEndings(statement) === normalizeLineEndings(after.statements[index])
      ));
    result.push({
      key,
      kind: (before ?? after).kind,
      id: (before ?? after).id,
      status: same ? 'identical'
        : sameIgnoringLineEndings ? 'line-ending-only'
          : !before ? 'canonical-only'
            : !after ? 'backup-only' : 'changed',
    });
  }
  return { backup, canonical, result, ownership };
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--help') return { help: true };
    if (!['--backup-schema', '--canonical-schema'].includes(option)) {
      throw new Error(`Unknown option: ${option}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`);
    options[option] = value;
    index += 1;
  }
  if (!options['--backup-schema'] || !options['--canonical-schema']) {
    throw new Error('Both --backup-schema and --canonical-schema are required');
  }
  return options;
}

function summarize(comparison) {
  const counts = new Map();
  for (const item of comparison.result) {
    if (!counts.has(item.kind)) {
      counts.set(item.kind, {
        identical: 0,
        changed: 0,
        'line-ending-only': 0,
        'backup-only': 0,
        'canonical-only': 0,
      });
    }
    counts.get(item.kind)[item.status] += 1;
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, '\n');
}

function renderDifferences(comparison) {
  const groups = new Map();
  for (const item of comparison.result) {
    if (item.status === 'identical') continue;
    if (!groups.has(item.kind)) groups.set(item.kind, []);
    groups.get(item.kind).push(item);
  }
  if (!groups.size) return 'No object-level differences were found in the compared statement groups.';
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([kind, items]) => {
    const lines = ['changed', 'line-ending-only', 'backup-only', 'canonical-only'].flatMap(status => {
      const matches = items.filter(item => item.status === status);
      if (!matches.length) return [];
      if (['privilege', 'other'].includes(kind)) {
        return [`- ${status}: ${matches.length} statement group(s); SQL not emitted`];
      }
      const ids = matches.slice(0, 30).map(item => `\`${item.id}\``).join(', ');
      const suffix = matches.length > 30 ? `, … (+${matches.length - 30})` : '';
      return [`- ${status}: ${ids}${suffix}`];
    });
    return `### ${kind}\n\n${lines.join('\n')}`;
  }).join('\n\n');
}

function renderReport(backupPath, canonicalPath, backupSql, canonicalSql, comparison) {
  const summary = summarize(comparison);
  const rows = summary.map(([kind, values]) => (
    `| ${kind} | ${values.identical} | ${values.changed} | ${values['line-ending-only']} | ${values['backup-only']} | ${values['canonical-only']} |`
  )).join('\n');
  const hash = value => createHash('sha256').update(value).digest('hex');
  const totalDifferences = comparison.result.filter(item => ['changed', 'backup-only', 'canonical-only'].includes(item.status)).length;
  const lineEndingOnly = comparison.result.filter(item => item.status === 'line-ending-only').length;
  const schemaGroups = groups => [...groups.values()].filter(group => group.kind !== 'ownership');
  const groupCount = groups => schemaGroups(groups).length;
  const statementCount = groups => schemaGroups(groups)
    .reduce((count, group) => count + group.statements.length, 0);
  return `# Local schema snapshot comparison

Status: **STATIC STATEMENT COMPARISON — NOT PROOF OF APPLIED STATE OR MIGRATION READINESS**

- Backup schema input: \`${path.basename(backupPath)}\` (SHA-256 \`${hash(backupSql)}\`)
- Canonical schema input: \`${path.basename(canonicalPath)}\` (SHA-256 \`${hash(canonicalSql)}\`)
- Object groups analyzed: backup ${groupCount(comparison.backup)}, canonical ${groupCount(comparison.canonical)}
- Statements analyzed: backup ${statementCount(comparison.backup)}, canonical ${statementCount(comparison.canonical)}
- Object groups with substantive textual differences: ${totalDifferences}
- Groups differing only by LF/CRLF encoding: ${lineEndingOnly}

The comparison ignores comments, session setup commands, transaction wrappers, and owner statements. The backup schema SQL was reconstructed from custom-dump TOC \`defn\` fields, which omit the separate owner metadata; owner parity therefore cannot be inferred from this comparison. It normalizes unquoted SQL keywords/identifiers, whitespace, and role order in policy \`TO\` clauses, while preserving quoted values and dollar-quoted function bodies. LF/CRLF-only matches are reported separately as candidates, not assumed semantically equivalent. Reported differences do not include SQL text, function bodies, or literal values. This is not a PostgreSQL parser and cannot establish semantic equivalence, migration application history, data integrity, or runtime behavior.

## Object-level comparison

| Object kind | Identical | Changed | LF/CRLF-only | Backup-only | Canonical-only |
|---|---:|---:|---:|---:|---:|
${rows}

Owner statements in SQL inputs: backup ${comparison.ownership.backup}, canonical ${comparison.ownership.canonical}. The backup TOC carries owner metadata separately, so the owner statement count is not comparable. Privilege and unclassified-statement details are summarized by count to avoid printing SQL text.

## Difference inventory

${renderDifferences(comparison)}
`;
}

async function main(args) {
  const options = parseArguments(args);
  if (options.help) {
    process.stdout.write('Usage: node scripts/schema-snapshot-diff.mjs --backup-schema <schema.sql> --canonical-schema <schema.sql>\n');
    return;
  }
  const backupPath = path.resolve(options['--backup-schema']);
  const canonicalPath = path.resolve(options['--canonical-schema']);
  const backupSql = readFileSync(backupPath, 'utf8');
  const canonicalSql = readFileSync(canonicalPath, 'utf8');
  const comparison = compareSnapshots(backupSql, canonicalSql);
  process.stdout.write(renderReport(backupPath, canonicalPath, backupSql, canonicalSql, comparison));
}

if (path.resolve(process.argv[1] ?? '') === scriptPath) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export { analyzeSql, compareSnapshots, tokenizeStatements };
