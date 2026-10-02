import {test} from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {BaseChatOpenAI} from '@langchain/openai';
import {makeLLM,makeGptLLM,structuredOutput,invokeResilient,withOverloadRetry} from '../src/agent/llm';
import {runWithUser} from '../src/lib/db';

test('both actual SDKs make one attempt for permanent errors, throttling, server errors and dropped responses', async t=>{
 Object.assign(process.env,{ALS_MOCK_MODE:'0',OPENAI_API_KEY:'synthetic-only',ANTHROPIC_API_KEY:'synthetic-only'});
 t.mock.method(BaseChatOpenAI.prototype,'getNumTokens',async()=>1);
 const logs:string[]=[];t.mock.method(console,'info',(...v:unknown[])=>logs.push(v.join(' ')));
 let count=0;let status:number|null=400;
 t.mock.method(globalThis,'fetch',async()=>{count++;if(status===null)throw new TypeError('PRIVATE_ENDPOINT https://secret.invalid/?token=fixture');return Response.json({type:'error',error:{type:'invalid_request_error',message:'PRIVATE_ENDPOINT'}},{status});});
 for(const provider of ['openai','anthropic']){
  process.env.ALS_PRIMARY_PROVIDER=provider;
  for(const failure of [400,429,500,null]){
   status=failure;const before=count;
   await assert.rejects(withOverloadRetry(()=>invokeResilient(makeLLM('haiku',0,{maxRetries:4}), 'Synthetic support question')));
   assert.equal(count-before,1,`${provider}/${failure}: exactly one dispatch, no helper, SDK or other-provider retry`);
  }
  assert.equal(makeGptLLM(),null,'a second configured key cannot enable fallback');
 }
 const usage=logs.filter(x=>x.startsWith('[generation-usage]')).map(x=>JSON.parse(x.slice('[generation-usage] '.length)));
 assert.equal(usage.length,8);assert(usage.every(x=>x.status==='failed_usage_unknown'&&x.input_tokens===null&&x.output_tokens===null));
 assert(!JSON.stringify(usage).includes('PRIVATE_ENDPOINT'));
});

test('known usage survives a malformed structured result before application parsing',async t=>{
 Object.assign(process.env,{ALS_PRIMARY_PROVIDER:'openai',ALS_MOCK_MODE:'0',OPENAI_API_KEY:'synthetic-only'});
 t.mock.method(BaseChatOpenAI.prototype,'getNumTokens',async()=>1);
 const logs:string[]=[];t.mock.method(console,'info',(...v:unknown[])=>logs.push(v.join(' ')));
 let count=0;t.mock.method(globalThis,'fetch',async(_u:any,init?:RequestInit)=>{count++;const b=JSON.parse(String(init?.body));return Response.json({id:'fixture',object:'chat.completion',created:1,model:b.model,choices:[{index:0,message:{role:'assistant',content:null,tool_calls:[{id:'fixture-call',type:'function',function:{name:'validate',arguments:'{"private_wrong_field":"PRIVATE_OUTPUT"}'}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:17,completion_tokens:4,total_tokens:21}});});
 const owner='11111111-1111-4111-8111-111111111111';
 await runWithUser(owner,async()=>assert.rejects(structuredOutput(makeLLM('haiku'),z.object({answer:z.string()}),{name:'validate'}).invoke('PRIVATE_PROMPT')));
 assert.equal(count,1);const usage=logs.filter(x=>x.startsWith('[generation-usage]')).map(x=>JSON.parse(x.slice('[generation-usage] '.length)));
 assert.equal(usage.length,1);assert.equal(usage[0].ownerId,owner);assert.equal(usage[0].status,'complete');assert.equal(usage[0].input_tokens,17);assert.equal(usage[0].output_tokens,4);assert(!JSON.stringify(usage).includes('PRIVATE_'));
});

test('module and notebook drivers do not repurchase a failed generation',async t=>{
 Object.assign(process.env,{ALS_PRIMARY_PROVIDER:'openai',ALS_MOCK_MODE:'0',OPENAI_API_KEY:'synthetic-only'});
 t.mock.method(BaseChatOpenAI.prototype,'getNumTokens',async()=>1);
 t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});
 let count=0;t.mock.method(globalThis,'fetch',async()=>{count++;return Response.json({error:{type:'invalid_request_error',message:'Synthetic permanent rejection'}},{status:400});});
 const {readFileSync}=await import('node:fs');const {randomUUID}=await import('node:crypto');
 const bp=JSON.parse(readFileSync('prebuilt/lessons/agent-memory.json','utf8'));
 bp.modules[0].loadState='stub';bp.modules[0].blocks=[];
 const {runDeepDive}=await import('../src/agent/nodes');const {getOrCreate}=await import('../src/lib/handson');
 await runWithUser(randomUUID(),async()=>{
  const outcome=await runDeepDive(bp,bp.modules[0].id);assert.equal(outcome.ok,false);assert.equal(count,1);assert.equal(bp.modules[0].loadState,'stub');
  const notebook=await getOrCreate(randomUUID(),null,bp);assert.equal(notebook.source,'fallback');assert.equal(count,2,'one failed notebook request then provider-free fallback');
 });
});
