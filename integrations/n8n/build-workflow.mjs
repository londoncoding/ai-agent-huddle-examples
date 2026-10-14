import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const node = (name, type, parameters, position, typeVersion = 1) => ({ id: name.toLowerCase().replaceAll(' ', '-'), name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters });
const assignments = values => ({ assignments: { assignments: Object.entries(values).map(([name, value]) => ({ id: name, name, value, type: 'string' })) }, options: {} });
const ifNode = (name, expression, position) => node(name, 'if', {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [
    { id: name, leftValue: expression, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }
  ], combinator: 'and' }, options: {}
}, position, 2.2);
const httpOptions = { timeout: 20000, redirect: { redirect: { followRedirects: false } }, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } };
const acquire = node('Acquire CLAIM lease', 'httpRequest', {
  method: 'POST', url: 'https://claim.aiagenthuddle.com/v1/leases', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ resource: $json.resource, agent_id: "n8n-demo-worker", ttl_seconds: 60, request_id: $json.acquireRequestId }) }}', options: httpOptions
}, [460, 0], 4.2);
const release = node('Release known lease', 'httpRequest', {
  method: 'DELETE', url: '={{ "https://claim.aiagenthuddle.com/v1/leases/" + encodeURIComponent($("Acquire CLAIM lease").first().json.body.lease_id) }}',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ request_id: $("Configure demo").first().json.releaseRequestId }) }}', options: httpOptions
}, [1160, -100], 4.2);
for (const item of [acquire, release]) { item.retryOnFail = false; item.onError = 'stopWorkflow'; }
export const workflow = {
  name: 'AI Agent Huddle CLAIM — lease demonstration (no protected write)', active: false,
  nodes: [
    node('Run demo manually', 'manualTrigger', {}, [0, 0]),
    node('Configure demo', 'set', assignments({ resource: 'demo/n8n-claim', acquireRequestId: 'REPLACE_WITH_NEW_ACQUIRE_UUID', releaseRequestId: 'REPLACE_WITH_NEW_RELEASE_UUID' }), [220, 0], 3.4),
    acquire,
    ifNode('Valid GRANTED result', '={{ $json.statusCode >= 200 && $json.statusCode < 300 && $json.body?.status === "GRANTED" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test($json.body.lease_id ?? "") && typeof $json.body.fencing_token === "string" && /^[1-9][0-9]*$/.test($json.body.fencing_token) }}', [700, 0]),
    node('Demo only — no protected write', 'set', assignments({ message: 'GRANTED. This node performs no external or protected write. Storage must enforce fencing atomically.' }), [920, -100], 3.4),
    release,
    ifNode('Release confirmed', '={{ $json.statusCode >= 200 && $json.statusCode < 300 && ["RELEASED", "NOT_ACTIVE"].includes($json.body?.status) }}', [1380, -100]),
    node('Demo finished', 'set', assignments({ result: 'Known grant cleanup confirmed. No protected write was performed.' }), [1600, -180], 3.4),
    node('Release uncertain — stop', 'stopAndError', { errorMessage: 'Release outcome is unconfirmed. Stop work; do not automatically retry. Lease expires 60 seconds after acquisition. Keep the original release request ID for recovery.' }, [1600, 0]),
    ifNode('Expected DENIED result', '={{ $json.statusCode === 409 && $json.body?.status === "DENIED" }}', [920, 180]),
    node('DENIED — no work', 'set', assignments({ result: 'DENIED. No grant, demo work or release attempted.' }), [1160, 120], 3.4),
    node('Acquire uncertain — stop', 'stopAndError', { errorMessage: 'Acquisition was not confirmed. Do not start work or rerun as a new request. Preserve the acquire UUID. An unknown grant expires after its 60-second TTL.' }, [1160, 300]),
    node('Read this before running', 'stickyNote', { content: '## CLAIM demonstration\nConfigure the two UUIDs and a private Header Auth credential on BOTH HTTP nodes: Name Authorization, Value Bearer YOUR_CLAIM_KEY. Never paste a key into this workflow. Redirects and mutation retries are OFF. Only a validated GRANTED result reaches the demo node. It performs no protected write. Production storage must compare fencing tokens and commit atomically. Timeouts stop the workflow; unknown grants expire after 60 seconds. Rerunning with a new acquire UUID is a new request.', height: 260, width: 650 }, [120, -360])
  ],
  connections: {
    'Run demo manually': { main: [[{ node: 'Configure demo', type: 'main', index: 0 }]] },
    'Configure demo': { main: [[{ node: 'Acquire CLAIM lease', type: 'main', index: 0 }]] },
    'Acquire CLAIM lease': { main: [[{ node: 'Valid GRANTED result', type: 'main', index: 0 }]] },
    'Valid GRANTED result': { main: [[{ node: 'Demo only — no protected write', type: 'main', index: 0 }], [{ node: 'Expected DENIED result', type: 'main', index: 0 }]] },
    'Demo only — no protected write': { main: [[{ node: 'Release known lease', type: 'main', index: 0 }]] },
    'Release known lease': { main: [[{ node: 'Release confirmed', type: 'main', index: 0 }]] },
    'Release confirmed': { main: [[{ node: 'Demo finished', type: 'main', index: 0 }], [{ node: 'Release uncertain — stop', type: 'main', index: 0 }]] },
    'Expected DENIED result': { main: [[{ node: 'DENIED — no work', type: 'main', index: 0 }], [{ node: 'Acquire uncertain — stop', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none', saveManualExecutions: false }, pinData: {}, tags: []
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await writeFile(new URL('./claim-demo.json', import.meta.url), JSON.stringify(workflow, null, 2) + '\n');
