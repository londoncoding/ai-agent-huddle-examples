import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// A real GitHub write. The local checkpoint contains no credentials.
export async function run({env=process.env,fetcher=fetch,log=console.log}={}) {
 const key=env.ONCE_GITHUB_OPERATION_KEY, repo=env.GITHUB_REPOSITORY;
 assert.ok(env.ONCE_API_KEY,'Set ONCE_API_KEY.');
 assert.match(key??'',/^\S{1,200}$/,'Set and preserve ONCE_GITHUB_OPERATION_KEY.');
 assert.match(repo??'',/^[\w.-]+\/[\w.-]+$/,'Set GITHUB_REPOSITORY=owner/repository.');
 assert.ok(env.GITHUB_TOKEN?.startsWith('github_pat_'),'Use a fine-grained GitHub token with Issues read/write for this repository.');
 const file=path.resolve(env.ONCE_RECEIPT_PATH??'.local/once-github.json');
 const input={provider:'github',action:'create_issue',parameters:{title:'ONCE recovery example',body:'Created by the AI Agent Huddle public recovery example. Reuse the same logical operation key when resuming.'}};
 let checkpoint;
 try{checkpoint=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(checkpoint){assert.ok(checkpoint.version===1&&checkpoint.key===key&&checkpoint.repository===repo&&JSON.stringify(checkpoint.input)===JSON.stringify(input),'Checkpoint inputs changed. Restore them; do not bypass an uncertain outcome.');if(checkpoint.operation_id!==null)assert.match(checkpoint.operation_id??'',/^[0-9a-f-]{36}$/i);}
 else checkpoint={version:1,key,repository:repo,input,operation_id:null};
 async function save(){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(checkpoint,null,2)+'\n',{mode:0o600,flag:'wx'});await fs.rename(temp,file);}
 async function request(route,method='GET',body){
  const r=await fetcher('https://once.aiagenthuddle.com/v1/operations'+route,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+env.ONCE_API_KEY,'Content-Type':'application/json',...(method==='POST'?{'Once-GitHub-Token':env.GITHUB_TOKEN,'Once-GitHub-Repository':repo,'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.ok(r.ok,`ONCE HTTP ${r.status}. Preserve the checkpoint and logical key; inspect before retrying.`);return r.json();
 }
 if(!checkpoint.operation_id){
  assert.equal(env.ONCE_ALLOW_GITHUB_WRITE,'true','This creates a real GitHub issue. Set ONCE_ALLOW_GITHUB_WRITE=true only for your chosen repository.');
  await save(); // Persist the logical request before dispatch, even if the response is lost.
  const created=await request('','POST',input);assert.match(created.operation_id??'',/^[0-9a-f-]{36}$/i);
  checkpoint.operation_id=created.operation_id;await save();
  log('Operation ID saved. Rerun this command in a new process to resume without another create request.');
 }
 const operation=await request('/'+checkpoint.operation_id);
 log(`Recorded state: ${operation.status}`);
 if(['CREATED','EXECUTING'].includes(operation.status)){log('Not ready for reconciliation. Wait and inspect this same operation; no retry was sent.');return {status:operation.status};}
 const evidence=await request('/'+checkpoint.operation_id+'/reconcile','POST',{});
 log(`Reconciled state: ${evidence.status}`);
 if(evidence.status==='PROVEN_COMMITTED')log('PASS: provider evidence confirms the issue. No retry or direct GitHub fallback was sent.');
 else log('STOP: outcome remains unresolved or non-committed. Inspect the evidence; this example never retries automatically.');
 return {operation_id:checkpoint.operation_id,status:evidence.status};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(e=>{console.error(e.message);process.exitCode=1;});
