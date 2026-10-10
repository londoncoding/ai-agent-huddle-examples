import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Single local broker: compare and commit synchronously. Production needs a durable transaction.
export function broker(){let latest=0n,value;return {commit(effect){const token=BigInt(effect.fencing_token),expiry=Date.parse(effect.expires_at);if(!Number.isFinite(expiry)||expiry<=Date.now()||token<latest)return false;latest=token;value=effect.payload;return true;},get value(){return value;}};}
export async function run({env=process.env,log=console.log}={}){
 assert.ok(env.CLAIM_API_KEY,'Set CLAIM_API_KEY.');
 const resource='two-workers/'+randomUUID(),workers=[],gate=broker();
 function start(){
  const child=fork(fileURLToPath(new URL('./worker.mjs',import.meta.url)),[],{env:{...process.env,CLAIM_API_KEY:env.CLAIM_API_KEY,CLAIM_SAMPLE_ORIGIN:env.CLAIM_SAMPLE_ORIGIN??'https://claim.aiagenthuddle.com'},stdio:['ignore','ignore','ignore','ipc']});
  const pending=new Map();child.on('message',m=>{const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m);}});
  child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Worker exited. Stop work; unknown grants expire after 60 seconds.'));}pending.clear();});
  const rpc=command=>new Promise((resolve,reject)=>{if(!child.connected){reject(Error('Worker is disconnected.'));return;}const id=randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(Error('Worker timed out. Stop work; unknown grants expire after 60 seconds.'));},20000);pending.set(id,{resolve,reject,timer});child.send({id,command,resource},e=>{if(e){clearTimeout(timer);pending.delete(id);reject(e);}});});
  const worker={child,rpc};workers.push(worker);return worker;
 }
 const a=start(),b=start();
 try{
  const first=await a.rpc('acquire');assert.equal(first.value.status,'GRANTED');
  assert.equal((await a.rpc('renew')).value.status,'RENEWED');
  const denied=await b.rpc('acquire');assert.notEqual(first.pid,denied.pid);assert.equal(denied.value.status,'DENIED');
  assert.equal((await a.rpc('release')).value.status,'RELEASED');
  const next=await b.rpc('acquire');assert.equal(next.value.status,'GRANTED');assert.ok(BigInt(next.value.fencing_token)>BigInt(first.value.fencing_token));
  assert.equal(gate.commit((await b.rpc('effect')).value),true);
  assert.equal(gate.commit((await a.rpc('effect')).value),false);
  log('PASS: two different worker processes contended, handed over ownership, and the local broker rejected the old token.');
  log('This is a synthetic demonstration with a non-durable local broker, not customer traction or a production storage implementation.');
  return {passed:true,pids:[first.pid,next.pid]};
 }finally{
  const cleanup=await Promise.allSettled(workers.map(async w=>{const r=await w.rpc('release');assert.ok(['RELEASED','NOT_ACTIVE'].includes(r.value.status));}));
  workers.forEach(w=>{if(w.child.connected)w.child.disconnect();w.child.kill();});
  if(cleanup.some(r=>r.status==='rejected'))throw Error('Cleanup unconfirmed. Stop work; grants expire after at most 60 seconds from their last renewal.');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(e=>{console.error(e.message);process.exitCode=1;});
