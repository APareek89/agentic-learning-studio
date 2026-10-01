import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireAskModelTier } from '../src/lib/ask-model-tier';
import { makeLLM } from '../src/agent/llm';
import { HumanMessage } from '@langchain/core/messages';

test('Ask More accepts only configured tiers, defaults unchanged, and mini dispatch remains one bounded SDK request', async(t) => {
 const settings={ALS_PRIMARY_PROVIDER:'openai',ALS_MOCK_MODE:'0',OPENAI_API_KEY:'offline-only',OPENAI_MODEL_SONNET:'gpt-5.5',OPENAI_MODEL_HAIKU:'gpt-5.4-mini'};
 const previous=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));Object.assign(process.env,settings);
 t.after(()=>{for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const realFetch=globalThis.fetch;const bodies:Record<string,any>[]=[];
 t.mock.method(globalThis,'fetch',async(input:any,init?:RequestInit)=>{
  if(!String(input).startsWith('https://api.openai.com/'))return realFetch(input,init);
  const b=JSON.parse(String(init?.body));bodies.push(b);
  return new Response(JSON.stringify({id:'chatcmpl_fixture',object:'chat.completion',created:1,model:b.model,choices:[{index:0,message:{role:'assistant',content:'Memory retains useful context.'},finish_reason:'stop'}],usage:{prompt_tokens:8,completion_tokens:5,total_tokens:13}}),{headers:{'content-type':'application/json'}});
 });
 const app=express();app.use(express.json());app.post('/api/ask',requireAskModelTier,async(req,res)=>{
  const model=makeLLM(res.locals.askModelTier,0.2,{maxTokens:500,maxRetries:0,reasoningEffort:'none'});
  const answer=await model.invoke([new HumanMessage('Explain memory briefly.')]);res.json({answer:answer.content});
 });
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
 const address=server.address();assert(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}/api/ask`;
 for(const tier of ['opus','gpt-5.5','',null,{},['haiku'],false]) {
  const r=await realFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({modelTier:tier})});assert.equal(r.status,400);
 }
 assert.equal(bodies.length,0);
 for(const request of [{},{modelTier:'haiku'},{modelTier:'sonnet'}]){
  const r=await realFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});assert.equal(r.status,200);assert.match((await r.json()).answer,/Memory/);
 }
 assert.deepEqual(bodies.map(b=>b.model),['gpt-5.5','gpt-5.4-mini','gpt-5.5']);
 assert(bodies.every(b=>b.max_completion_tokens===500&&b.reasoning_effort==='none'));
});
