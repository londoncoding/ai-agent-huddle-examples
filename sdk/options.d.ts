export type ErrorCode = 'INVALID_ARGUMENT' | 'INVALID_RESPONSE' | 'HTTP_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'ABORTED';
export declare class HuddleError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
}
export interface ClientOptions {
  /** Project API key. Keep this client on the server. */
  apiKey: string;
  /** HTTPS origin only. Changing this sends credentials to that origin. */
  baseUrl?: string;
  /** Defaults to 30000; integer between 1 and 120000. */
  timeoutMs?: number;
  /** Trusted fetch implementation; receives credentials. */
  fetch?: typeof globalThis.fetch;
}
export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
export interface Observation { request_id?: string; process_session_id?: string }
