import test from 'node:test';
import assert from 'node:assert/strict';
import { run as once } from '../once/once-first-operation.mjs';
import { run as claim } from '../claim/claim-contention.mjs';
const id='12345678-1234-4123-8123-123456789012';
const id2='12345678-1234-4123-8123-123456789013';
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
const onceEnv={ONCE_API_KEY:'fixture',STRIPE_TEST_KEY:'sk_test_fixture',ONCE_OPERATION_KEY:'fixed-logical-key'};
test('ONCE unresolved response stays unresolved and never calls retry; GET omits provider credential',async()=>{
 const calls=[], logs=[];
 const result=await once({env:onceEnv,log:v=>logs.push(v),fetcher:async(url,init)=>{calls.push({url,init});return response({operation_id:id,status:'UNKNOWN'});}});
 assert.equal(result.status,'UNKNOWN');assert.equal(calls.length,3);
 assert.ok(calls.every(c=>!c.url.includes('/retry')&&c.init.redirect==='error'));
 assert.equal(calls[0].init.headers['Idempotency-Key'],calls[1].init.headers['Idempotency-Key']);
 assert.equal(calls[2].init.headers['Once-Stripe-Test-Key'],undefined);
 assert.ok(logs.some(v=>v.includes('do not redispatch')));assert.ok(!logs.join('').includes('sk_test_fixture'));
});
test('ONCE rejects live credentials before network and stops on conflicting input',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return response({error:'IDEMPOTENCY_CONFLICT'},409);};
 await assert.rejects(once({env:{...onceEnv,STRIPE_TEST_KEY:'sk_live_fixture'},fetcher}),/sandbox/);assert.equal(calls,0);
 await assert.rejects(once({env:onceEnv,fetcher}),/409/);assert.equal(calls,1);
});
test('CLAIM example cleans up both grants if exclusivity is violated',async()=>{
 let grants=0;const released=[];
 await assert.rejects(claim({env:{CLAIM_API_KEY:'fixture'},log:()=>{},fetcher:async(url,init)=>{
  assert.equal(init.redirect,'error');
  if(init.method==='DELETE'){released.push(url);return response({status:'RELEASED'});}
  grants++;return response({status:'GRANTED',lease_id:grants===1?id:id2,fencing_token:String(grants)});
 }}),/Competing acquisition/);
 assert.equal(released.length,2);assert.ok(released.some(u=>u.endsWith(id)));assert.ok(released.some(u=>u.endsWith(id2)));
});
test('CLAIM lifecycle compares integer tokens beyond Number precision and cleans final grant',async()=>{
 let grants=0;const released=[];
 await claim({env:{CLAIM_API_KEY:'fixture'},log:()=>{},fetcher:async(url,init)=>{
  if(init.method==='DELETE'){released.push(url);return response({status:'RELEASED'});}
  grants++;if(grants===2)return response({status:'DENIED'},409);
  return response({status:'GRANTED',lease_id:grants===1?id:id2,fencing_token:grants===1?'9007199254740992':'9007199254740993'});
 }});
 assert.equal(released.length,2);
});
test('CLAIM cannot report success when final cleanup fails',async()=>{
 let grants=0,releases=0;
 await assert.rejects(claim({env:{CLAIM_API_KEY:'fixture'},log:()=>{},fetcher:async(url,init)=>{
  if(init.method==='DELETE'){releases++;return response({status:releases===1?'RELEASED':'ERROR'},releases===1?200:503);}
  grants++;if(grants===2)return response({status:'DENIED'},409);
  return response({status:'GRANTED',lease_id:grants===1?id:id2,fencing_token:String(grants)});
 }}),/Cleanup could not be confirmed/);
});
