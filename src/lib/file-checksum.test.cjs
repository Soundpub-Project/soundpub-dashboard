const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, 'fileChecksum.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exportsObject = {};
vm.runInNewContext(output, { exports: exportsObject, require }, { filename: sourcePath });

(async () => {
  const bytes = crypto.randomBytes(9 * 1024 * 1024 + 17);
  const slices = [];
  const file = {
    size: bytes.length,
    slice(start, end) {
      slices.push([start, end]);
      return new Blob([bytes.subarray(start, end)]);
    },
  };
  const digest = await exportsObject.sha256File(file);
  assert.equal(digest, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(slices, [[0, 4 * 1024 * 1024], [4 * 1024 * 1024, 8 * 1024 * 1024], [8 * 1024 * 1024, bytes.length]]);
  assert.equal(source.includes('file.arrayBuffer()'), false);
  assert(source.includes("await import('hash-wasm')"));
  console.log('Chunked browser SHA-256 matches Node and never buffers full file.');
})().catch(error => { console.error(error); process.exitCode = 1; });
