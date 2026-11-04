import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['node_modules', 'dist', '.env']);
const textExtensions = new Set(['.ts', '.js', '.mjs', '.json', '.sql', '.md', '.yml', '.yaml', '.example', '']);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:service_role|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["']?[A-Za-z0-9._-]{20,}/i,
  /\b(?:SPOTIFY_CLIENT_SECRET|XENDIT_SECRET_KEY|SMTP_PASS(?:WORD)?)\s*[:=]\s*["']?[^$\s{][^\s"']{7,}/i,
];
const forbiddenTargets = /(?:20\.20\.20\.(?:3|173)|supabase\.carubra\.(?:space|com))/i;
const targetAllowlist = new Set(['src/config/index.ts', 'test/config.test.ts', 'test/orphan-repair.test.ts']);
const findings = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name === 'package-lock.json') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (textExtensions.has(extname(entry.name))) {
      const local = relative(root, path).replaceAll('\\', '/');
      const content = await readFile(path, 'utf8');
      for (const pattern of secretPatterns) if (pattern.test(content)) findings.push(`${local}: secret-like value`);
      if (forbiddenTargets.test(content) && !targetAllowlist.has(local)) findings.push(`${local}: forbidden production target`);
    }
  }
}

await walk(root);
if (findings.length) {
  console.error(findings.join('\n'));
  process.exit(1);
}
console.log('Isolation and secret scan passed');


