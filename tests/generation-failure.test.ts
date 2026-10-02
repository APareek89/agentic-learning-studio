import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BaseChatOpenAI} from '@langchain/openai';

test('a rejected overview request exposes only a safe error and releases its slot',async(t)=>{
 Object.assign(process.env,{ALS_PRIMARY_PROVIDER:'openai',ALS_MOCK_MODE:'0',OPENAI_API_KEY:'synthetic-only'});
 const sentinel='PRIVATE_PROVIDER_SENTINEL signed=https://private.invalid/?secret=not-real';
 let calls=0; const logs:unknown[][]=[];
 for(const method of ['warn','error'] as const)t.mock.method(console,method,(...args:unknown[])=>logs.push(args));
 t.mock.method(BaseChatOpenAI.prototype,'getNumTokens',async()=>1);
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(JSON.stringify({error:{message:sentinel,type:'invalid_request_error',code:'bad_request'}}),{status:400,headers:{'content-type':'application/json'}});});
 const {runOverviewJob}=await import('../src/agent/orchestrator');
 const {runWithUser}=await import('../src/lib/db');
 const {createJob,acquireGenSlot,releaseGenSlot,MAX_CONCURRENT_GENERATIONS}=await import('../src/lib/jobs');
 const owner=randomUUID();await runWithUser(owner,async()=>{
  assert(acquireGenSlot());const job=createJob(owner);await runOverviewJob(job,{userPrompt:'Teach me safe customer memory.',userId:owner});
  assert.equal(job.status,'error');assert.equal(calls,1);
  assert(!job.error?.includes('PRIVATE_PROVIDER_SENTINEL'),'stored job errors must not contain raw upstream text');
  assert(!JSON.stringify(logs).includes('PRIVATE_PROVIDER_SENTINEL'),'logs must not contain raw upstream text');
  for(let i=0;i<MAX_CONCURRENT_GENERATIONS;i++)assert(acquireGenSlot());
  assert(!acquireGenSlot());for(let i=0;i<MAX_CONCURRENT_GENERATIONS;i++)releaseGenSlot();
 });
});

test('a definitive coverage-brief rejection is not resubmitted by the overview driver',async(t)=>{
 Object.assign(process.env,{ALS_PRIMARY_PROVIDER:'openai',ALS_MOCK_MODE:'0',OPENAI_API_KEY:'synthetic-only'});
 const requests:string[]=[];
 t.mock.method(BaseChatOpenAI.prototype,'getNumTokens',async()=>1);
 t.mock.method(globalThis,'fetch',async(_input:any,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body)); const name=body.tools?.[0]?.function.name;requests.push(name);
  if(name!=='infer')return new Response(JSON.stringify({error:{message:'Synthetic permanent rejection',type:'invalid_request_error'}}),{status:400,headers:{'content-type':'application/json'}});
  return Response.json({id:'fixture',object:'chat.completion',created:1,model:body.model,choices:[{index:0,message:{role:'assistant',content:null,tool_calls:[{id:'infer_fixture',type:'function',function:{name:'infer',arguments:JSON.stringify({topic:'Agent Memory',learningGoal:'Safe memory policy',lessonFocus:'how_to_build',mustCover:['consent'],scope:'moderate'})}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:20,completion_tokens:20,total_tokens:40}});
 });
 const {runOverviewJob}=await import('../src/agent/orchestrator');const {runWithUser}=await import('../src/lib/db');const {createJob,acquireGenSlot}=await import('../src/lib/jobs');const owner=randomUUID();
 await runWithUser(owner,async()=>{assert(acquireGenSlot());const job=createJob(owner);await runOverviewJob(job,{userPrompt:'Teach me safe customer memory.',userId:owner});assert.equal(job.status,'error');});
 assert.equal(requests.filter(n=>n==='coverage_brief').length,1,'a known rejected request must not be automatically duplicated');
});
