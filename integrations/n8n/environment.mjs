import { resolve } from 'node:path';
export function isolatedEnvironment(scratch, inherited = process.env) {
  const env = {};
  // Runtime necessities only: never inherit service, database, queue, proxy,
  // credential, tracing, npm hook or Node injection configuration.
  for (const field of ['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TMP', 'TEMP']) {
    if (inherited[field] !== undefined) env[field] = inherited[field];
  }
  return { ...env, N8N_USER_FOLDER: resolve(scratch, 'user'), DB_TYPE: 'sqlite',
    DB_SQLITE_DATABASE: resolve(scratch, 'user', '.n8n', 'database.sqlite'), EXECUTIONS_MODE: 'regular',
    N8N_ENCRYPTION_KEY: 'synthetic-offline-fixture-key-never-use-in-a-real-instance',
    N8N_DIAGNOSTICS_ENABLED: 'false', N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
    N8N_TEMPLATES_ENABLED: 'false', N8N_LOG_LEVEL: 'info', N8N_RUNNERS_ENABLED: 'false',
    N8N_LICENSE_AUTO_RENEW_ENABLED: 'false', N8N_PERSONALIZATION_ENABLED: 'false' };
}
