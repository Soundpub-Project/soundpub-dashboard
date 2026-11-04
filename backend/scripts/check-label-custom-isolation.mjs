// Static Markdown command lint only. No env, subprocess, network or Docker access.
import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

export function inspect(text) {
  const findings = [];
  let fence = false;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    const commands = fence ? [line] : [...line.matchAll(/`([^`]+)`/g)].map(match => match[1]);
    for (const command of commands) {
      if (!/\b(?:docker(?:-compose)?|curl|wget|npm|node|Invoke-WebRequest|Invoke-RestMethod|Start-Process)\b/i.test(command)) continue;
      if (/\b8181\b/.test(command)) findings.push(`${index + 1}: forbidden port command`);
      if (/\bdocker\s+compose\b|\bdocker-compose\b/i.test(command)) {
        // Deliberately require literal approved prefix; env/project aliases are not proof.
        if (!/^\s*docker compose -p dashboard-sounpub-dev\s+/.test(command) ||
            /(?:--project-name\b|(?:^|\s)-p\s+(?!dashboard-sounpub-dev\b)|(?:^|\s)(?:-f|--file)\b|COMPOSE_FILE|[;&|])/.test(command)) {
          findings.push(`${index + 1}: unapproved/root compose command`);
        }
      }
    }
  }
  return findings;
}

if (process.argv.includes('--self-test')) {
  const block = command => '```sh\n' + command + '\n```';
  for (const command of ['docker compose up -d', 'docker-compose up', 'docker compose -f compose.yml up', 'docker compose -p other up', 'docker compose -p dashboard-sounpub-dev -f ../compose.yml up', 'curl http://localhost:8181', 'npm run dev -- --port 8181']) {
    assert.ok(inspect(block(command)).length, command);
  }
  assert.equal(inspect(block('docker compose -p dashboard-sounpub-dev config --quiet')).length, 0);
  assert.equal(inspect('Never touch port `8181`. No production actions.').length, 0);
  assert.ok(inspect('Run `docker compose up -d`.').length);
  console.log('PASS: 10 self-contained assertions; memory fixtures only');
} else {
  const directory = new URL('../../docs/backend/', import.meta.url);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.filter(entry => entry.isFile() && /^LABEL_CUSTOM.*\.md$/i.test(entry.name));
  const findings = [];
  for (const file of files) {
    const text = await readFile(new URL(file.name, directory), 'utf8');
    findings.push(...inspect(text).map(finding => `${file.name}:${finding}`));
  }
  // Only filenames and rule IDs are printed; never print source command contents.
  if (findings.length) { console.error(findings.join('\n')); process.exitCode = 1; }
  else console.log(`PASS: ${files.length} Label Custom Markdown files; static command lint only`);
}
