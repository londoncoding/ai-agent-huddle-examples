import { OnceClient, HuddleError as OnceError, type Operation } from '@ai-agent-huddle/once';
import { ClaimClient, HuddleError, type AcquireResult } from '@ai-agent-huddle/claim';
const once = new OnceClient({ apiKey: 'synthetic-key', timeoutMs: 1000 });
const claim = new ClaimClient({ apiKey: 'synthetic-key' });
const op: Promise<Operation> = once.create('stable-key', {
  provider: 'stripe', action: 'create_payment_intent', parameters: { amount: 100, currency: 'gbp' }
}, { stripeTestKey: 'sk_test_synthetic' });
once.create('stable-github', { provider: 'github', action: 'create_issue', parameters: { title: 'Example', body: '' } },
  { githubToken: 'synthetic-token', githubRepository: 'owner/repo' });
// @ts-expect-error GitHub requires an explicit string body (empty is valid).
once.create('stable-github', { provider: 'github', action: 'create_issue', parameters: { title: 'Example' } }, { githubToken: 'synthetic-token', githubRepository: 'owner/repo' });
// @ts-expect-error Provider and action must match.
once.create('key', { provider: 'stripe', action: 'create_issue', parameters: { title: 'Wrong' } }, { stripeTestKey: 'sk_test_synthetic' });
// @ts-expect-error Provider credentials must match the selected action.
once.create('key', { provider: 'stripe', action: 'create_payment_intent', parameters: { amount: 100, currency: 'gbp' } }, { githubToken: 'synthetic-token', githubRepository: 'owner/repo' });
// @ts-expect-error Live payment confirmation is not supported.
once.create('key', { provider: 'stripe', action: 'create_payment_intent', parameters: { amount: 100, currency: 'gbp', confirm: true } }, { stripeTestKey: 'sk_test_synthetic' });
async function inspect() {
  const result: AcquireResult = await claim.acquire({ resource: 'jobs/example', agent_id: 'worker', ttl_seconds: 60 });
  if (result.status === 'GRANTED') {
    const token: bigint = BigInt(result.fencing_token);
    await claim.renew(result.lease_id, 60, {}, { signal: new AbortController().signal });
    await claim.release(result.lease_id);
    void token;
  } else {
    const retry: number = result.retry_after_seconds;
    // @ts-expect-error Denied acquisitions do not have lease IDs.
    result.lease_id;
    void retry;
  }
  try { await op; } catch (error) {
    if (error instanceof HuddleError || error instanceof OnceError) { const status: number | undefined = error.status; void status; }
  }
}
void inspect;
