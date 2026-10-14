// Public HTTP transport only. No service implementation or storage access.
const MAX_RESPONSE_BYTES = 1024 * 1024;
export class HuddleError extends Error {
  constructor(code, status, retryAfterSeconds) {
    super(status === undefined ? `AI Agent Huddle ${code}` : `AI Agent Huddle HTTP ${status}`);
    this.name = 'HuddleError';
    this.code = code;
    if (status !== undefined) this.status = status;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}
export function invalid() { throw new HuddleError('INVALID_ARGUMENT'); }
export function text(value, max = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value;
}
export function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}
export function segment(value) {
  text(value);
  // Dot segments are normalized by URL/fetch even when percent encoded.
  if (value === '.' || value === '..') invalid();
  try { return encodeURIComponent(value); } catch { invalid(); }
}
export function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function protocol(condition) { if (!condition) throw new HuddleError('INVALID_RESPONSE'); }
export function uuid(value) {
  protocol(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
  return value;
}
export function responseText(value, max = 512) {
  protocol(typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value));
  return value;
}
export function nullableText(value) { return value === null ? null : responseText(value); }
export function observation(value = {}) {
  if (!record(value)) invalid();
  const output = {};
  for (const field of ['request_id', 'process_session_id']) {
    if (value[field] !== undefined) {
      text(value[field], 36);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value[field])) invalid();
      output[field] = value[field];
    }
  }
  return output;
}
function timeout(value) { return integer(value, 1, 120000); }
export class Transport {
  #origin; #apiKey; #fetch; #timeoutMs;
  constructor(defaultOrigin, options) {
    if (!record(options)) invalid();
    text(options.apiKey, 4096);
    let endpoint;
    try { endpoint = new URL(options.baseUrl ?? defaultOrigin); } catch { invalid(); }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') invalid();
    this.#origin = endpoint.origin;
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== 'function') invalid();
    this.#timeoutMs = timeout(options.timeoutMs ?? 30000);
  }
  async request(path, method, body, providerHeaders = {}, options = {}) {
    if (!record(options)) invalid();
    const timeoutSignal = AbortSignal.timeout(timeout(options.timeoutMs ?? this.#timeoutMs));
    let signal = timeoutSignal;
    if (options.signal !== undefined) {
      if (!(options.signal instanceof AbortSignal)) invalid();
      signal = AbortSignal.any([signal, options.signal]);
    }
    if (signal.aborted) throw new HuddleError(timeoutSignal.aborted ? 'TIMEOUT' : 'ABORTED');
    let serialized;
    try { serialized = body === undefined ? undefined : JSON.stringify(body); } catch { invalid(); }
    const headers = { Authorization: `Bearer ${this.#apiKey}`, Accept: 'application/json', ...providerHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await this.#fetch(this.#origin + path, {
        method, headers, body: serialized, signal, redirect: 'error', credentials: 'omit', cache: 'no-store'
      });
    } catch {
      throw new HuddleError(timeoutSignal.aborted ? 'TIMEOUT' : signal.aborted ? 'ABORTED' : 'NETWORK_ERROR');
    }
    protocol(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599);
    const retry = response.headers.get('retry-after');
    const retryAfterSeconds = retry && /^\d{1,6}$/.test(retry) ? Number(retry) : undefined;
    // A denial is a typed acquire result; all other non-2xx responses stay opaque.
    if (!response.ok && !(method === 'POST' && path === '/v1/leases' && response.status === 409)) {
      try { await response.body?.cancel(); } catch { /* Do not expose stream errors. */ }
      throw new HuddleError('HTTP_ERROR', response.status, retryAfterSeconds);
    }
    protocol(response.headers.get('content-type')?.toLowerCase().includes('application/json'));
    let value;
    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks = []; let bytes = 0;
      try {
        while (true) {
          const { value: chunk, done } = await reader.read();
          if (done) break;
          bytes += chunk.byteLength;
          if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error(); }
          chunks.push(chunk);
        }
      } finally { reader.releaseLock(); }
      const content = new Uint8Array(bytes); let offset = 0;
      for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength; }
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content));
    } catch {
      throw new HuddleError(timeoutSignal.aborted ? 'TIMEOUT' : signal.aborted ? 'ABORTED' : 'INVALID_RESPONSE');
    }
    protocol(record(value));
    if (!response.ok && value.status !== 'DENIED') throw new HuddleError('HTTP_ERROR', response.status, retryAfterSeconds);
    return value;
  }
}
