export function disableTracing() {
  for (const field of ['LANGCHAIN_TRACING', 'LANGCHAIN_TRACING_V2', 'LANGSMITH_TRACING', 'LANGSMITH_TRACING_V2']) process.env[field] = 'false';
}
export function forbidNetwork() {
  const original = globalThis.fetch; let attempts = 0;
  globalThis.fetch = async () => { attempts++; throw new Error('Offline demonstration forbids external requests.'); };
  return { attempts: () => attempts, restore: () => { globalThis.fetch = original; } };
}
