# AI Agent Huddle examples

Small, dependency-free examples for [ONCE](https://once.aiagenthuddle.com/docs.html) and [CLAIM](https://claim.aiagenthuddle.com/docs.html), from AI Agent Huddle. These examples are public; this repository does not contain the service implementations.

## When these tools help

**ONCE:** your GitHub action timed out. Inspect the recorded operation and reconcile provider evidence before deciding whether another attempt is safe. Start with the GitHub workflow below; unresolved evidence never authorises a blind retry.

**CLAIM:** two agent workers want the same job. Coordinate lease ownership and use increasing fencing tokens to reject stale writes in downstream storage. Start with the two-worker example below; the storage must enforce fencing atomically.

Both have free usage for trying the workflow. Existing provider idempotency or your database's own locking may already solve your problem; evaluate the additional recovery or coordination value before subscribing.

## Start free

1. Use Node.js 22 or newer. Clone/download this repository. No npm install is needed.
2. Sign up for the product, confirm your email and create a project in its console. Save the project API key while it is visible. The free plan is enough for these examples.
3. Copy .env.example to .env and replace only the values needed for your chosen example. .env is ignored by Git. Never commit credentials, include them in a browser bundle, or send them to support.
4. Run the appropriate command below from the repository root.

## ONCE: record, replay, inspect

Set ONCE_API_KEY, STRIPE_TEST_KEY and ONCE_OPERATION_KEY in .env. STRIPE_TEST_KEY must be a Stripe sandbox secret key with PaymentIntent creation access, not a publishable or live key.

```sh
node --env-file=.env once/once-first-operation.mjs
```

Expected: an operation ID, a PASS message confirming the identical request reused that ID, and the recorded state. The provider effect is an **unconfirmed test PaymentIntent**, never a live card charge. Keep the same operation key and parameters on reruns. A new key creates a new logical operation.

UNKNOWN, AMBIGUOUS or EXECUTING requires inspection and evidence; the example never calls retry. Replay success does not establish provider success. ONCE adds a durable record and recovery states for supported actions; native provider idempotency may already be sufficient for your integration. It does not offer universal exactly-once execution. Read the [recovery guide](https://once.aiagenthuddle.com/guides/recovering-uncertain-actions.html).

## CLAIM: contention, handover, fencing

Set CLAIM_API_KEY in .env.

```sh
node --env-file=.env claim/claim-contention.mjs
```

Expected: A is GRANTED, B is DENIED, A releases, then B is GRANTED with a higher fencing token. The script uses a unique resource and releases all known grants even if an assertion fails. Unknown grants expire after their 60-second TTL. Interrupted execution cannot guarantee cleanup.

This is a **single-process demonstration**, not independent-worker evidence or a production downstream lock. The illustrative token comparison uses BigInt. Your real downstream system must compare tokens and commit atomically; an in-memory check is insufficient. Lease expiry does not terminate a worker. Read the [fencing guide](https://claim.aiagenthuddle.com/guides/leases-and-fencing.html).

## Workflow examples

**ONCE GitHub recovery:** set ONCE_API_KEY, ONCE_GITHUB_OPERATION_KEY (a separate stable key), GITHUB_REPOSITORY and a repository-restricted fine-grained GITHUB_TOKEN with Issues read/write. Set ONCE_ALLOW_GITHUB_WRITE=true for the initial run; this creates a real GitHub issue.

```sh
node --env-file=.env once/github-recovery.mjs
```

Set ONCE_ALLOW_GITHUB_WRITE=false and run again in a new process. It reads `.local/once-github.json`, inspects the saved operation and reconciles provider evidence without another create request. Preserve the checkpoint, key and inputs. If the create response was lost before its ID was saved, only replay the original logical request with the same key. Unresolved evidence stops without automatic retry. A normal successful run does not prove recovery from a real provider outage. Production workflows need durable checkpoint storage and access controls.

**CLAIM independent workers:** keep both worker files and set CLAIM_API_KEY.

```sh
node --env-file=.env claim/two-workers.mjs
```

Two actual OS processes contend, renew and hand over a lease. A local broker accepts the newer token and rejects a stale worker's effect. Known grants are released during cleanup; unknown grants expire 60 seconds after acquisition or renewal. Interrupted execution can prevent cleanup. The broker is an in-memory demonstration: production downstream storage must compare tokens and commit atomically. Fencing does not provide per-write idempotency or stop an expired worker.

See [client-specific setup](clients/README.md), [verification limits](clients/verification.md) and the [changelog](CHANGELOG.md).
## MCP connection

Use Streamable HTTP and a client that supports private bearer-header configuration:

| Product | Server URL | Authorization header | Expected tools |
| --- | --- | --- | --- |
| ONCE | https://once.aiagenthuddle.com/mcp | Bearer YOUR_ONCE_API_KEY | once_create, once_get, once_retry, once_reconcile |
| CLAIM | https://claim.aiagenthuddle.com/mcp | Bearer YOUR_CLAIM_API_KEY | claim_acquire, claim_renew, claim_release, claim_status, claim_wait |

An OAuth-only client cannot authenticate with this API-key configuration. Discover tools first. ONCE provider credentials are dedicated HTTP headers, not tool arguments; see its documentation before creating actions.

## Errors and limits

- 401: check that you supplied the correct product's project key, including the Bearer header. Replaced keys are revoked immediately.
- 400: check field names/types and the provider credential requirements.
- 409: ONCE input mismatch requires restoring the original parameters; CLAIM DENIED is normal contention. Do not bypass either by blindly retrying or starting work.
- 429: respect minute/monthly allowances and use bounded backoff. ONCE reconciliation also has a separate 100-request monthly reserve. Quota exhaustion never proves an action safe to retry.
- Timeout: preserve the logical operation/request ID. An uncertain HTTP response does not establish whether an effect occurred.

Examples use real API requests and consume a few request units. Synthetic tests and demonstrations are not evidence of customer traction. No SLA, benchmark or third-party certification is claimed here.

## Offline regression checks

```sh
node --test test/*.test.mjs
```

These checks use mocked responses and local loopback HTTP: no external network, credentials, payment or customer data. They cover uncertain ONCE outcomes, live-key rejection, no blind retry, CLAIM cleanup under unexpected grants, large integer fencing tokens and cleanup failures. They do not certify hosted service behaviour.

Support: accounts@aiagenthuddle.com. Include product, redacted HTTP error, operation/lease ID and UTC timestamp. Never share keys or sign-in links.

[Legal information](https://once.aiagenthuddle.com/service.html) · [Licence](LICENSE)
