import {randomUUID} from 'node:crypto';
let lease;
const origin=process.env.CLAIM_SAMPLE_ORIGIN??'https://claim.aiagenthuddle.com';
if(origin!=='https://claim.aiagenthuddle.com'&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Unsupported sample origin');
async function call(route,method,body){
 const r=await fetch(origin+route,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+process.env.CLAIM_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const value=await r.json();if(!r.ok&&!(r.status===409&&value.status==='DENIED'))throw Error('CLAIM HTTP '+r.status);return value;
}
process.on('message',async message=>{
 try{
  let value;
  if(message.command==='acquire'){
   value=await call('/v1/leases','POST',{resource:message.resource,agent_id:'example-worker-'+process.pid,ttl_seconds:60,request_id:randomUUID()});
   if(value.status==='GRANTED')lease=value;
  }else if(message.command==='renew'){value=await call('/v1/leases/'+lease.lease_id+'/renew','POST',{ttl_seconds:60,request_id:randomUUID()});if(value.status==='RENEWED')lease.expires_at=value.expires_at;}
  else if(message.command==='release')value=lease?await call('/v1/leases/'+lease.lease_id,'DELETE',{request_id:randomUUID()}):{status:'NOT_ACTIVE'};
  else if(message.command==='effect')value={fencing_token:lease.fencing_token,expires_at:lease.expires_at,payload:'worker-'+process.pid};
  else throw Error('Unknown command');
  process.send({id:message.id,pid:process.pid,value});
 }catch(e){process.send({id:message.id,pid:process.pid,error:e.message});}
});
