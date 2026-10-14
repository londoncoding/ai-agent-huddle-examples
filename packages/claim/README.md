# @ai-agent-huddle/claim

Typed, dependency-free HTTP client for [CLAIM by AI Agent Huddle](https://claim.aiagenthuddle.com/docs.html). Node.js 22+, ESM. This package contains public client code; it contains no service implementation.

```sh
npm install @ai-agent-huddle/claim
```

```js
import { randomUUID } from 'node:crypto';
import { ClaimClient } from '@ai-agent-huddle/claim';
const claim = new ClaimClient({ apiKey: process.env.CLAIM_API_KEY });
const input = { resource: 'jobs/example', agent_id: 'worker-a', ttl_seconds: 60,
  request_id: randomUUID() };
// Persist input and request_id before dispatch to recover an uncertain acquisition.
const grant = await claim.acquire(input);
if (grant.status === 'GRANTED') {
  try {
    const token = BigInt(grant.fencing_token);
    // Pass token to storage that atomically checks fencing AND commits the effect.
    // Do not perform a protected write until that downstream gate exists.
  } finally {
    await claim.release(grant.lease_id, { request_id: randomUUID() });
  }
}
```

**Downstream storage must enforce fencing atomically.** Lease expiry cannot stop a worker. An in-memory comparison is insufficient and fencing does not make individual writes idempotent. Tokens remain decimal strings: compare using `BigInt`, never JavaScript `Number`.

Methods: `acquire(input, options?)`, `renew(leaseId, ttlSeconds, observation?, options?)`, `release(leaseId, observation?, options?)`, `status(resource, options?)`, `wait(resource, timeoutSeconds?, options?)`. Acquire returns `GRANTED | DENIED`; only a validated acquisition denial maps HTTP 409 into `DENIED`. Every other conflict is an error. Renew returns `RENEWED | EXPIRED`; release returns `RELEASED | NOT_ACTIVE`. Unknown lease IDs produce a safe `HTTP_ERROR` with `status: 404`. A failed renewal means stop protected work. `status` and `wait` provide availability hints; neither grants ownership. Wait is bounded to 1–20 seconds, defaults to 10.

Acquisition defaults to exclusive, capacity 1; semaphore supports capacity 1–1000. TTL is 5–86400 seconds. Resource strings are opaque and safely encoded. Optional `{ request_id, process_session_id }` observations must be UUIDs. Persist request IDs and reuse the same ID and inputs for one uncertain mutation; a different acquire ID creates a new request. A replay does not revive an expired lease. Fresh inactive release results do not reserve request IDs. Use distinct IDs for distinct operations. No method automatically retries.

Errors are `HuddleError` with a safe `code`, optional HTTP `status` and numeric `retryAfterSeconds`. Raw server bodies, network errors and credentials are omitted. An uncertain acquisition may have granted a lease; retain its request ID and stop protected work while recovering the result. Cleanup of known grants can fail; unknown grants expire after their TTL. See the [fencing guide](https://claim.aiagenthuddle.com/guides/leases-and-fencing.html).

Client options: `{ apiKey, timeoutMs?: 30000, baseUrl?, fetch? }`. Request options: `{ signal?, timeoutMs? }`. Timeouts range from 1 to 120000 milliseconds and apply through response reading. HTTPS origins only; no paths, query, fragment or URL credentials. Redirects are rejected. A custom origin or fetch implementation receives your credentials, so use only one you trust. Keep this client and keys in server code, never a browser bundle. Avoid logging headers or sensitive resource names.

[Runnable source examples](https://github.com/londoncoding/ai-agent-huddle-examples/tree/main/sdk-examples) · [Support and service information](https://claim.aiagenthuddle.com/service.html) · MIT licence.
