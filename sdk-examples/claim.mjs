import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ClaimClient } from '@ai-agent-huddle/claim';
assert.ok(process.env.CLAIM_API_KEY, 'Set CLAIM_API_KEY.');
const client = new ClaimClient({ apiKey: process.env.CLAIM_API_KEY });
// Demonstration only. Persist the input before dispatch in production workers.
const input = { resource: `sdk-example/${randomUUID()}`, agent_id: 'example-worker', ttl_seconds: 60, request_id: randomUUID() };
try {
  const result = await client.acquire(input);
  if (result.status === 'DENIED') console.log('DENIED. Do not start protected work.');
  else {
    try {
      console.log(`GRANTED. Fencing token: ${BigInt(result.fencing_token)}`);
      console.log('Demo performs no protected write. Production storage must check fencing and commit atomically.');
    } finally {
      const released = await client.release(result.lease_id, { request_id: randomUUID() });
      console.log(`Cleanup: ${released.status}`);
    }
  }
} catch (error) {
  console.error(`CLAIM SDK error: ${error.code ?? 'UNEXPECTED'}. Stop protected work; uncertain grants expire after 60 seconds.`);
  process.exitCode = 1;
}
