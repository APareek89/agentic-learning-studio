import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runWithUser, requireUserId, query, closePool } from "../src/lib/db";
import { getArtifact, registerArtifact, updateArtifact } from "../src/lib/artifacts";
import { getCourse, listLessons, rateLesson, saveProgress, getPreferences, savePreferences } from "../src/lib/lessons";
import { hydrateUploads, hasUploads, getUploadTitles, retrieveFromUploads } from "../src/lib/uploads";
import { createJob, getJob, getPersistedJob, persistJob } from "../src/lib/jobs";
import { getSavedSkill, listSavedSkills, deleteSavedSkill, skillCacheKey, createSkillJob, getSkillJob } from "../src/lib/skillgen";
import { cacheKey, peekCache, createHandsOnJob, getHandsOnJob } from "../src/lib/handson";
import { ensureFreeGrant, getBalance, spend, addCredits } from "../src/lib/credits";
import { getPublicThumbnail, persistPrivateUpload } from "../src/lib/storage";

const database = process.env.DATABASE_URL;
assert(database && new URL(database).pathname.endsWith("_test"), "Ownership tests require an isolated test database");
const a=randomUUID(), b=randomUUID(), lesson=randomUUID(), course=randomUUID(), upload=randomUUID(), skill=randomUUID();
let checks=0;
const check=(value:unknown)=>{assert(value);checks++;};
try {
  await query(`insert into lessons(id,user_id,user_email,kind,title,html,course_id,course_index,expires_at,blueprint) values($1,$2,'owner@example.test','learning-artifact','Private fixture','<p>private</p>',$3,1,now()+interval '1 day','{"modules":[]}'::jsonb)`,[lesson,a,course]);
  await query(`insert into upload_docs(id,user_id,title,source_type,chunks) values($1,$2,'Private upload','text','[{"content":"private fixture","embedding":[1,0]}]'::jsonb)`,[upload,a]);
  await query(`insert into generated_skills(id,user_id,user_email,slug,name,skill) values($1,$2,'owner@example.test','private','Private skill','{"private":true}'::jsonb)`,[skill,a]);
  await assert.rejects(()=>getArtifact(lesson), /Authentication required/);checks++;
  await assert.rejects(()=>hydrateUploads([upload]), /Authentication required/);checks++;
  await assert.rejects(()=>persistPrivateUpload(upload,{}), /Authentication required/);checks++;
  assert.throws(()=>hasUploads([upload]),/Authentication required/);checks++;
  await runWithUser(a,async()=>{
    check((await getArtifact(lesson))?.userId===a);
    await hydrateUploads([upload]);check(hasUploads([upload]));check(getUploadTitles([upload]).length===1);
    check((await getCourse(course)).length===1);
    await savePreferences(a,'owner@example.test',{private:true});
  });
  await runWithUser(b,async()=>{
    check(await getArtifact(lesson)===undefined); // A's artifact is already cached.
    await updateArtifact(lesson,{title:'unauthorized',html:'not allowed'});
    await hydrateUploads([upload]);check(!hasUploads([upload]));check(getUploadTitles([upload]).length===0);
    check((await retrieveFromUploads('test',[upload])).length===0); // Returns before embedding/network work.
    check((await getCourse(course)).length===0);
    check((await listLessons(b,'owner@example.test')).length===0); // Email never grants ownership.
    check(!(await rateLesson(b,lesson,1,undefined,'owner@example.test')));
    await saveProgress(b,undefined,lesson,100,1,1);
    check((await query('select * from lesson_progress where lesson_id=$1 and user_id=$2',[lesson,b])).length===0);
    await assert.rejects(()=>getPreferences(a),/Access denied/);checks++;
    check(await getSavedSkill(skill,b,'owner@example.test')===null);
    check((await listSavedSkills(b,'owner@example.test')).length===0);
    check(!(await deleteSavedSkill(skill,b,'owner@example.test')));
  });
  await runWithUser(a,async()=>{
    check((await getArtifact(lesson))?.html==='<p>private</p>');
    check((await getSavedSkill(skill,a))!==null);
    check((await getPreferences(a)).private===true);
    const job=createJob(a);job.status='done';await persistJob(job);
    const sj=createSkillJob(a), hj=createHandsOnJob(a);
    const key=cacheKey(lesson,null);
    await query(`insert into hands_on_notebooks(lesson_id,cache_key,notebook,source,model,user_id) values($1,$2,'{"title":"Private","cells":[]}'::jsonb,'fallback','test',$3)`,[lesson,key,a]);
    check((await peekCache(lesson,null))?.notebook.title==='Private');
    await runWithUser(b,async()=>{
      check(getJob(job.id)===undefined);check(await getPersistedJob(job.id)===null);
      check(getSkillJob(sj.id)===undefined);check(getHandsOnJob(hj.id)===undefined);
      check(await peekCache(lesson,null)===null);
    });
    check(requireUserId()===a);
    check((await getPersistedJob(job.id))?.userId===a);
  });
  await runWithUser(a,async()=>{
    check(await ensureFreeGrant(a)===2);
    check(await ensureFreeGrant(a)===2);
    check((await spend(a,0.5,"skill")).balance===1.5);
    check((await addCredits(a,1,{reason:"admin",lsOrderId:`test:${a}`,ttl:null})).balance===2.5);
    await runWithUser(b,async()=>{
      await assert.rejects(()=>getBalance(a),/Access denied/);checks++;
      await assert.rejects(()=>addCredits(a,1,{reason:"admin"}),/Access denied/);checks++;
    });
  });
  const results=await Promise.all([a,b].map(user=>runWithUser(user,async()=>{
    await new Promise(resolve=>setTimeout(resolve,user===a?8:2));
    check(requireUserId()===user);
    const created=await registerArtifact({kind:'learning-artifact',title:'Isolated',html:user,userId:user});
    return {user,created};
  })));
  for(const own of results) await runWithUser(own.user,async()=>{
    check((await getArtifact(own.created.id))?.html===own.user);
    const other=results.find(x=>x.user!==own.user)!;
    check(await getArtifact(other.created.id)===undefined);
  });
  const input={llmInterface:'test',task:'same',dataSources:'same',accessMethod:'same'};
  check(runWithUser(a,()=>skillCacheKey({...input,userId:a}))!==runWithUser(b,()=>skillCacheKey({...input,userId:b})));
  for(const name of ['../private/uploads/file.json','rag.webp/../../private','private.json','%2e%2e%2fsecret']) check(await getPublicThumbnail(name)===null);
  console.log(JSON.stringify({status:'passed',checks,paidCalls:0,isolatedDatabase:true}));
} finally { await closePool(); }
