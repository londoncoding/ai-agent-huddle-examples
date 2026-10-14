import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isolatedEnvironment } from './environment.mjs';
test('local verifier cannot inherit production database, queue, secrets or runtime injection', () => {
  const env = isolatedEnvironment('scratch', { PATH: 'runtime-path', SystemRoot: 'runtime-root',
    DB_TYPE: 'postgresdb', DB_POSTGRESDB_HOST: 'production-host', DB_POSTGRESDB_PASSWORD: 'private-password',
    EXECUTIONS_MODE: 'queue', QUEUE_BULL_REDIS_HOST: 'production-queue', N8N_LICENSE_ACTIVATION_KEY: 'private-license',
    N8N_ENCRYPTION_KEY: 'private-key', CLAIM_API_KEY: 'private-api-key', NODE_OPTIONS: '--require unwanted',
    HTTP_PROXY: 'external-proxy', LANGSMITH_TRACING: 'true' });
  assert.equal(env.DB_TYPE, 'sqlite'); assert.equal(env.EXECUTIONS_MODE, 'regular');
  assert.equal(env.PATH, 'runtime-path'); assert.match(env.DB_SQLITE_DATABASE, /database\.sqlite$/);
  for (const field of ['DB_POSTGRESDB_HOST', 'DB_POSTGRESDB_PASSWORD', 'QUEUE_BULL_REDIS_HOST', 'N8N_LICENSE_ACTIVATION_KEY',
    'CLAIM_API_KEY', 'NODE_OPTIONS', 'HTTP_PROXY', 'LANGSMITH_TRACING']) assert.equal(env[field], undefined);
  assert.ok(!JSON.stringify(env).includes('private-')); assert.match(env.N8N_ENCRYPTION_KEY, /^synthetic-/);
});
test('n8n child runs inside its fresh scratch folder to avoid checkout .env auto-loading', () => {
  const verifier = readFileSync(new URL('./verify-local.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /spawn\(executable,[\s\S]*?cwd: scratch/);
  assert.doesNotMatch(verifier, /cwd: root/);
});
