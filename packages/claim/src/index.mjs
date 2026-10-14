import { Transport, text, integer, segment, observation, protocol, uuid, responseText, nullableText } from './transport.js';
export { HuddleError } from './transport.js';
function state(value) {
  protocol(['AVAILABLE', 'BUSY'].includes(value.status) && Number.isSafeInteger(value.active) && value.active >= 0 &&
    (value.capacity === null || (Number.isSafeInteger(value.capacity) && value.capacity > 0)) &&
    [null, 'exclusive', 'semaphore'].includes(value.mode));
  return { resource: responseText(value.resource), status: value.status, active: value.active, capacity: value.capacity,
    mode: value.mode, next_expiry: nullableText(value.next_expiry) };
}
export class ClaimClient {
  #transport;
  constructor(options) { this.#transport = new Transport('https://claim.aiagenthuddle.com', options); }
  async acquire(input, options) {
    text(input?.resource); text(input?.agent_id, 128); integer(input?.ttl_seconds, 5, 86400);
    const mode = input.mode ?? 'exclusive'; const capacity = input.capacity ?? 1;
    protocolInput(mode === 'exclusive' || mode === 'semaphore'); integer(capacity, 1, 1000);
    protocolInput(mode !== 'exclusive' || capacity === 1);
    const value = await this.#transport.request('/v1/leases', 'POST', {
      resource: input.resource, agent_id: input.agent_id, ttl_seconds: input.ttl_seconds, mode, capacity, ...observation(input)
    }, {}, options);
    if (value.status === 'GRANTED') {
      // Tokens remain strings. Reject numeric tokens to avoid silent precision loss.
      protocol(typeof value.fencing_token === 'string' && /^[1-9]\d{0,127}$/.test(value.fencing_token));
      return { status: 'GRANTED', lease_id: uuid(value.lease_id), resource: responseText(value.resource),
        fencing_token: value.fencing_token, expires_at: responseText(value.expires_at) };
    }
    protocol(value.status === 'DENIED' && Number.isFinite(value.retry_after_seconds) && value.retry_after_seconds >= 0);
    return { status: 'DENIED', resource: responseText(value.resource), retry_after_seconds: value.retry_after_seconds };
  }
  async renew(id, ttlSeconds, observed = {}, options) {
    integer(ttlSeconds, 5, 86400);
    const value = await this.#transport.request(`/v1/leases/${segment(id)}/renew`, 'POST',
      { ttl_seconds: ttlSeconds, ...observation(observed) }, {}, options);
    protocol(['RENEWED', 'EXPIRED'].includes(value.status));
    return { status: value.status, expires_at: nullableText(value.expires_at) };
  }
  async release(id, observed = {}, options) {
    const value = await this.#transport.request(`/v1/leases/${segment(id)}`, 'DELETE', observation(observed), {}, options);
    protocol(['RELEASED', 'NOT_ACTIVE'].includes(value.status));
    return { status: value.status };
  }
  async status(resource, options) {
    return state(await this.#transport.request(`/v1/resources/${segment(resource)}/status`, 'GET', undefined, {}, options));
  }
  async wait(resource, timeoutSeconds = 10, options) {
    integer(timeoutSeconds, 1, 20);
    const value = await this.#transport.request(`/v1/resources/${segment(resource)}/wait`, 'POST', { timeout_seconds: timeoutSeconds }, {}, options);
    protocol(typeof value.timed_out === 'boolean');
    return { ...state(value), timed_out: value.timed_out };
  }
}
import { invalid } from './transport.js';
function protocolInput(condition) { if (!condition) invalid(); }
