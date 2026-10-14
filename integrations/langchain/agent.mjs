import { randomUUID } from 'node:crypto';
import { createAgent, tool } from 'langchain';
import { createDeepAgent } from 'deepagents';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';
import { z } from 'zod';

// A deterministic offline model. Real LangChain/LangGraph execute the tool loop.
// No model provider, tracing service or language-model API is used.
export class OfflineClaimModel extends BaseChatModel {
  constructor() { super({}); this.invocations = 0; }
  _llmType() { return 'offline-claim-demonstration'; }
  bindTools() { return this; }
  async _generate(messages) {
    this.invocations++;
    const last = messages.at(-1);
    let name;
    if (last.getType() === 'human') name = 'claim_acquire';
    else if (last.getType() === 'tool') {
      const result = JSON.parse(last.content);
      if (last.name === 'claim_acquire' && result.status === 'GRANTED') name = 'claim_status';
      else if (last.name === 'claim_status' && result.status !== 'STOP') name = 'claim_release';
    }
    const message = name
      ? new AIMessage({ content: '', tool_calls: [{ name, args: {}, id: `demo-${this.invocations}`, type: 'tool_call' }] })
      : new AIMessage({ content: 'Demo finished. No protected write was performed; production storage must enforce fencing atomically.' });
    return { generations: [{ text: message.content, message }] };
  }
}

export async function runClaimAgent(client, { resource = `langchain-demo/${randomUUID()}`, agentId = 'offline-example-worker', model = new OfflineClaimModel(), framework = 'deepagents' } = {}) {
  const acquireInput = { resource, agent_id: agentId, ttl_seconds: 60, request_id: randomUUID() };
  const releaseObservation = { request_id: randomUUID() };
  let phase = 'READY'; let grant; let cleanup = 'NO_KNOWN_GRANT';
  const events = [];
  const safeError = error => ({ status: 'STOP', code: ['INVALID_ARGUMENT', 'INVALID_RESPONSE', 'HTTP_ERROR', 'NETWORK_ERROR', 'TIMEOUT', 'ABORTED'].includes(error?.code) ? error.code : 'UNEXPECTED' });
  const acquire = tool(async () => {
    if (phase !== 'READY') return JSON.stringify({ status: 'STOP', code: 'ALREADY_ATTEMPTED' });
    phase = 'ACQUIRE_PENDING';
    try {
      const result = await client.acquire(acquireInput);
      events.push({ tool: 'claim_acquire', status: result.status });
      phase = result.status === 'GRANTED' ? 'HELD' : 'DENIED';
      if (result.status === 'GRANTED') grant = result;
      return JSON.stringify(result.status === 'GRANTED' ? { status: 'GRANTED', fencing_token: result.fencing_token } : { status: 'DENIED' });
    } catch (error) { phase = 'ACQUIRE_UNCERTAIN'; events.push({ tool: 'claim_acquire', status: 'STOP' }); return JSON.stringify(safeError(error)); }
  }, { name: 'claim_acquire', description: 'Acquire the fixed demonstration resource once. DENIED or uncertain means stop. Never performs a protected write.', schema: z.object({}).strict() });
  const status = tool(async () => {
    if (phase !== 'HELD') return JSON.stringify({ status: 'STOP', code: 'NO_KNOWN_GRANT' });
    try { const result = await client.status(resource); events.push({ tool: 'claim_status', status: result.status }); return JSON.stringify({ status: result.status }); }
    catch (error) { events.push({ tool: 'claim_status', status: 'STOP' }); return JSON.stringify(safeError(error)); }
  }, { name: 'claim_status', description: 'Read an availability hint. It does not grant authority to write.', schema: z.object({}).strict() });
  async function releaseKnown() {
    if (phase !== 'HELD' || !grant) return { status: 'STOP', code: 'NO_KNOWN_GRANT' };
    phase = 'RELEASE_PENDING';
    try { const result = await client.release(grant.lease_id, releaseObservation); phase = 'RELEASED'; cleanup = result.status; events.push({ tool: 'claim_release', status: result.status }); return result; }
    catch (error) { phase = 'RELEASE_UNCERTAIN'; cleanup = 'UNCONFIRMED'; events.push({ tool: 'claim_release', status: 'STOP' }); return safeError(error); }
  }
  const release = tool(async () => JSON.stringify(await releaseKnown()), {
    name: 'claim_release', description: 'Release the known demo lease once. Failure stops; it is not automatically retried.', schema: z.object({}).strict()
  });
  if (!['deepagents', 'langchain'].includes(framework)) throw new Error('Unsupported demonstration framework');
  const options = { model, tools: [acquire, status, release], systemPrompt: 'Demonstrate CLAIM acquire, inspect, release. No protected writes. Stop on DENIED or STOP.' };
  const agent = framework === 'deepagents' ? createDeepAgent(options) : createAgent(options);
  let messages;
  try {
    const result = await agent.invoke({ messages: [{ role: 'user', content: 'Run the lease coordination demonstration.' }] }, { recursionLimit: 10 });
    messages = result.messages;
  } finally {
    // Covers model failure or early stop after a known grant. Never repeats release.
    if (phase === 'HELD') await releaseKnown();
  }
  return { framework, events, cleanup, phase, modelInvocations: model.invocations, messages,
    recovery: { acquire_request_id: acquireInput.request_id, release_request_id: releaseObservation.request_id }, protectedWrites: 0 };
}
