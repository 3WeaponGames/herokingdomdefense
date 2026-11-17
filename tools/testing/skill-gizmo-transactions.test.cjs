'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {SkillService,FILES}=require('../../packages/hkd-skills/service'),Client=require('../../packages/hkd-skills/client'),Settings=require('../../assets/_script/HeroSkillSettings');
const copy=value=>JSON.parse(JSON.stringify(value)),turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-skill-gesture-'));t.after(()=>{const checked=path.resolve(root);assert.equal(path.dirname(checked),path.resolve(os.tmpdir()));assert(path.basename(checked).startsWith('hkd-skill-gesture-'));fs.rmSync(checked,{recursive:true,force:true});});
 for(const [i,file]of FILES.entries()){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({GameTools:{timingDefaults:{hero:{attack:.2}},timings:{hero:{attack:.3}}},HeroSkills:{fighter:{extension:i?'mirror':'primary'}}},null,2)+'\n');}
 let commits=0,gate=null;const calls=[],states=[],service=new SkillService(root,{catalogs:{vfx:[],audio:[],projectiles:[]},commit:(...args)=>{commits++;return require('../../packages/hkd-characters/lib/asset-transaction').commit(...args);}});
 const api={settings:Settings,async ipc(name,request){calls.push({name,request:copy(request)});if(gate&&name==='change'){const wait=gate;gate=null;await wait;}return service[name](request);}},session=Client.createSession(api,state=>states.push(state));t.after(()=>session.destroy());
 return{root,service,session,calls,states,bytes:()=>FILES.map(file=>fs.readFileSync(path.join(root,file),'utf8')),commits:()=>commits,hold(){let release;gate=new Promise(resolve=>release=resolve);return release;}};
}
const patch=[{path:'visual.castOffsetX',value:19},{path:'visual.castOffsetY',value:-11},{path:'visual.castScale',value:1.6},{path:'visual.castScaleX',value:1.2},{path:'visual.castRotation',value:31}];
test('the real session submits a multi-field gizmo as one version and undo operation with optimistic values',async t=>{
 const f=fixture(t),before=f.bytes();await f.session.load();const version=f.service.version,release=f.hold(),work=f.session.changeMany('fighter',patch);
 for(const edit of patch)assert.equal(Settings.get(f.session.effective('fighter'),edit.path),edit.value);assert.equal(f.session.state().pending,patch.length);assert.equal(f.service.version,version);await turn();assert.equal(f.calls.filter(call=>call.name==='change').length,1);release();await work;
 assert.equal(f.service.version,version+1);assert.equal(f.service.undoStack.length,1);assert.equal(f.session.state().pending,0);assert.equal(f.session.state().rejected,0);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
 await f.session.action('undo');assert.deepEqual(f.service.data,{fighter:{extension:'primary'}});await f.session.action('redo');for(const edit of patch)assert.equal(Settings.get(f.session.effective('fighter'),edit.path),edit.value);
 await f.session.action('save');assert.equal(f.commits(),1);for(const [index,text]of f.bytes().entries()){const document=JSON.parse(text);assert.equal(document.HeroSkills.fighter.extension,index?'mirror':'primary');for(const edit of patch)assert.equal(Settings.get(document.HeroSkills.fighter,edit.path),edit.value);assert.deepEqual(document.GameTools,JSON.parse(before[index]).GameTools);}
});
test('a gizmo queued behind an older field edit uses the accepted revision and preserves that older undo step',async t=>{
 const f=fixture(t);await f.session.load();const initial=f.service.version,release=f.hold(),first=f.session.change('fighter','visual.offsetX',7),gesture=f.session.changeMany('fighter',patch);
 await turn();assert.equal(f.calls.filter(call=>call.name==='change').length,1);assert.equal(f.session.effective('fighter').visual.offsetX,7);assert.equal(f.session.effective('fighter').visual.castScale,1.6);
 release();await Promise.all([first,gesture]);const requests=f.calls.filter(call=>call.name==='change').map(call=>call.request);assert.equal(requests.length,2);assert.equal(requests[0].version,initial);assert.equal(requests[1].version,initial+1);assert.equal(f.service.undoStack.length,2);
 await f.session.action('undo');assert.equal(f.session.effective('fighter').visual.offsetX,7);assert.equal(f.session.effective('fighter').visual.castScale,Settings.defaults('fighter').visual.castScale);assert.equal(f.service.undoStack.length,1);assert.equal(f.commits(),0);
});
test('an atomically rejected gesture retains every local value and cannot save until all rejected fields are corrected',async t=>{
 const f=fixture(t),before=f.bytes();await f.session.load();const initial=f.service.version,invalid=[{path:'visual.castOffsetX',value:25},{path:'visual.castScale',value:0}];await f.session.changeMany('fighter',invalid);
 assert.equal(f.service.version,initial);assert.equal(f.service.undoStack.length,0);assert.equal(f.session.state().rejected,2);for(const edit of invalid)assert.equal(Settings.get(f.session.effective('fighter'),edit.path),edit.value);
 await f.session.action('save');assert.equal(f.calls.filter(call=>call.name==='save').length,0);assert.equal(f.commits(),0);assert.deepEqual(f.bytes(),before);
 await f.session.changeMany('fighter',[{path:'visual.castOffsetX',value:25},{path:'visual.castScale',value:2}]);assert.equal(f.session.state().rejected,0);assert.equal(f.service.undoStack.length,1);await f.session.action('save');assert.equal(f.commits(),1);
});
test('an external shared-draft revision rejects a stale gesture and explicit Reload safely replaces its local overlay',async t=>{
 const f=fixture(t),before=f.bytes();await f.session.load();f.service.change({style:'fighter',path:'visual.offsetX',value:9,version:f.service.version,revision:f.service.revision});const current=copy(f.service.data);await f.session.changeMany('fighter',patch);
 assert.equal(f.session.state().rejected,patch.length);assert.deepEqual(f.service.data,current);assert.equal(f.service.undoStack.length,1);assert.equal(f.session.effective('fighter').visual.castScale,1.6);
 await f.session.action('load');assert.equal(f.session.state().rejected,0);assert.equal(f.session.effective('fighter').visual.offsetX,9);assert.equal(f.session.effective('fighter').visual.castScale,Settings.defaults('fighter').visual.castScale);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
});
test('empty and inherited-value gestures add no history, create no overrides and make no publication writes',async t=>{
 const f=fixture(t),before=f.bytes();await f.session.load();const initial=f.service.version;await f.session.changeMany('skirmisher',[]);assert.equal(f.calls.filter(call=>call.name==='change').length,0);
 await f.session.changeMany('skirmisher',[{path:'visual.castScale',value:Settings.defaults('skirmisher').visual.castScale},{path:'visual.castOffsetX',value:0}]);assert.equal(f.service.version,initial);assert.equal(f.service.undoStack.length,0);assert.deepEqual(f.service.data,{fighter:{extension:'primary'}});await f.session.action('save');assert.equal(f.calls.filter(call=>call.name==='save').length,0);assert.equal(f.commits(),0);assert.deepEqual(f.bytes(),before);
});
test('closing a session cancels a batch that has not started and ignores all later response updates',async t=>{
 const f=fixture(t);await f.session.load();const release=f.hold(),first=f.session.change('fighter','visual.offsetX',3),queued=f.session.changeMany('fighter',patch);await turn();const count=f.states.length;f.session.destroy();release();await Promise.all([first,queued]);
 assert.equal(f.calls.filter(call=>call.name==='change').length,1);assert.equal(f.states.length,count);assert.equal(f.session.state().closed,true);assert.equal(f.session.state().pending,0);assert.equal(f.service.data.fighter.visual.castScale,undefined);assert.equal(f.commits(),0);
});

