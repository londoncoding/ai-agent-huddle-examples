import { ClaimClient } from '../../packages/claim/dist/index.js';
const leaseId = '00000000-0000-4000-8000-000000000001';
export function fixtureClient({ acquire = 'GRANTED', releaseFails = false, statusFails = false } = {}) {
  const calls = [];
  const client = new ClaimClient({ apiKey: 'synthetic-demo-key', fetch: async (url, options) => {
    if (!url.startsWith('https://claim.aiagenthuddle.com/v1/')) throw new Error('Unexpected destination');
    calls.push({ method: options.method, path: new URL(url).pathname, body: options.body ? JSON.parse(options.body) : undefined });
    let body; let status = 200;
    if (options.method === 'POST' && url.endsWith('/v1/leases')) {
      if (acquire === 'UNCERTAIN') throw new Error('synthetic transport failure');
      if (acquire === 'DENIED') { status = 409; body = { status: 'DENIED', resource: 'demo', retry_after_seconds: 60 }; }
      else body = { status: 'GRANTED', lease_id: leaseId, resource: 'demo', fencing_token: '9007199254740993123', expires_at: new Date(Date.now() + 60000).toISOString() };
    } else if (options.method === 'GET') {
      if (statusFails) throw new Error('synthetic status failure');
      body = { resource: 'demo', status: 'BUSY', active: 1, capacity: 1, mode: 'exclusive', next_expiry: new Date(Date.now() + 60000).toISOString() };
    } else if (options.method === 'DELETE') {
      if (releaseFails) throw new Error('synthetic release failure');
      body = { status: 'RELEASED' };
    } else throw new Error('Unexpected request');
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  } });
  return { client, calls };
}
