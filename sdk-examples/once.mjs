import assert from 'node:assert/strict';
import { OnceClient } from '@ai-agent-huddle/once';
const { ONCE_API_KEY, STRIPE_TEST_KEY, ONCE_OPERATION_KEY } = process.env;
assert.ok(ONCE_API_KEY && STRIPE_TEST_KEY && ONCE_OPERATION_KEY, 'Set ONCE_API_KEY, STRIPE_TEST_KEY and a durable ONCE_OPERATION_KEY.');
const client = new OnceClient({ apiKey: ONCE_API_KEY });
try {
  const operation = await client.create(ONCE_OPERATION_KEY, {
    provider: 'stripe', action: 'create_payment_intent', parameters: { amount: 100, currency: 'gbp' }
  }, { stripeTestKey: STRIPE_TEST_KEY });
  // Save this ID durably in real workers. No automatic replay or retry here.
  console.log(`Operation ${operation.operation_id}: ${operation.status}`);
  console.log(`Recorded state: ${(await client.get(operation.operation_id)).status}`);
} catch (error) {
  console.error(`ONCE SDK error: ${error.code ?? 'UNEXPECTED'}. Preserve original key and inputs; inspect before another attempt.`);
  process.exitCode = 1;
}