test('an older response cannot hide a newer queued gesture on the same transform fields',async t=>{
 const f=fixture(t);await f.session.load();const release=f.hold(),first=f.session.change('fighter','visual.castScale',1.2);await turn();const next=[{path:'visual.castScale',value:2.4},{path:'visual.castOffsetX',value:31}],gesture=f.session.changeMany('fighter',next);
 assert.equal(f.session.effective('fighter').visual.castScale,2.4);release();await first;assert.equal(f.session.effective('fighter').visual.castScale,2.4);assert.equal(f.session.effective('fighter').visual.castOffsetX,31);await gesture;assert.equal(f.service.undoStack.length,2);
 await f.session.action('undo');assert.equal(f.session.effective('fighter').visual.castScale,1.2);assert.equal(f.session.effective('fighter').visual.castOffsetX,Settings.defaults('fighter').visual.castOffsetX);assert.equal(f.commits(),0);
});

test('correcting one rejected transform component does not hide its rejected sibling or permit Save',async t=>{
 const f=fixture(t),before=f.bytes();await f.session.load();await f.session.changeMany('fighter',[{path:'visual.castScale',value:0},{path:'visual.castOffsetX',value:23}]);assert.equal(f.session.state().rejected,2);
 await f.session.change('fighter','visual.castScale',1.4);assert.equal(f.session.state().rejected,1);assert.equal(f.session.effective('fighter').visual.castOffsetX,23);assert.equal(f.session.effective('fighter').visual.castScale,1.4);assert.equal(f.service.data.fighter.visual.castOffsetX,undefined);
 await f.session.action('save');assert.equal(f.calls.filter(call=>call.name==='save').length,0);assert.deepEqual(f.bytes(),before);assert.equal(f.commits(),0);
 await f.session.change('fighter','visual.castOffsetX',23);assert.equal(f.session.state().rejected,0);assert.equal(f.service.data.fighter.visual.castOffsetX,23);
});
