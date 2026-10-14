// Disable external framework tracing for this entirely offline demonstration.
import { disableTracing, forbidNetwork } from './offline-environment.mjs';
disableTracing();
const network = forbidNetwork();
const { fixtureClient } = await import('./fixture.mjs');
const { runClaimAgent } = await import('./agent.mjs');
const { client, calls } = fixtureClient();
const result = await runClaimAgent(client);
console.log(JSON.stringify({ framework: 'DeepAgents createDeepAgent (offline model)', events: result.events,
  modelInvocations: result.modelInvocations, fixtureRequests: calls.length, cleanup: result.cleanup,
  outboundNetworkAttempts: network.attempts(), protectedWrites: result.protectedWrites }, null, 2));
network.restore();
