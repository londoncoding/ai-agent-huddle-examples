export { HuddleError } from './options.js';
export type { ClientOptions, RequestOptions, ErrorCode } from './options.js';
import type { ClientOptions, RequestOptions } from './options.js';
export type OperationStatus = 'CREATED' | 'EXECUTING' | 'COMMITTED' | 'NOT_COMMITTED' | 'UNKNOWN' | 'PROVEN_COMMITTED' | 'PROVEN_NOT_COMMITTED' | 'AMBIGUOUS';
export interface Operation { operation_id: string; status: OperationStatus; retry_safe: boolean; provider_reference?: string }
export interface Reconciliation extends Operation { previous_status: OperationStatus; evidence: { reason: string } }
export type GitHubCredentials = { githubToken: string; githubRepository: string; stripeTestKey?: never };
export type StripeTestCredentials = { stripeTestKey: string; githubToken?: never; githubRepository?: never };
export type ProviderCredentials = GitHubCredentials | StripeTestCredentials;
export interface GitHubIssue { provider: 'github'; action: 'create_issue'; parameters: { title: string; body: string }; metadata?: Record<string, unknown> }
export interface StripeTestPaymentIntent { provider: 'stripe'; action: 'create_payment_intent'; parameters: { amount: number; currency: string }; metadata?: Record<string, unknown> }
export declare class OnceClient {
  constructor(options: ClientOptions);
  create(key: string, input: GitHubIssue, provider: GitHubCredentials, options?: RequestOptions): Promise<Operation>;
  create(key: string, input: StripeTestPaymentIntent, provider: StripeTestCredentials, options?: RequestOptions): Promise<Operation>;
  get(id: string, options?: RequestOptions): Promise<Operation>;
  reconcile(id: string, provider: ProviderCredentials, options?: RequestOptions): Promise<Reconciliation>;
  retry(id: string, provider: ProviderCredentials, options?: RequestOptions): Promise<Operation>;
}
