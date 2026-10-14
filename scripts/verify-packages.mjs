import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanPublic, scanText } from './scan-public.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await import('./build-sdk.mjs');
await scanPublic();
const destination = join(root, '.local', 'packages');
await mkdir(destination, { recursive: true });
const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
// Real tarballs, built and checked without registry access or lifecycle scripts.
const packed = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--workspaces', '--ignore-scripts', '--json', '--pack-destination', destination],
  { cwd: root, encoding: 'utf8' }));
const expected = new Set(['package/package.json', 'package/README.md', 'package/LICENSE', 'package/dist/index.js',
  'package/dist/index.d.ts', 'package/dist/transport.js', 'package/dist/options.d.ts']);
for (const item of packed) {
  const archive = gunzipSync(await readFile(join(destination, item.filename)), { maxOutputLength: 2 * 1024 * 1024 });
  const files = new Map();
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString().split('\0')[0];
    const prefix = header.subarray(345, 500).toString().split('\0')[0];
    const type = header[156];
    assert.ok(type === 0 || type === 48, 'Only regular files may be published.');
    assert.equal(prefix, '', 'Unexpected tar path prefix.');
    assert.ok(expected.has(name), `Unexpected tar member: ${name}`);
    assert.ok(!files.has(name), `Duplicate tar member: ${name}`);
    const size = Number.parseInt(header.subarray(124, 136).toString().replace(/\0/g, '').trim(), 8);
    assert.ok(Number.isSafeInteger(size) && size >= 0 && offset + 512 + size <= archive.length);
    const content = archive.subarray(offset + 512, offset + 512 + size);
    scanText(content.toString('utf8'), name);
    files.set(name, content);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.deepEqual(new Set(files.keys()), expected);
  const metadata = JSON.parse(files.get('package/package.json').toString());
  const product = metadata.name === '@ai-agent-huddle/once' ? 'once' : metadata.name === '@ai-agent-huddle/claim' ? 'claim' : null;
  assert.ok(product);
  assert.equal(metadata.private, undefined);
  assert.equal(metadata.scripts, undefined, 'Published packages must have no lifecycle scripts.');
  assert.equal(metadata.dependencies, undefined, 'SDK runtime must have no dependencies.');
  assert.match(metadata.version, /^\d+\.\d+\.\d+$/);
  assert.equal(metadata.publishConfig.access, 'public');
  assert.equal(metadata.exports['.'].import, './dist/index.js');
  assert.equal(metadata.exports['.'].types, './dist/index.d.ts');
  const extracted = join(destination, product);
  for (const [name, content] of files) {
    const target = join(extracted, name.slice('package/'.length));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const sdk = await import(pathToFileURL(join(extracted, 'dist/index.js')));
  const Client = product === 'once' ? sdk.OnceClient : sdk.ClaimClient;
  const client = new Client({ apiKey: 'synthetic-key', fetch: async () => new Response('{"secret":"do-not-echo"}', { status: 401 }) });
  await assert.rejects(product === 'once' ? client.get('sample/id') : client.status('sample/id'), error => error instanceof sdk.HuddleError && error.status === 401 && !JSON.stringify(error).includes('do-not-echo'));
  console.log(`Verified actual tarball: ${item.filename} (${files.size} allowed files).`);
}
assert.equal(packed.length, 2);
