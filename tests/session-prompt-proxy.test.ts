/** Authored this session: real SDK, profiler/brief/planner/module drivers and renderer;
 * transport outputs are explicit synthetic teaching content, not model quality evidence. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {BaseChatOpenAI} from '@langchain/openai';

test('support-team lesson prompt travels through overview approval, complete build and owner-isolated readback',async(t)=>{
 Object.assign(process.env,{ALS_PRIMARY_PROVIDER:'openai',ALS_MOCK_MODE:'0',OPENAI_API_KEY:'synthetic-only'});
 const {runWithUser}=await import('../src/lib/db');
 const {createJob,acquireGenSlot}=await import('../src/lib/jobs');
 const {getArtifact}=await import('../src/lib/artifacts');
 const authoredPrompt="I lead a support team. Teach me how an agent should remember a customer's preference without storing payment details. Use plain English and a practical example.";
 const blueprint=JSON.parse(readFileSync('prebuilt/lessons/agent-memory.json','utf8'));
 blueprint.meta.title='Safe memory for a support team';
 blueprint.learnerProfile.lessonTypes=['content'];
 for(const m of blueprint.modules){m.blocks=[];m.loadState='stub';}
 const requests:any[]=[];
 t.mock.method(BaseChatOpenAI.prototype,'getNumTokens',async()=>1);
 t.mock.method(globalThis,'fetch',async(input:any,init?:RequestInit)=>{
  assert.equal(String(input),'https://api.openai.com/v1/chat/completions');
  const body=JSON.parse(String(init?.body));requests.push(body);
  const name=body.tools?.[0]?.function.name;
  const values:any={
   infer:{topic:'Agent Memory',learningGoal:'Design a safe support memory policy',lessonFocus:'how_to_build',mustCover:['consent','scope','payment details'],scope:'moderate'},
   coverage_brief:{title:blueprint.meta.title,framing:'Keep helpful preferences without storing payment data.',concepts:[{label:'Memory scope',why:'Keep each customer separate'}],examples:['Remember a preferred language, never a card number.'],outcomes:['Review a memory write before persistence.']},
   coverage_sections:{sections:blueprint.modules.map((m:any)=>({title:m.title,summary:m.summary}))},
   module_blocks:{blocks:[{id:'principle',kind:'conceptual',title:'Remember a preference with permission',body:[{t:'p',spans:[{text:'Ask before saving a preference. Keep it under the current customer. Never store payment details. Show the saved memory so the customer can correct it.'}]}],termIds:[],sources:[]}]},
   overview_prose:{glossary:[],recap:'Scope memory to one customer.',buildOrder:[{step:1,label:'Ask permission'}],checklist:[{label:'Verify the owner'}],capstonePrompt:'Review a memory write.',finalCheck:[{kind:'mcq',prompt:'What can you save with consent?',options:[{text:'Language preference',correct:true},{text:'Full card number',correct:false}],explanation:'Store useful preferences under the customer, not payment details.'},{kind:'freeText',prompt:'Who owns a customer memory?',acceptableAnswer:'The customer whose preference it records.',explanation:'Do not mix customers.'},{kind:'freeText',prompt:'What happens after consent is withdrawn?',acceptableAnswer:'Delete the saved preference.',explanation:'A user can change their mind.'}]}
  };
  if(name)assert(name in values,`unexpected synthetic call ${name}`);
  const value=name?values[name]:body.stream?blueprint:{sections:blueprint.modules.map((m:any)=>m.title)};
  const text=JSON.stringify(value),tool={id:'call_fixture',type:'function',function:{name,arguments:text}};
  const base={id:'chatcmpl_fixture',created:1,model:body.model};
  const usage={prompt_tokens:20,completion_tokens:30,total_tokens:50};
  if(body.stream){
   const chunks=[{...base,object:'chat.completion.chunk',choices:[{index:0,delta:name?{role:'assistant',tool_calls:[{...tool,index:0}]}:{role:'assistant',content:text},finish_reason:null}]},{...base,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:name?'tool_calls':'stop'}]},{...base,object:'chat.completion.chunk',choices:[],usage}];
   return new Response(chunks.map(c=>'data: '+JSON.stringify(c)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
  }
  return new Response(JSON.stringify({...base,object:'chat.completion',choices:[{index:0,message:name?{role:'assistant',content:null,tool_calls:[tool]}:{role:'assistant',content:text},finish_reason:name?'tool_calls':'stop'}],usage}),{headers:{'content-type':'application/json'}});
 });
 const {runOverviewJob,runBuildJob}=await import('../src/agent/orchestrator');
 const owner=randomUUID();
 await runWithUser(owner,async()=>{
  const before=requests.length;assert(acquireGenSlot());const missing=createJob(owner);
  await runOverviewJob(missing,{userPrompt:'Use only my uploaded policy.',userId:owner,referOnly:true,uploadIds:[randomUUID()]});
  assert.equal(missing.status,'error');assert.equal(requests.length,before,'missing strict documents must fail before profiler starts');
  assert(acquireGenSlot());const overview=createJob(owner);
  await runOverviewJob(overview,{userPrompt:authoredPrompt,userId:owner,lessonTypes:['content']});
  assert.equal(overview.status,'done',overview.error);const id=overview.lessons[0].artifactId!;
  const draft=(await getArtifact(id))!;assert.equal(draft.kind,'overview-draft');assert.equal(draft.prompt,authoredPrompt);
  assert(draft.blueprint!.modules.every(m=>m.loadState==='stub'));
  assert(requests.some(b=>JSON.stringify(b.messages).includes(authoredPrompt)));
  assert(acquireGenSlot());const build=createJob(owner);await runBuildJob(build,id);
  assert.equal(build.status,'done',build.error);
  const saved=(await getArtifact(id))!;assert.equal(saved.kind,'learning-artifact');assert.equal(saved.title,blueprint.meta.title);
  assert.equal(saved.blueprint!.modules.length,blueprint.modules.length);
  assert(saved.blueprint!.modules.every(m=>m.loadState==='full'&&m.blocks.length>0));
  assert(saved.html.includes('Remember a preference with permission'));
  await runWithUser(randomUUID(),async()=>assert.equal(await getArtifact(id),undefined));
  const count=requests.length;assert(acquireGenSlot());await runBuildJob(createJob(owner),id);
  assert.equal(requests.length,count,'completed build must not dispatch again');
  assert.equal(requests.filter(b=>b.tools?.[0]?.function.name==='module_blocks').length,blueprint.modules.length);
 });
});
