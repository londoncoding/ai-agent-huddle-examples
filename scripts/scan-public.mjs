import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Values are never printed. Tests use deliberately short synthetic credentials.
export function scanText(content, path) {
  const patterns = [
    /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/,
    /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{24,}/,
    /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /https?:\/\/[^\s/]+\.supabase\.co\b/i,
    /(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|PGPASSWORD)\s*[:=]\s*[^\s]+/,
    /(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|FUNCTION|POLICY)|ALTER\s+TABLE)\s+(?:once|claim)\./i
  ];
  if (patterns.some(pattern => pattern.test(content))) throw new Error(`Public-content scan failed: ${path}. Inspect locally; no matching value is logged.`);
}
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.local', 'work', 'dist'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${path}`);
    if (entry.isDirectory()) await walk(path);
    else if (!entry.name.endsWith('.tgz')) {
      if (entry.name.startsWith('.env') && entry.name !== '.env.example') throw new Error('Private environment file present. Remove it from the release checkout.');
      scanText(await readFile(path, 'utf8'), path);
    }
  }
}
export async function scanPublic() {
  await walk(fileURLToPath(new URL('../', import.meta.url)));
  console.log('Public-content scan passed. This heuristic does not replace review.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await scanPublic();
