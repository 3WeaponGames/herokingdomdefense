'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const compiler=require('../../packages/localization-editor/lib/art-compiler');
const root=path.join(__dirname,'../..');
function fixture(){return{version:1,defaultLanguage:'en',languages:[{code:'en',nameKey:'language.en'},{code:'zh',nameKey:'language.zh'}],entries:{'language.en':{en:'English',zh:'English'},'language.zh':{en:'中文',zh:'中文'},tile:{en:'Barracks',zh:'兵营'}},images:{},artTemplates:{ready:{width:171,height:100,regions:[{key:'tile',rect:{x:0,y:0,width:171,height:100}}]},draft:{pending:true,source:'assets/resources/localization/neutral/does-not-exist.png',regions:[{key:'tile',rect:{x:0,y:0,width:10,height:10},font:'assets/missing.ttf'}]}}};}
async function run(){
  const c=fixture(),before=JSON.stringify(c),p=compiler.prepare(c,root);
  assert.deepEqual(Object.keys(p.templates),['ready']);assert.deepEqual(p.pending,['draft']);assert.deepEqual(Object.keys(p.fonts),[]);assert.equal(JSON.stringify(c),before);
  const all=fixture();delete all.artTemplates.ready;const result=await compiler.compile(all,root);
  assert.equal(result.count,0);assert.deepEqual(result.pending,['draft']);assert.deepEqual(result.outputs,[]);
  for(const change of [c=>{c.artTemplates.ready.width=0},c=>{c.artTemplates.ready.source='assets/missing.png'},c=>{c.artTemplates.ready.regions[0].key='missing'},c=>{c.artTemplates.ready.pending='false'}]){
    const invalid=fixture();change(invalid);assert.throws(()=>compiler.prepare(invalid,root));
  }
  const active=fixture();active.artTemplates.draft.pending=false;assert.throws(()=>compiler.prepare(active,root),/width/);
  console.log('PASS: pending inputs skipped and reported without mutation; all-pending compile needs no renderer/files; active invalid metadata remains an error.');
}
run().catch(error=>{console.error(error);process.exitCode=1});
