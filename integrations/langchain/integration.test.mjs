import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { disableTracing, forbidNetwork } from './offline-environment.mjs';
disableTracing();
const network = forbidNetwork();
const { fixtureClient } = await import('./fixture.mjs');
const { runClaimAgent } = await import('./agent.mjs');
test('actual DeepAgents agent/model/tool loop acquires, inspects and releases through SDK', async () => {
  const { client, calls } = fixtureClient(); const result = await runClaimAgent(client);
  assert.deepEqual(result.events.map(event => event.tool), ['claim_acquire', 'claim_status', 'claim_release']);
  assert.equal(result.modelInvocations, 4); assert.equal(result.cleanup, 'RELEASED'); assert.equal(result.protectedWrites, 0);
  assert.deepEqual(calls.map(call => call.method), ['POST', 'GET', 'DELETE']);
  assert.match(calls[0].body.request_id, /^[a-f0-9-]{36}$/); assert.notEqual(calls[0].body.request_id, calls[2].body.request_id);
  assert.equal(result.messages.filter(message => message.getType() === 'tool').length, 3);
});
test('same scoped tools also execute in the actual LangChain createAgent loop', async () => {
  const { client, calls } = fixtureClient(); const result = await runClaimAgent(client, { framework: 'langchain' });
  assert.equal(result.framework, 'langchain'); assert.equal(result.modelInvocations, 4);
  assert.deepEqual(calls.map(call => call.method), ['POST', 'GET', 'DELETE']); assert.equal(result.cleanup, 'RELEASED');
});
test('DENIED stops the actual agent loop without status, release or demo work', async () => {
  const { client, calls } = fixtureClient({ acquire: 'DENIED' }); const result = await runClaimAgent(client);
  assert.equal(calls.length, 1); assert.equal(result.phase, 'DENIED'); assert.equal(result.modelInvocations, 2);
});
test('uncertain acquisition stops once and preserves recovery request ID', async () => {
  const { client, calls } = fixtureClient({ acquire: 'UNCERTAIN' }); const result = await runClaimAgent(client);
  assert.equal(calls.length, 1); assert.equal(result.phase, 'ACQUIRE_UNCERTAIN'); assert.equal(result.cleanup, 'NO_KNOWN_GRANT');
  assert.equal(result.recovery.acquire_request_id, calls[0].body.request_id);
  assert.ok(!JSON.stringify(result.messages).includes('synthetic transport failure'));
});
test('status failure still releases a known grant once', async () => {
  const { client, calls } = fixtureClient({ statusFails: true }); const result = await runClaimAgent(client);
  assert.deepEqual(calls.map(call => call.method), ['POST', 'GET', 'DELETE']); assert.equal(result.cleanup, 'RELEASED');
});
test('uncertain release is not retried by model or cleanup', async () => {
  const { client, calls } = fixtureClient({ releaseFails: true }); const result = await runClaimAgent(client);
  assert.equal(calls.filter(call => call.method === 'DELETE').length, 1); assert.equal(result.cleanup, 'UNCONFIRMED');
  assert.equal(result.phase, 'RELEASE_UNCERTAIN');
});
test('hostile inherited tracing flags are disabled and outbound fetch is forbidden', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('./run-demo.mjs', import.meta.url))], {
    encoding: 'utf8', env: { ...process.env, LANGCHAIN_TRACING: 'true', LANGCHAIN_TRACING_V2: 'true',
      LANGSMITH_TRACING: 'true', LANGSMITH_TRACING_V2: 'true', LANGSMITH_API_KEY: 'synthetic-unused',
      LANGSMITH_ENDPOINT: 'http://127.0.0.1:1' }, windowsHide: true
  });
  const result = JSON.parse(output); assert.equal(result.outboundNetworkAttempts, 0); assert.equal(result.cleanup, 'RELEASED');
  assert.equal(network.attempts(), 0);
});
