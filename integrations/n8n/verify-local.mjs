// Executes the real imported workflow with n8n's CLI against loopback fixtures.
// Install n8n separately in an ignored directory. Never supply real credentials.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isolatedEnvironment } from './environment.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
await mkdir(resolve(root, '.local'), { recursive: true });
const scratch = await mkdtemp(resolve(root, '.local', 'n8n-integration-'));
const executable = process.env.N8N_NODE_EXECUTABLE ?? process.execPath;
const cli = process.env.N8N_CLI_PATH ?? resolve(root, '.local/n8n-runtime/node_modules/n8n/bin/n8n');
await mkdir(scratch, { recursive: true });
await writeFile(resolve(root, '.local', 'n8n-integration-latest.json'), JSON.stringify({ scratch }));
const env = isolatedEnvironment(scratch);
async function command(args) {
  return await new Promise((done, reject) => {
    // n8n auto-loads .env from cwd: never launch inside the user's checkout.
    const child = spawn(executable, [cli, ...args], { env, cwd: scratch, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const chunks = []; child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => chunks.push(chunk));
    child.on('error', reject);
    const timer = setTimeout(() => { child.kill(); reject(new Error('Local n8n verification exceeded 60 seconds.')); }, 60000);
    child.on('exit', code => { clearTimeout(timer); done({ code, output: Buffer.concat(chunks).toString() }); });
  });
}
const credential = resolve(scratch, 'synthetic-credential.json');
await writeFile(credential, JSON.stringify([{ id: 'synthetic-claim-header', name: 'Synthetic local fixture only', type: 'httpHeaderAuth',
  data: { name: 'Authorization', value: 'Bearer synthetic-demo-key' } }]));
const imported = await command(['import:credentials', `--input=${credential}`]);
await writeFile(resolve(scratch, 'import.log'), imported.output);
assert.equal(imported.code, 0, 'n8n credential import failed; inspect ignored local import.log.');
let scenario; let calls = [];
const leaseId = '00000000-0000-4000-8000-000000000001';
const server = createServer(async (request, response) => {
  try {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    calls.push({ method: request.method, path: request.url, body });
    assert.equal(request.headers.authorization, 'Bearer synthetic-demo-key');
    response.setHeader('content-type', 'application/json');
    if (request.method === 'POST' && request.url === '/v1/leases') {
      assert.equal(body.ttl_seconds, 60); assert.match(body.request_id, /^[0-9a-f-]{36}$/);
      if (scenario === 'acquire-uncertain') { request.socket.destroy(); return; }
      if (scenario === 'redirect') { response.statusCode = 302; response.setHeader('location', '/leak'); response.end('{}'); return; }
      if (scenario === 'denied') { response.statusCode = 409; response.end(JSON.stringify({ status: 'DENIED', resource: body.resource, retry_after_seconds: 60 })); return; }
      response.end(JSON.stringify({ status: 'GRANTED', lease_id: leaseId, resource: body.resource, fencing_token: '9007199254740993123', expires_at: new Date(Date.now() + 60000).toISOString() }));
    } else if (request.method === 'DELETE' && request.url === `/v1/leases/${leaseId}`) {
      if (scenario === 'release-uncertain') { response.statusCode = 503; response.end('{"error":"synthetic-sensitive-server-detail"}'); }
      else response.end('{"status":"RELEASED"}');
    } else { response.statusCode = 500; response.end('{}'); }
  } catch { response.statusCode = 500; response.end('{}'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const evidence = [];
try {
  const template = JSON.parse(await readFile(new URL('./claim-demo.json', import.meta.url), 'utf8'));
  for (scenario of ['granted', 'denied', 'acquire-uncertain', 'release-uncertain', 'redirect']) {
    calls = [];
    const local = structuredClone(template);
    local.id = `claimFixture-${scenario}`;
    const config = local.nodes.find(node => node.name === 'Configure demo').parameters.assignments.assignments;
    config.find(field => field.name === 'acquireRequestId').value = '00000000-0000-4000-8000-000000000002';
    config.find(field => field.name === 'releaseRequestId').value = '00000000-0000-4000-8000-000000000003';
    for (const node of local.nodes.filter(node => node.type === 'n8n-nodes-base.httpRequest')) {
      node.parameters.url = node.parameters.url.replace('https://claim.aiagenthuddle.com', origin);
      node.credentials = { httpHeaderAuth: { id: 'synthetic-claim-header', name: 'Synthetic local fixture only' } };
    }
    assert.ok(!JSON.stringify(local).includes('https://claim.aiagenthuddle.com'), 'Fixture must not call hosted CLAIM.');
    const workflowFile = resolve(scratch, `${scenario}.json`); await writeFile(workflowFile, JSON.stringify([local]));
    const workflowImport = await command(['import:workflow', `--input=${workflowFile}`]);
    await writeFile(resolve(scratch, `${scenario}-import.log`), workflowImport.output);
    assert.equal(workflowImport.code, 0, 'Local fixture workflow import failed.');
    const execution = await command(['execute', `--id=${local.id}`, '--rawOutput']);
    await writeFile(resolve(scratch, `${scenario}.log`), execution.output);
    const expected = scenario === 'granted' || scenario === 'release-uncertain' ? ['POST', 'DELETE'] : ['POST'];
    assert.deepEqual(calls.map(call => call.method), expected, `Unexpected requests for ${scenario}. See ignored fixture log.`);
    assert.equal(calls.filter(call => call.path === '/leak').length, 0, 'Redirect must never be followed.');
    if (scenario === 'granted' || scenario === 'denied') assert.equal(execution.code, 0, `Expected successful demo branch: ${scenario}`);
    else assert.notEqual(execution.code, 0, `Uncertain outcome must fail closed: ${scenario}`);
    if (scenario === 'granted') assert.ok(execution.output.includes('Known grant cleanup confirmed'));
    if (scenario === 'denied') assert.ok(execution.output.includes('DENIED. No grant'));
    evidence.push({ scenario, passed: true, requestMethods: expected, exitCode: execution.code });
    console.log(`PASS n8n ${scenario}: ${expected.join(' -> ')}, exit ${execution.code}`);
  }
} finally { await new Promise(resolve => server.close(resolve)); }
await writeFile(resolve(scratch, 'evidence.json'), JSON.stringify({ date: '2026-10-14', n8n: '2.43.5', harnessNode: process.version,
  n8nNode: execFileSync(executable, ['--version'], { env, cwd: scratch, encoding: 'utf8', windowsHide: true }).trim(),
  runtimeNode: executable, evidence, protectedWrites: 0 }, null, 2));
