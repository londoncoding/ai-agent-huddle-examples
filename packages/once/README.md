# @ai-agent-huddle/once

Typed, dependency-free HTTP client for [ONCE by AI Agent Huddle](https://once.aiagenthuddle.com/docs.html). Node.js 22+, ESM. This package contains public client code; it contains no service implementation.

```sh
npm install @ai-agent-huddle/once
```

```js
import { OnceClient, HuddleError } from '@ai-agent-huddle/once';

const once = new OnceClient({ apiKey: process.env.ONCE_API_KEY });
const input = { provider: 'stripe', action: 'create_payment_intent',
  parameters: { amount: 100, currency: 'gbp' } };
const credentials = { stripeTestKey: process.env.STRIPE_TEST_KEY };
// Persist this key before dispatch; always reuse identical inputs for this operation.
const operation = await once.create(process.env.ONCE_OPERATION_KEY, input, credentials);
const recorded = await once.get(operation.operation_id);
console.log(recorded.status);
```

The Stripe action creates an **unconfirmed test PaymentIntent**; it never captures a live payment. Only sandbox secret keys starting `sk_test_` are accepted. GitHub supports `create_issue` with `{ title, body }` and `{ githubToken, githubRepository: 'owner/repository' }`; it creates a real issue. Both title and body must be strings; use an empty body string if needed. Use a repository-restricted fine-grained token with Issues read/write. There is no arbitrary action or universal exactly-once guarantee.

Methods: `create(key, input, credentials, options?)`, `get(id, options?)`, `reconcile(id, credentials, options?)`, `retry(id, credentials, options?)`. Reconciliation inspects provider evidence. `retry` is an explicit new attempt, permitted only when the recorded provider evidence establishes safety. `UNKNOWN`, `AMBIGUOUS`, `CREATED` or `EXECUTING` requires inspection; never blindly redispatch. A replay returning the same ID is not proof the provider effect succeeded. Preserve the key, inputs and returned ID durably. See the [recovery guide](https://once.aiagenthuddle.com/guides/recovering-uncertain-actions.html).

Errors are `HuddleError` with a safe `code`, optional HTTP `status` and numeric `retryAfterSeconds`. Raw server bodies, network errors and credentials are omitted. Timeouts, aborts and network failures leave mutation outcomes uncertain; the SDK never retries. HTTP 409 is an error. Inspect the existing operation before deciding a next action.

Client options: `{ apiKey, timeoutMs?: 30000, baseUrl?, fetch? }`. Request options: `{ signal?, timeoutMs? }`. Timeouts range from 1 to 120000 milliseconds and apply through response reading. HTTPS origins only; no paths, query, fragment or URL credentials. Redirects are rejected. A custom origin or fetch implementation receives your credentials, so use only one you trust. Keep clients and provider keys in server code, never a browser bundle. `get` sends only your ONCE key; provider credentials are scoped to each explicit provider method call. Avoid logging input objects, fetch headers or successful provider references if sensitive.

[Runnable source examples](https://github.com/londoncoding/ai-agent-huddle-examples/tree/main/sdk-examples) · [Support and service information](https://once.aiagenthuddle.com/service.html) · MIT licence.
