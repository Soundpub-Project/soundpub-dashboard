const assert = require('node:assert/strict');
const ts = require('typescript');
const { readFileSync, readdirSync } = require('node:fs');
const { join, resolve, dirname } = require('node:path');
const root = resolve(__dirname, '..');
const seen = new Set();
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /supabase|\/rest\/v1|\/functions\/v1|xendit\.co/i, file);
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function walk(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier?.text;
      if (specifier?.startsWith('.') || specifier?.startsWith('@/')) {
        const base = specifier.startsWith('@/') ? resolve(root, 'src', specifier.slice(2)) : resolve(dirname(file), specifier);
        const target = ts.resolveModuleName(base, file, { moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true }, ts.sys).resolvedModule;
        assert.ok(target, `Unresolved financial import: ${specifier}`);
        visit(target.resolvedFileName);
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(tree);
}
for (const name of ['royalties', 'payouts', 'payments', 'balance']) visit(join(root, 'src/api', `${name}.ts`));
for (const name of readdirSync(join(root, 'src/components/finance'))) {
  if (/\.tsx?$/.test(name)) {
    const file = join(root, 'src/components/finance', name);
    assert.doesNotMatch(readFileSync(file, 'utf8'), /supabase|\/rest\/v1|\/functions\/v1|xendit\.co/i, file);
  }
}
console.log(`Financial API import graph: ${seen.size} files, zero Supabase/provider references; finance component sources clean. Shared UI/auth graph and runtime browser egress require separate evidence.`);
