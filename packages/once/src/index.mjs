import { Transport, text, segment, record, invalid, protocol, uuid, responseText } from './transport.js';
export { HuddleError } from './transport.js';
const STATES = new Set(['CREATED', 'EXECUTING', 'COMMITTED', 'NOT_COMMITTED', 'UNKNOWN', 'PROVEN_COMMITTED', 'PROVEN_NOT_COMMITTED', 'AMBIGUOUS']);
function operation(value) {
  protocol(STATES.has(value.status) && typeof value.retry_safe === 'boolean');
  const result = { operation_id: uuid(value.operation_id), status: value.status, retry_safe: value.retry_safe };
  if (value.provider_reference !== undefined) result.provider_reference = responseText(value.provider_reference);
  return result;
}
function credentials(value) {
  if (!record(value)) invalid();
  if (value.githubToken !== undefined && value.stripeTestKey !== undefined) invalid();
  if (value.githubToken !== undefined) {
    text(value.githubToken, 4096); text(value.githubRepository, 256);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.githubRepository)) invalid();
    return { 'Once-GitHub-Token': value.githubToken, 'Once-GitHub-Repository': value.githubRepository };
  }
  if (value.stripeTestKey !== undefined) {
    text(value.stripeTestKey, 4096);
    if (!/^sk_test_[A-Za-z0-9]+$/.test(value.stripeTestKey)) invalid();
    return { 'Once-Stripe-Test-Key': value.stripeTestKey };
  }
  invalid();
}
export class OnceClient {
  #transport;
  constructor(options) { this.#transport = new Transport('https://once.aiagenthuddle.com', options); }
  async create(key, input, provider, options) {
    text(key, 200);
    if (/\s/.test(key) || !record(input) || !record(input.parameters)) invalid();
    if (!((input.provider === 'github' && input.action === 'create_issue' && provider?.githubToken !== undefined) ||
      (input.provider === 'stripe' && input.action === 'create_payment_intent' && provider?.stripeTestKey !== undefined))) invalid();
    if (input.provider === 'github' && (typeof input.parameters.title !== 'string' || typeof input.parameters.body !== 'string')) invalid();
    const headers = { ...credentials(provider), 'Idempotency-Key': key };
    const body = { provider: input.provider, action: input.action, parameters: input.parameters };
    if (input.metadata !== undefined) { if (!record(input.metadata)) invalid(); body.metadata = input.metadata; }
    return operation(await this.#transport.request('/v1/operations', 'POST', body, headers, options));
  }
  async get(id, options) { return operation(await this.#transport.request(`/v1/operations/${segment(id)}`, 'GET', undefined, {}, options)); }
  async reconcile(id, provider, options) {
    const value = await this.#transport.request(`/v1/operations/${segment(id)}/reconcile`, 'POST', {}, credentials(provider), options);
    const result = operation(value);
    protocol(STATES.has(value.previous_status) && record(value.evidence));
    // Evidence descriptions are protocol codes; never relay arbitrary server text.
    protocol(typeof value.evidence.reason === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(value.evidence.reason));
    return { ...result, previous_status: value.previous_status, evidence: { reason: value.evidence.reason } };
  }
  /** Explicit new attempt. Call only after provider evidence establishes retry safety. */
  async retry(id, provider, options) {
    return operation(await this.#transport.request(`/v1/operations/${segment(id)}/retry`, 'POST', {}, credentials(provider), options));
  }
}
