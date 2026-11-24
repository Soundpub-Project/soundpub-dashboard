import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lineRules = [
  ['xendit-live-secret', /xnd_production_[A-Za-z0-9]{20,}/],
  ['xendit-webhook-token', /O5Bc[A-Za-z0-9]{20,}/],
  ['supabase-jwt', /eyJhbGciOi[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/],
  ['database-url-password', /postgresql:\/\/[^:\/\s]+:(?![<\$\`{])(?!(?:your|example|test|sample|dummy|password|secret|change|postgres)[-_])[^@\s\$\`{}]{8,}@/],
];

const contentRules = [
  ['private-key', /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----[\s\S]{40,}?-----END (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/],
];

const files = [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean))];

const findings = [];
for (const relative of files) {
  const absolute = resolve(relative);
  let content;
  try {
    content = readFileSync(absolute, 'utf8');
  } catch {
    continue;
  }
  if (content.includes('\0') || content.length > 5_000_000) continue;

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const safeDatabaseContext = line.length > 500 || /test|fixture|recovery|review|localhost|127\.0\.0\.1|\$\{|your-|example|sample|dummy|password|secret|change/i.test(line);
    for (const [name, pattern] of lineRules) {
      if (name === 'database-url-password' && safeDatabaseContext) continue;
      if (pattern.test(line)) findings.push(`${relative}:${index + 1} ${name}`);
    }
  });

  for (const [name, pattern] of contentRules) {
    const match = content.match(pattern);
    if (!match) continue;
    const line = content.slice(0, match.index).split(/\r?\n/).length;
    findings.push(`${relative}:${line} ${name}`);
  }
}

if (findings.length) {
  console.error(`Secret scan failed with ${findings.length} finding(s):`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(`Secret scan passed: ${files.length} non-ignored files, 0 findings.`);
