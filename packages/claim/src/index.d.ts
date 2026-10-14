export { HuddleError } from './options.js';
export type { ClientOptions, RequestOptions, Observation, ErrorCode } from './options.js';
import type { ClientOptions, RequestOptions, Observation } from './options.js';
export interface AcquireInput extends Observation { resource: string; agent_id: string; ttl_seconds: number; mode?: 'exclusive' | 'semaphore'; capacity?: number }
export interface Granted { status: 'GRANTED'; lease_id: string; resource: string; /** Decimal string. Compare using BigInt, never Number. */ fencing_token: string; expires_at: string }
export interface Denied { status: 'DENIED'; resource: string; retry_after_seconds: number }
export type AcquireResult = Granted | Denied;
export interface Renewal { status: 'RENEWED' | 'EXPIRED'; expires_at: string | null }
export interface Release { status: 'RELEASED' | 'NOT_ACTIVE' }
export interface ResourceStatus { resource: string; status: 'AVAILABLE' | 'BUSY'; active: number; capacity: number | null; mode: 'exclusive' | 'semaphore' | null; next_expiry: string | null }
export interface WaitResult extends ResourceStatus { timed_out: boolean }
export declare class ClaimClient {
  constructor(options: ClientOptions);
  acquire(input: AcquireInput, options?: RequestOptions): Promise<AcquireResult>;
  renew(id: string, ttlSeconds: number, observation?: Observation, options?: RequestOptions): Promise<Renewal>;
  release(id: string, observation?: Observation, options?: RequestOptions): Promise<Release>;
  status(resource: string, options?: RequestOptions): Promise<ResourceStatus>;
  /** Availability hint only; always acquire before starting work. */
  wait(resource: string, timeoutSeconds?: number, options?: RequestOptions): Promise<WaitResult>;
}
