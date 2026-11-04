import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { createPayoutsService } from '../src/payouts/index.js';
import type { PayoutFinance } from '../src/payouts/contracts.js';
const owner='00000000-0000-4000-8000-000000000001', adminId='00000000-0000-4000-8000-000000000002';
const pic={id:owner,status:'active' as const,roles:['label_custom' as const]};
const admin={id:adminId,status:'active' as const,roles:['admin' as const]};
function fixture(){
 const state={intact:true,approved:true,verified:true,source:1,approvedSource:1,auditFailure:false,receipts:[] as {scope:string;key:string;request_hash:string;status:string;response_body:unknown}[]};
 const calls:{sql:string;args:unknown[]}[]=[];
 const db={release(){},async query(sql:string,args:unknown[]=[]){
  calls.push({sql,args});const result=(rows:unknown[]=[])=>({rows,rowCount:rows.length});
  if(sql.startsWith('INSERT INTO soundpub.idempotency_keys')){const existing=state.receipts.find(r=>r.scope===args[0]&&r.key===args[1]);if(existing)return result();state.receipts.push({scope:String(args[0]),key:String(args[1]),request_hash:String(args[2]),status:'processing',response_body:null});return result([{}]);}
  if(sql.startsWith('SELECT request_hash,status,response_body FROM soundpub.idempotency_keys'))return result(state.receipts.filter(r=>r.scope===args[0]&&r.key===args[1]));
  if(sql.startsWith('UPDATE soundpub.idempotency_keys')){const row=state.receipts.find(r=>r.scope===args[0]&&r.key===args[1]&&r.status==='processing');if(!row)return result();row.status='completed';row.response_body=JSON.parse(String(args[2]));return result([{}]);}
  if(sql.includes('SELECT id, status FROM'))return result([pic,admin]);
  if(sql.includes('SELECT user_id, role'))return result([{user_id:owner,role:'label_custom'},{user_id:adminId,role:'admin'}]);
  if(sql.includes("role='label_custom'"))return result([{}]);
  if(sql.includes('SELECT unit.id'))return result([{id:owner}]);
  if(sql.includes('WITH batches AS'))return result([{snapshot:{source:state.source},intact:state.intact}]);
  if(sql.includes('FROM soundpub.pic_payout_destinations d'))return result([{id:owner,bank_name:'Bank',account_number:'12345678',account_holder_name:'PIC',verified:state.verified}]);
  if(sql.includes('SELECT 1 FROM soundpub.pic_reconciliation_approvals'))return result(state.approved&&state.source===state.approvedSource?[{}]:[]);
  if(sql.includes('INSERT INTO soundpub.payout_requests'))return result([{id:owner,user_id:owner,amount:'10.00',currency:'IDR',status:'pending'}]);
  if(sql.includes('SELECT 1 FROM soundpub.pic_payout_destinations WHERE'))return result([{}]);
  if(sql.includes('INSERT INTO soundpub.pic_readiness_revocations'))return result([{id:owner}]);
  if(sql.includes('INSERT INTO soundpub.pic_reconciliation_approvals'))return result([{id:owner}]);
  if(sql.includes('INSERT INTO soundpub.audit_logs')&&state.auditFailure)throw Error('audit unavailable');
  return result();
 }};
 const finance:PayoutFinance={async lock(){},async eligibility(){return{available:'100.00',minimum:'1.00',verified:true,destinationReady:true,reconciled:true};},async reserve(){},async release(){},async settle(){}};
 return{state,calls,service:createPayoutsService({connect:async()=>db} as unknown as Pool,finance)};
}
test('current durable approval opens eligibility; imports, corrections, revocations and integrity failures close it',async()=>{
 const f=fixture();assert.equal((await f.service.eligibility(pic)).eligible,true);
 f.state.source++;assert.equal((await f.service.eligibility(pic)).eligible,false);
 f.state.approvedSource=f.state.source;assert.equal((await f.service.eligibility(pic)).eligible,true);
 f.state.approved=false;assert.equal((await f.service.eligibility(pic)).available,null);
 f.state.approved=true;f.state.intact=false;assert.equal((await f.service.eligibility(pic)).eligible,false);
 f.state.intact=true;f.state.verified=false;assert.ok((await f.service.eligibility(pic)).reasons.includes('DESTINATION_REQUIRED'));
});
test('request uses exact verified PIC destination; rejects forged bank and recipient fields',async()=>{
 const f=fixture(),input={amount:'10.00',currency:'IDR',bank_name:'Bank',account_number:'12345678',account_holder_name:'PIC'};
 await assert.rejects(f.service.request(pic,{...input,account_number:'999999'},'wrong'),/DESTINATION_MISMATCH/);
 assert.equal(f.calls.some(c=>c.sql.includes('INSERT INTO soundpub.payout_requests')),false);
 for(const field of ['artist_id','owner_id','recipient','financial_owner_user_id'])await assert.rejects(async()=>f.service.request(pic,{...input,[field]:owner},field),/BAD_REQUEST/);
 await f.service.request(pic,input,'valid');
 assert.deepEqual(f.calls.find(c=>c.sql.includes('INSERT INTO soundpub.payout_requests'))?.args.slice(3),['Bank','12345678','PIC']);
});
test('independent admin approval stores source evidence transactionally; PIC self approval denied',async()=>{
 const f=fixture();
 await assert.rejects(f.service.reviewReadiness(pic,owner,{action:'approve_reconciliation',evidence:'review'},'self-review'),/FORBIDDEN/);
 await assert.rejects(async()=>f.service.updateDestination(pic,{bank_name:'Bank',account_number:'12345678',account_holder_name:'PIC',verified:true}),/BAD_REQUEST/);
 await f.service.reviewReadiness(admin,owner,{action:'approve_reconciliation',evidence:'review'},'approval-review');
 assert.equal(f.calls.find(c=>c.sql.includes('INSERT INTO soundpub.pic_reconciliation_approvals'))?.args[1],JSON.stringify({source:1}));
 assert.ok(f.calls.some(c=>c.sql.includes('INSERT INTO soundpub.outbox_events')));
 f.state.auditFailure=true;
 await assert.rejects(f.service.reviewReadiness(admin,owner,{action:'approve_reconciliation',evidence:'review'},'approval-audit-failure'),/audit unavailable/);
 assert.ok(f.calls.some(c=>c.sql==='ROLLBACK'));
});

test('admin destination verification and revocations emit transactional evidence without bank leakage',async()=>{
 const f=fixture();f.state.verified=false;
 await f.service.reviewReadiness(admin,owner,{action:'verify_destination',destination_id:owner,evidence:'identity-and-bank-reviewed'},'verify-destination');
 assert.ok(f.calls.some(c=>c.sql.includes('INSERT INTO soundpub.pic_destination_verifications')));
 await f.service.reviewReadiness(admin,owner,{action:'revoke_destination',destination_id:owner,reason:'bank changed'},'revoke-destination');
 assert.ok(f.calls.some(c=>c.sql.includes('INSERT INTO soundpub.pic_readiness_revocations')));
 for(const c of f.calls.filter(c=>c.sql.includes('INSERT INTO soundpub.outbox_events')||c.sql.includes('INSERT INTO soundpub.audit_logs')))
   assert.equal(JSON.stringify(c.args).includes('12345678'),false);
 await assert.rejects(f.service.reviewReadiness({...admin,id:owner},owner,{action:'approve_reconciliation',evidence:'self'},'forbidden-self'),/FORBIDDEN|INDEPENDENT_REVIEW_REQUIRED/);
});
