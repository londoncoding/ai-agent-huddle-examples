import { mkdir, copyFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const product of ['once', 'claim']) {
  const directory = join(root, 'packages', product);
  // Only generated files in the fixed package dist directory are removed.
  const dist = join(directory, 'dist');
  await mkdir(dist, { recursive: true });
  for (const entry of await readdir(dist, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error('Unexpected directory in dist. Inspect before building.');
    await rm(join(dist, entry.name));
  }
  await copyFile(join(directory, 'src', 'index.mjs'), join(dist, 'index.js'));
  await copyFile(join(directory, 'src', 'index.d.ts'), join(dist, 'index.d.ts'));
  await copyFile(join(root, 'sdk', 'transport.mjs'), join(dist, 'transport.js'));
  await copyFile(join(root, 'sdk', 'options.d.ts'), join(dist, 'options.d.ts'));
  await copyFile(join(root, 'LICENSE'), join(directory, 'LICENSE'));
}
console.log('Built two public HTTP clients.');
