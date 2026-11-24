import assert from 'node:assert/strict';
import { createDecipheriv, createHash } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [keyFile, relativeInput, outputPath] = process.argv.slice(2);
if (!keyFile || !relativeInput || !outputPath) {
  throw Error('Usage: node scripts/backup-decrypt-safe.mjs <key-file> <relative-artifact.enc> <output-outside-repo-and-onedrive>');
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backupRoot = process.env.BACKUP_ROOT
  ? path.resolve(process.env.BACKUP_ROOT)
  : path.join(repoRoot, 'backend', 'backups', 'soundpub-20.20.20.173-20261030-212240');
const manifestPath = path.join(backupRoot, 'SHA256SUMS.txt');
const input = path.resolve(backupRoot, relativeInput);
const output = path.resolve(outputPath);

function isInside(target, parent) {
  const relative = path.relative(parent, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isOneDrive(target) {
  return target.split(path.sep).some(part => /^onedrive/i.test(part));
}

function manifestHashes() {
  const hashes = new Map();
  for (const line of readFileSync(manifestPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf('  ');
    assert.ok(separator > 0, `Malformed manifest line: ${line}`);
    hashes.set(line.slice(separator + 2).trim(), line.slice(0, separator).trim().toLowerCase());
  }
  return hashes;
}

async function verifyCipherHash(file, expected) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  assert.equal(digest.digest('hex'), expected, `Cipher hash mismatch: ${relativeInput}`);
}

assert.ok(isInside(input, backupRoot), 'Artifact must be inside the copied backup directory');
assert.ok(!isInside(output, repoRoot) && output !== repoRoot, 'Output must be outside the repository');
assert.ok(!isInside(output, backupRoot) && output !== backupRoot, 'Output must be outside the backup directory');
assert.ok(!isOneDrive(output), 'Output must be outside OneDrive');
assert.ok(existsSync(path.dirname(output)), 'Output parent directory must already exist');
assert.ok(!existsSync(output), `Refusing to overwrite ${output}`);
assert.ok(relativeInput.endsWith('.enc'), 'Artifact must end with .enc');

const key = readFileSync(keyFile);
assert.equal(key.length, 32, 'Invalid key length');

const expectedHash = manifestHashes().get(relativeInput.replace(/\\/g, '/'));
assert.ok(expectedHash, `Artifact not listed in SHA256SUMS.txt: ${relativeInput}`);
await verifyCipherHash(input, expectedHash);

const size = statSync(input).size;
assert.ok(size >= 33, 'Encrypted artifact is truncated');
const header = Buffer.alloc(17);
const tag = Buffer.alloc(16);
const fd = openSync(input, 'r');
try {
  readSync(fd, header, 0, 17, 0);
  readSync(fd, tag, 0, 16, size - 16);
} finally {
  closeSync(fd);
}
assert.equal(header.toString('ascii', 0, 5), 'SPBK1', 'Invalid backup header');

const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(5, 17));
decipher.setAuthTag(tag);
try {
  await pipeline(
    createReadStream(input, { start: 17, end: size - 17 }),
    decipher,
    createWriteStream(output, { flags: 'wx' }),
  );
} catch (error) {
  if (existsSync(output)) unlinkSync(output);
  throw error;
}
process.stdout.write(`${output}\n`);
