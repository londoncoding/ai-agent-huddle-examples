import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Node.js 22+. No dependencies. Never print credentials or follow redirects.
export async function run({ env = process.env, fetcher = fetch, log = console.log } = {}) {
  const { ONCE_API_KEY, STRIPE_TEST_KEY, ONCE_OPERATION_KEY } = env;
  assert.ok(ONCE_API_KEY, 'Set ONCE_API_KEY in your private .env file.');
  assert.match(STRIPE_TEST_KEY ?? '', /^sk_test_/, 'Use a Stripe sandbox secret key starting sk_test_, never a live or restricted billing key.');
  assert.match(ONCE_OPERATION_KEY ?? '', /^\S{1,200}$/, 'Set a stable ONCE_OPERATION_KEY without spaces; keep it for reruns.');
  const origin = 'https://once.aiagenthuddle.com';
  async function request(path, method = 'GET', body) {
    const response = await fetcher(origin + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${ONCE_API_KEY}`, 'Content-Type': 'application/json',
        ...(method === 'POST' ? { 'Once-Stripe-Test-Key': STRIPE_TEST_KEY, 'Idempotency-Key': ONCE_OPERATION_KEY } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const value = await response.json();
    // Do not echo arbitrary server responses: they could contain sensitive data.
    assert.ok(response.ok, `ONCE HTTP ${response.status}. See docs.html#troubleshooting. Keep the same operation key.`);
    return value;
  }
  const input = { provider: 'stripe', action: 'create_payment_intent', parameters: { amount: 100, currency: 'gbp' } };
  const first = await request('/v1/operations', 'POST', input);
  assert.match(first.operation_id ?? '', /^[0-9a-f-]{36}$/i, 'Expected an operation ID. Stop and inspect before retrying.');
  log(`Operation recorded: ${first.operation_id}; state: ${first.status}`);
  // Same logical request, same key and parameters. Never call /retry blindly.
  const replay = await request('/v1/operations', 'POST', input);
  assert.equal(replay.operation_id, first.operation_id, 'Replay must return the same operation ID.');
  const inspected = await request(`/v1/operations/${first.operation_id}`);
  log(`PASS: replay reused the operation. Current state: ${inspected.status}`);
  if (['UNKNOWN', 'AMBIGUOUS', 'EXECUTING', 'CREATED'].includes(inspected.status)) {
    log('Outcome is unresolved. Preserve the operation ID and inspect/reconcile using provider evidence; do not redispatch.');
  } else if (['COMMITTED', 'PROVEN_COMMITTED'].includes(inspected.status)) {
    log('Provider action recorded as committed. In Stripe this is an unconfirmed TEST PaymentIntent, not a charge.');
  } else {
    log('Inspect the operation and its retry safety before any further action. Replay success is not proof of a provider effect.');
  }
  return { operation_id: first.operation_id, status: inspected.status };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
