# CLAIM lease demonstration for n8n

Import [`claim-demo.json`](claim-demo.json) into n8n. It acquires a CLAIM lease, routes only a validated GRANTED result to a **demo node with no protected write**, then releases the known lease. DENIED produces a no-work result. Unconfirmed acquisition or release stops. The workflow contains no credential values or credential IDs, has redirects and automatic mutation retries disabled, and uses only standard n8n nodes.

## Run in your own n8n

1. Import the JSON into your n8n instance. It has a manual trigger and is inactive.
2. Create a private **Header Auth** credential: Name `Authorization`, Value `Bearer YOUR_CLAIM_PROJECT_KEY`. Select that credential on **both** `Acquire CLAIM lease` and `Release known lease`. Never paste a key into workflow JSON, a Set node or a community post. Both nodes target the fixed CLAIM HTTPS host.
3. In `Configure demo`, choose a resource and two distinct UUIDs: `acquireRequestId` and `releaseRequestId`. Generate each locally with `node -e "console.log(require('node:crypto').randomUUID())"`. The placeholder values deliberately fail validation until configured. Preserve the UUIDs and exact inputs for recovery; replacing the acquire UUID creates a new request.
4. Run manually. A grant should show the no-write demo and confirmed release; contention returns DENIED. Requests consume your normal CLAIM allowance. A free project is sufficient; no paid n8n Cloud plan or model API is required by this workflow.

The TTL is 60 seconds. A timeout can conceal a grant or a completed release. Stop work, preserve the original inputs and request UUID, and inspect/recover the same request rather than rerunning with a new ID. Unknown grants expire after their TTL. Interrupted execution or a node error can prevent cleanup; this small workflow does not implement a durable recovery engine. HTTP-node timeout is 20 seconds for the initial response, following n8n's timeout semantics.

**Downstream storage must enforce fencing atomically before any real protected write.** The demo Set node only emits a message. Lease expiry cannot stop a worker. An in-memory token comparison is insufficient, and fencing does not provide per-write idempotency. Do not replace the demo node with an external effect and assume the workflow makes it safe. The workflow disables execution-data saving in its settings; your n8n instance may still keep logs or execution data, so follow your own privacy and access-control practices.

## Reproduce the local verification

The verification uses real n8n CLI workflow import/execution with a loopback HTTP fixture and synthetic Header Auth credentials. It does not call hosted CLAIM, n8n Cloud, a model provider or a production database.

Use **Node.js 24+ for n8n 2.43.5**. From this repository root:

```sh
npm install --prefix .local/n8n-runtime --ignore-scripts --no-audit --no-fund n8n@2.43.5
npm rebuild sqlite3 --prefix .local/n8n-runtime
node --test integrations/n8n/environment.test.mjs
node integrations/n8n/verify-local.mjs
```

The SQLite rebuild runs the official SQLite driver's native install step; other package install scripts remain disabled. Installation needs network access. The workflow verifier then uses only loopback requests, a fresh ignored `.local/n8n-integration-*` profile and SQLite database. It creates/imports a synthetic credential into that profile. It starts n8n from the scratch folder so n8n cannot auto-load a checkout `.env`, strips inherited database/queue/proxy/credential/tracing/runtime-injection variables and forces regular execution. It never edits an existing n8n instance. Runtime logs and synthetic fixture receipts stay ignored; the latest scratch path is in `.local/n8n-integration-latest.json`.

If your main Node runtime is 22, set `N8N_NODE_EXECUTABLE` to an absolute Node 24+ executable before running the verifier. An optional `N8N_CLI_PATH` selects your separately installed n8n CLI. These overrides must point to trusted local binaries. Node 22 remains suitable for the public SDK and the separate DeepAgents example.

Verified 2026-10-14: n8n **2.43.5**, Node **24.19.0**, SQLite driver **5.1.7**. Five real workflow executions passed: GRANTED → one release; DENIED → no work/release; lost acquire response → stop after one request; unconfirmed release → stop after one release; redirect → stop without following it. Two isolation regression checks passed for poisoned inherited configuration and scratch working-directory selection. No protected write was performed. Local fixtures do not validate hosted CLAIM or production concurrency.

`build-workflow.mjs` reproduces the importable JSON with `node integrations/n8n/build-workflow.mjs`. Official references: [HTTP Request node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/), [private HTTP credentials](https://docs.n8n.io/integrations/builtin/credentials/httprequest/), [n8n CLI](https://docs.n8n.io/hosting/cli-commands/). Product guidance: [CLAIM API](https://claim.aiagenthuddle.com/docs.html), [leases and fencing](https://claim.aiagenthuddle.com/guides/leases-and-fencing.html).
