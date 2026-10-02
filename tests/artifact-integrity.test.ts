import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {runWithUser} from "../src/lib/db";
import {registerArtifact,getArtifact,updateArtifact} from "../src/lib/artifacts";

test("uncommitted nested lesson edits cannot mutate the cached saved artifact", async()=>runWithUser(randomUUID(),async()=>{
 const blueprint=JSON.parse(readFileSync("prebuilt/lessons/agent-memory.json","utf8"));
 const ref=await registerArtifact({kind:"learning-artifact",title:blueprint.meta.title,html:"saved",blueprint});
 const original=structuredClone(blueprint);
 blueprint.modules.push({...blueprint.modules[0],id:"caller-mutation"});
 assert.deepEqual((await getArtifact(ref.id))!.blueprint,original,"registration must not retain caller-owned mutable references");
 const read=(await getArtifact(ref.id))!;
 read.blueprint!.modules.push({...read.blueprint!.modules[0],id:"failed-expansion"});
 assert.deepEqual((await getArtifact(ref.id))!.blueprint,original,"a failed expansion before update must preserve the saved lesson");
 await updateArtifact(ref.id,{blueprint:read.blueprint,html:"committed"});
 assert.equal((await getArtifact(ref.id))!.html,"committed");
 assert.equal((await getArtifact(ref.id))!.blueprint!.modules.at(-1)!.id,"failed-expansion");
}));

test("strict document-only overview refuses missing documents before any inference",async()=>runWithUser(randomUUID(),async()=>{
 const {retriever}=await import("../src/agent/nodes");
 await assert.rejects(retriever({userPrompt:"Explain the warranty using only my attached handbook.",uploadIds:[randomUUID()],referOnly:true} as any),/uploaded|document/i);
}));
