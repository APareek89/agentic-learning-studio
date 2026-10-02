import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {renderArtifact} from '../src/render';
import {WORLD_JS} from '../src/render/world';
import {isPreparedArtifact} from '../src/lib/artifacts';

test('canonical saved-example renderer has full mobile canvas and closable overlay rail',()=>{
 const bp=JSON.parse(readFileSync('prebuilt/lessons/agent-memory.json','utf8'));bp.learnerProfile.readingMode='world';
 const html=renderArtifact(bp);
 assert(html.includes('#wroot{grid-template-columns:minmax(0,1fr);position:relative}'));
 assert(html.includes('position:absolute;left:0;top:54px;bottom:0;z-index:12'));
 assert(html.includes('if(window.matchMedia("(max-width: 760px)").matches)setRail(false);'));
 const css=readFileSync('public/styles.css','utf8');
 assert(!css.includes('grid-template-rows: 38% 62%'));
 assert(css.includes('.workspace { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }'));
 assert(css.includes('height: calc(100dvh - var(--topbarH'));
 const changed:Record<string,unknown>={};
 const nodes:any={wroot:{classList:{toggle:(k:string,v:unknown)=>changed[k]=v}},'w-railbtn':{classList:{toggle:(k:string,v:unknown)=>changed[k]=v},setAttribute:(k:string,v:unknown)=>changed[k]=v}};
 const fn=WORLD_JS.match(/function setRail\(on\)\{[^\n]+\}/)?.[0];assert(fn);
 vm.runInNewContext(fn+';setRail(true);setRail(false);',{$:(id:string)=>nodes[id]});
 assert.deepEqual(changed,{'rail-open':false,on:false,'aria-expanded':'false'});
});

test('prepared provenance suppresses the automatic share nudge and blocks legacy publication',()=>{
 assert(isPreparedArtifact({cards:{preparedExample:true}}));
 assert(isPreparedArtifact({prompt:'Cached example: Agent Memory'}));
 assert(!isPreparedArtifact({prompt:'Teach me customer memory'}));
 const app=readFileSync('public/app.js','utf8');
 assert(app.includes('tabById(activeTabId)?.prepared === false && (d.visited || 0) >= 2'));
 assert(app.includes('l.prepared ? `<span class="lc-badge">Prepared example</span>`'));
});
