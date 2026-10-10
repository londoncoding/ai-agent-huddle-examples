import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Node.js 22+. No dependencies. An API demonstration, not independent-process evidence.
export async function run({ env = process.env, fetcher = fetch, log = console.log } = {}) {
  assert.ok(env.CLAIM_API_KEY, 'Set CLAIM_API_KEY in your private .env file.');
  const resource = `quickstart/${randomUUID()}`;
  const held = new Set();
  async function request(path, method = 'GET', body) {
    const response = await fetcher('https://claim.aiagenthuddle.com' + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${env.CLAIM_API_KEY}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const value = await response.json();
    assert.ok(response.ok || (response.status === 409 && value.status === 'DENIED'),
      `CLAIM HTTP ${response.status}. See docs.html#troubleshooting.`);
    return value;
  }
  async function acquire(agent_id) {
    const value = await request('/v1/leases', 'POST', { resource, agent_id, ttl_seconds: 60, request_id: randomUUID() });
    if (value.status === 'GRANTED') {
      assert.match(value.lease_id ?? '', /^[0-9a-f-]{36}$/i, 'Expected a lease ID.');
      held.add(value.lease_id);
    }
    return value;
  }
  async function release(id) {
    const value = await request(`/v1/leases/${id}`, 'DELETE', { request_id: randomUUID() });
    assert.ok(['RELEASED', 'NOT_ACTIVE'].includes(value.status), 'Expected release or already-inactive result.');
    held.delete(id);
  }
  try {
    const a = await acquire('example-a');
    assert.equal(a.status, 'GRANTED', 'First acquisition must be GRANTED.');
    const b = await acquire('example-b');
    assert.equal(b.status, 'DENIED', 'Competing acquisition must be DENIED while A holds the lease.');
    log('PASS: A was GRANTED; B was DENIED on the same resource.');
    await release(a.lease_id);
    const next = await acquire('example-b');
    assert.equal(next.status, 'GRANTED', 'B must acquire after A releases.');
    assert.ok(BigInt(next.fencing_token) > BigInt(a.fencing_token), 'New fencing token must increase.');
    // Illustrative downstream gate. Production must compare AND commit atomically
    // in the real storage system; this local variable does not protect a real write.
    const latestAccepted = BigInt(next.fencing_token);
    assert.ok(BigInt(a.fencing_token) < latestAccepted);
    log('PASS: B acquired after release with a higher fencing token. The old token is stale.');
    log('Enforce fencing atomically in your downstream system. Lease expiry cannot stop a worker.');
    return { passed: true };
  } finally {
    // Cleanup all known grants, including any unexpected extra grant.
    const results = await Promise.allSettled([...held].map(release));
    if (results.some(result => result.status === 'rejected')) {
      throw new Error('Cleanup could not be confirmed. Stop using this resource; leases expire after at most 60 seconds from grant.');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
