# CLAIM tools in DeepAgents and LangChain

A runnable, entirely offline example using the **installed official frameworks**, the public AI Agent Huddle CLAIM SDK, a deterministic `BaseChatModel`, and injected fetch fixtures. The default demonstration uses DeepAgents `createDeepAgent`; the tests also execute LangChain `createAgent` with the same tools. No account, API key, hosted service, paid model, or LangSmith subscription is needed.

From the repository root, using Node.js 22+:

```sh
npm run build
npm ci --prefix integrations/langchain --ignore-scripts
node integrations/langchain/run-demo.mjs
node --test integrations/langchain/integration.test.mjs
```

Dependency installation requires npm registry access; running the demo and tests uses no external network. The SDK is imported from this repository's built `packages/claim/dist/index.js`, so build it first. Framework dependencies are pinned in the private example package and lockfile; this example is not an npm package release.

Expected output: `claim_acquire: GRANTED`, `claim_status: BUSY`, `claim_release: RELEASED`, four mock-model invocations, three **fixture requests**, zero outbound fetch attempts and zero protected writes. Fixture requests are SDK invocations handled entirely in memory. They are not real HTTP service requests. The framework's agent graph, message loop, schema-checked tools and SDK response validation actually run.

`agent.mjs` scopes all three tools to a resource chosen by host code. Credentials, lease IDs and request IDs stay out of model arguments. A tool cannot acquire twice, status does not grant ownership, and release is attempted once. DENIED or uncertain acquisition stops. A known grant is released in cleanup if the model stops early; uncertain release is not automatically repeated. The default TTL is 60 seconds. The demo disables all four LangChain/LangSmith tracing environment flags before framework imports and forbids outbound global fetch, including when tracing flags are inherited.

**There is no protected write in this example.** Production downstream storage must compare fencing tokens and commit effects atomically. Tokens are decimal strings; use `BigInt`, never `Number`. Lease expiry does not terminate an old worker, and fencing does not make individual writes idempotent. Persist the resource, inputs and request IDs before dispatch in a real integration; this demonstration keeps them in memory. A new acquire request ID is a new request. Unknown grants expire after TTL; process interruption can prevent cleanup. Never let a model convert an uncertain acquisition into permission to write.

To integrate the tools with your own client, pass it to `runClaimAgent(client, { resource, agentId, model, framework: 'deepagents' })`. This offline demo is not a ready-made production agent: replacing the mock model, removing the network guard or adding real effects requires your own access controls, durable recovery, timeout/renewal policy and downstream fencing. Keep project keys in server-side configuration, never tool arguments, prompts or trace exports. You can select `framework: 'langchain'` to use `createAgent` instead.

Verified 2026-10-14 on Node **22.17.0** with DeepAgents **1.15.0**, LangChain **1.5.16**, `@langchain/core` **1.2.17**, LangGraph **1.5.0**, Zod **4.6.7**, and this repository's CLAIM SDK **0.1.1**. Seven offline tests passed: real DeepAgents loop, real LangChain loop, denial, uncertain acquisition, status-failure cleanup, uncertain release, and inherited tracing isolation. This is local integration evidence, not hosted CLAIM, real model, production storage or benchmark validation.

Official framework references: [DeepAgents JavaScript](https://docs.langchain.com/oss/javascript/deepagents/overview), [LangChain agents](https://docs.langchain.com/oss/javascript/langchain/agents). Product contract and safety limits: [CLAIM API](https://claim.aiagenthuddle.com/docs.html), [leases and fencing](https://claim.aiagenthuddle.com/guides/leases-and-fencing.html).
