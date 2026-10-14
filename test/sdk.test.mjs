import assert from 'node:assert/strict';
import test from 'node:test';
await import('../scripts/build-sdk.mjs');
const { OnceClient, HuddleError } = await import('../packages/once/dist/index.js');
const { ClaimClient } = await import('../packages/claim/dist/index.js');
const id = '00000000-0000-4000-8000-000000000001';
const operation = { operation_id: id, status: 'UNKNOWN', retry_safe: false };
const grant = { status: 'GRANTED', lease_id: id, resource: 'jobs/a', fencing_token: '900719925474099312345', expires_at: '2026-10-14T12:00:00Z' };
const available = { resource: 'jobs/a', status: 'AVAILABLE', active: 0, capacity: null, mode: null, next_expiry: null };
const stripe = { stripeTestKey: 'sk_test_synthetic' };
const input = { provider: 'stripe', action: 'create_payment_intent', parameters: { amount: 100, currency: 'gbp' } };
function json(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }); }
function mock(Client, responses) {
  const calls = [];
  const client = new Client({ apiKey: 'synthetic-product-key', fetch: async (url, init) => {
    calls.push({ url, ...init }); const result = responses.shift(); if (result instanceof Error) throw result; return result;
  } });
  return { client, calls };
}
test('ONCE create identity, explicit evidence methods, credential scoping and safe transport defaults', async () => {
  const { client, calls } = mock(OnceClient, [json(operation), json(operation), json({ ...operation, previous_status: 'UNKNOWN', evidence: { reason: 'EVIDENCE_UNAVAILABLE' } }), json(operation)]);
  assert.deepEqual(await client.create('stable-key', input, stripe), operation);
  await client.get(id);
  await client.reconcile(id, stripe);
  await client.retry(id, stripe);
  assert.equal(calls.length, 4);
  assert.deepEqual(JSON.parse(calls[0].body), input);
  assert.equal(calls[0].headers['Idempotency-Key'], 'stable-key');
  assert.equal(calls[0].headers['Once-Stripe-Test-Key'], stripe.stripeTestKey);
  assert.equal(calls[1].headers['Once-Stripe-Test-Key'], undefined);
  assert.equal(calls[1].headers['Once-GitHub-Token'], undefined);
  assert.equal(calls[2].url, `https://once.aiagenthuddle.com/v1/operations/${id}/reconcile`);
  for (const call of calls) { assert.equal(call.redirect, 'error'); assert.equal(call.credentials, 'omit'); assert.equal(call.cache, 'no-store'); assert.ok(call.signal instanceof AbortSignal); }
  assert.ok(!JSON.stringify(client).includes('synthetic-product-key'));
});
test('GitHub action sends only its dedicated provider headers', async () => {
  const { client, calls } = mock(OnceClient, [json(operation)]);
  await client.create('github-key', { provider: 'github', action: 'create_issue', parameters: { title: 'Example', body: 'Content' } },
    { githubToken: 'synthetic-token', githubRepository: 'owner/repo' });
  assert.equal(calls[0].headers['Once-GitHub-Repository'], 'owner/repo');
  assert.equal(calls[0].headers['Once-Stripe-Test-Key'], undefined);
});
test('reject live Stripe keys, mismatched actions, mixed providers and unsafe URLs before dispatch', async () => {
  const { client, calls } = mock(OnceClient, []);
  await assert.rejects(client.create('key', input, { stripeTestKey: 'sk_live_synthetic' }), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(client.create('key', { ...input, action: 'create_issue' }, stripe), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(client.create('key', input, { ...stripe, githubToken: 'synthetic-token', githubRepository: 'owner/repo' }), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(client.create('github-key', { provider: 'github', action: 'create_issue', parameters: { title: 'Example' } },
    { githubToken: 'synthetic-token', githubRepository: 'owner/repo' }), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(client.get('..'), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(client.get('\uD800'), { code: 'INVALID_ARGUMENT' });
  for (const baseUrl of ['http://example.com', 'https://user:password@example.com', 'https://example.com/path', 'https://example.com/?key=x', 'https://example.com/#x']) {
    assert.throws(() => new OnceClient({ apiKey: 'key', baseUrl }), { code: 'INVALID_ARGUMENT' });
  }
  assert.equal(calls.length, 0);
});
test('identifiers and opaque resources cannot alter request paths or query strings', async () => {
  const once = mock(OnceClient, [json(operation)]);
  await once.client.get('id/part?key=x#fragment');
  assert.equal(once.calls[0].url, 'https://once.aiagenthuddle.com/v1/operations/id%2Fpart%3Fkey%3Dx%23fragment');
  const claim = mock(ClaimClient, [json(available)]);
  await claim.client.status('jobs/a?x=1#frag');
  assert.equal(claim.calls[0].url, 'https://claim.aiagenthuddle.com/v1/resources/jobs%2Fa%3Fx%3D1%23frag/status');
});
test('HTTP and network failures redact bodies, causes and credentials; mutations never retry', async () => {
  for (const response of [json({ error: 'provider-token-do-not-echo' }, 409), json({ error: 'provider-token-do-not-echo' }, 429, { 'retry-after': '7' }), new Error('synthetic-product-key provider-token-do-not-echo')]) {
    const { client, calls } = mock(OnceClient, [response]);
    await assert.rejects(client.create('key', input, stripe), error => {
      assert.ok(error instanceof HuddleError);
      assert.ok(!`${error.stack} ${JSON.stringify(error)}`.includes('provider-token-do-not-echo'));
      assert.equal(error.cause, undefined);
      if (error.status === 429) assert.equal(error.retryAfterSeconds, 7);
      return true;
    });
    assert.equal(calls.length, 1);
  }
});
test('CLAIM denial is typed only for acquire; all other conflicts remain errors', async () => {
  const denied = { status: 'DENIED', resource: 'jobs/a', retry_after_seconds: 2 };
  const { client, calls } = mock(ClaimClient, [json(denied, 409), json(denied, 409), json({ error: 'private-message' }, 409)]);
  assert.deepEqual(await client.acquire({ resource: 'jobs/a', agent_id: 'worker', ttl_seconds: 60 }), denied);
  await assert.rejects(client.renew(id, 60), { code: 'HTTP_ERROR', status: 409 });
  await assert.rejects(client.acquire({ resource: 'jobs/a', agent_id: 'worker', ttl_seconds: 60 }), { code: 'HTTP_ERROR', status: 409 });
  assert.equal(calls.length, 3);
});
test('CLAIM preserves large decimal tokens, observations and typed renewal/release/status/wait', async () => {
  const { client, calls } = mock(ClaimClient, [json(grant), json({ status: 'RENEWED', expires_at: grant.expires_at }), json({ status: 'RELEASED' }), json(available), json({ ...available, timed_out: false })]);
  const result = await client.acquire({ resource: 'jobs/a', agent_id: 'worker', ttl_seconds: 60, request_id: id });
  assert.equal(BigInt(result.fencing_token), 900719925474099312345n);
  assert.equal(JSON.parse(calls[0].body).request_id, id);
  await client.renew(id, 60, { request_id: id });
  assert.equal((await client.release(id, { request_id: id })).status, 'RELEASED');
  assert.deepEqual(await client.status('jobs/a'), available);
  assert.equal((await client.wait('jobs/a', 20)).timed_out, false);
  assert.deepEqual(JSON.parse(calls[4].body), { timeout_seconds: 20 });
});
test('CLAIM unknown lease renew and release remain safe HTTP 404 errors', async () => {
  const { client, calls } = mock(ClaimClient, [json({ status: 'NOT_FOUND', expires_at: null }, 404), json({ status: 'NOT_FOUND' }, 404)]);
  await assert.rejects(client.renew(id, 60), { code: 'HTTP_ERROR', status: 404 });
  await assert.rejects(client.release(id), { code: 'HTTP_ERROR', status: 404 });
  assert.equal(calls.length, 2);
});
test('reject malformed success responses, numeric fencing tokens and oversized bodies', async () => {
  for (const response of [json({ ...operation, retry_safe: 'true' }), new Response('not-json', { headers: { 'content-type': 'application/json' } }), json({ ...operation, operation_id: '../x' }), json({ ...operation, extra: 'secret' })]) {
    const { client } = mock(OnceClient, [response]);
    if ((await response.clone().text()).includes('"extra"')) assert.deepEqual(await client.get(id), operation);
    else await assert.rejects(client.get(id), { code: 'INVALID_RESPONSE' });
  }
  const claim = mock(ClaimClient, [json({ ...grant, fencing_token: 9007199254740993 })]);
  await assert.rejects(claim.client.acquire({ resource: 'jobs/a', agent_id: 'worker', ttl_seconds: 60 }), { code: 'INVALID_RESPONSE' });
  const oversized = mock(OnceClient, [json({ data: 'x'.repeat(1024 * 1024) })]);
  await assert.rejects(oversized.client.get(id), { code: 'INVALID_RESPONSE' });
});
test('timeouts and cancellation are bounded safe failures with one dispatch', async () => {
  let calls = 0;
  const fetcher = (_, { signal }) => { calls++; return new Promise((resolve, reject) => {
    if (signal.aborted) reject(new Error('raw-sensitive-error'));
    else signal.addEventListener('abort', () => reject(new Error('raw-sensitive-error')), { once: true });
  }); };
  // Keep Node's event loop alive while its unref'ed AbortSignal timer is pending.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const client = new OnceClient({ apiKey: 'synthetic-key', fetch: fetcher, timeoutMs: 5 });
    await assert.rejects(client.create('key', input, stripe), { code: 'TIMEOUT' });
    const controller = new AbortController(); controller.abort('raw-sensitive-error');
    await assert.rejects(client.get(id, { signal: controller.signal }), { code: 'ABORTED' });
    assert.equal(calls, 1, 'Already-aborted requests must not dispatch credentials.');
    assert.throws(() => new OnceClient({ apiKey: 'key', timeoutMs: 0 }), { code: 'INVALID_ARGUMENT' });
  } finally { clearInterval(keepAlive); }
});
