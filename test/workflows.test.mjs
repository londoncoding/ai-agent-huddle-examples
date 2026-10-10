import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {run as github} from '../once/github-recovery.mjs';
import {run as twoWorkers,broker} from '../claim/two-workers.mjs';
const id='12345678-1234-4123-8123-123456789012';
test('ONCE restart inspects saved receipt without redispatch; ambiguous evidence never triggers retry',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'once-example-'));
 const env={ONCE_API_KEY:'fixture',GITHUB_TOKEN:'github_pat_fixture',GITHUB_REPOSITORY:'fixture/repo',ONCE_GITHUB_OPERATION_KEY:'persisted-key',ONCE_ALLOW_GITHUB_WRITE:'true',ONCE_RECEIPT_PATH:path.join(dir,'receipt.json')};
 const calls=[];const fetcher=async(url,options)=>{calls.push({url,method:options.method});return new Response(JSON.stringify({operation_id:id,status:url.endsWith('/reconcile')?'AMBIGUOUS':options.method==='POST'?'UNKNOWN':'UNKNOWN'}));};
 try{
  await github({env,fetcher,log:()=>{}});const originalCalls=calls.length;
  await github({env:{...env,ONCE_ALLOW_GITHUB_WRITE:'false'},fetcher,log:()=>{}});
  assert.equal(calls.length-originalCalls,2);assert.ok(calls.slice(originalCalls).every(c=>c.url.endsWith('/'+id)||c.url.endsWith('/reconcile')));
  assert.ok(!calls.some(c=>c.url.endsWith('/retry')));assert.ok(!(await fs.readFile(env.ONCE_RECEIPT_PATH,'utf8')).includes('github_pat_fixture'));
  await assert.rejects(github({env:{...env,ONCE_GITHUB_OPERATION_KEY:'changed'},fetcher}),/Checkpoint inputs changed/);
 }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('once-example-'));await fs.rm(dir,{recursive:true,force:true});}
});
test('broker refuses stale, expired and invalid-expiry effects with large integer tokens',()=>{
 const gate=broker(),future=new Date(Date.now()+60000).toISOString();
 assert.equal(gate.commit({fencing_token:'9007199254740993',expires_at:future,payload:'new'}),true);
 assert.equal(gate.commit({fencing_token:'9007199254740992',expires_at:future,payload:'old'}),false);
 assert.equal(gate.commit({fencing_token:'9007199254740994',expires_at:'invalid',payload:'invalid'}),false);
 assert.equal(gate.commit({fencing_token:'9007199254740994',expires_at:'2000-01-01',payload:'expired'}),false);assert.equal(gate.value,'new');
});
test('two real OS processes complete contention/handover against a local fixture and release grants',async()=>{
 let holder=null,token=0;const released=[];
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw),expiry=new Date(Date.now()+60000).toISOString();
  let value,status=200;
  if(req.method==='DELETE'){released.push(req.url);holder=null;value={status:'RELEASED'};}
  else if(req.url.endsWith('/renew'))value={status:'RENEWED',expires_at:expiry};
  else if(holder){value={status:'DENIED'};status=409;}
  else{holder=body.agent_id;value={status:'GRANTED',lease_id:id,fencing_token:String(++token),expires_at:expiry};}
  res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const result=await twoWorkers({env:{CLAIM_API_KEY:'fixture',CLAIM_SAMPLE_ORIGIN:'http://127.0.0.1:'+server.address().port},log:()=>{}});assert.equal(new Set(result.pids).size,2);assert.ok(released.length>=2);}finally{await new Promise(resolve=>server.close(resolve));}
});
