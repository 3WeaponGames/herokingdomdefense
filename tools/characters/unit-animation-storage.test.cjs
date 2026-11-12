'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{test}=require('node:test');
const Speeds=require('../../packages/hkd-characters/lib/unit-animation-speeds'),{Service}=require('../../packages/hkd-characters/lib/service');
const units=[{type:'hero',id:'hero',key:'hero:hero:default'},{type:'ally',id:'90001',key:'ally:90001:default',levels:[1,3]},{type:'enemy',id:'91001',key:'enemy:91001:default',appearance:'monster1/Slime',sourcePack:'monster1'},{type:'enemy',id:'91002',key:'enemy:91002:default',appearance:'monster1/Slime',sourcePack:'monster1'}];
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-unit-animation-storage-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const write=(relative,value)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));return file;};
 const profile={name:'Slime',base:{type:'enemy',id:'91001',currentModel:true},parts:[],future:{retain:7}};
 const file=write('assets/resources/characters/catalog.json','{\n  "version": 1,\n  "future": { "number": 1.00 },\n  "profiles": '+JSON.stringify({slime:profile})+',\n  "assignments": {"enemy:91001:default":"slime"}\n}\n');
 const config=write('assets/KinghtFallConfig/GameJsonCfg.json',{GameTools:{timingDefaults:{approved:{attack:.5}},timings:{custom:{attack:.2}}},unknown:{retain:true}});
 const store=new Service(root);store.units=()=>units;store.assets=()=>({parts:[]});store.describe=()=>({layers:[{uuid:'model',skins:['default'],json:{bones:[],slots:[]}}]});
 return{root,file,config,store,bytes:fs.readFileSync(file),configBytes:fs.readFileSync(config)};
}
function change(store,edit){const data=store.snapshot().data;edit(data);return store.change({version:store.version,data});}

test('relative animation speed resolves by actual unit/form/level and never leaks to a shared appearance or created character',()=>{
 const data={unitAnimationSpeeds:{'hero:hero:default':.6,'ally:90001:default':.8,'ally:90001:level:3':0,'enemy:91001:default':1.7}};
 assert.equal(Speeds.resolve(data,units[0]),.6);assert.equal(Speeds.resolve(data,units[1],1),.8);assert.equal(Speeds.resolve(data,units[1],3),0);
 assert.equal(Speeds.resolve(data,units[2]),1.7);assert.equal(Speeds.resolve(data,units[3]),1);
 assert.equal(Speeds.key({...units[2],key:'character:created-slime',character:'created-slime'}),null);assert.equal(Speeds.resolve(data,{...units[2],character:'created-slime'}),1);
 assert.equal(Speeds.validate(data,units),true);assert.equal(Speeds.validate({},units),true);
});

test('invalid speed tables, ranges and unit/level targets cannot stage a draft or write files',t=>{
 const f=fixture(t),before=f.store.snapshot();
 const bad=[null,[],false,{'enemy:91001:default':-.01},{'enemy:91001:default':2.01},{'enemy:91001:default':Infinity},{'enemy:91001:default':'1'},{'enemy:99999:default':1},{'enemy:91001:2':1},{'ally:90001:level:2':1},{'character:new-slime':1}];
 for(const map of bad){const data=f.store.snapshot().data;data.unitAnimationSpeeds=map;assert.throws(()=>f.store.change({version:f.store.version,data}),/animation speed|animation speeds/);assert.deepEqual(f.store.snapshot(),before);}
 assert.deepEqual(fs.readFileSync(f.file),f.bytes);assert.deepEqual(fs.readFileSync(f.config),f.configBytes);
});

test('speed-only Save publishes just the catalog with exact backup and no model bake; undo, reset and no-change saves retain normal draft semantics',t=>{
 const f=fixture(t),Build=require('../../packages/hkd-characters/lib/appearance-build'),plan=Build.plan;Build.plan=()=>{throw Error('A speed edit must not bake appearance assets');};t.after(()=>{Build.plan=plan;});
 const staged=change(f.store,data=>{data.unitAnimationSpeeds={'enemy:91001:default':.45,'ally:90001:level:3':0};});
 assert.equal(staged.dirty,true);assert.deepEqual(fs.readFileSync(f.file),f.bytes);assert.deepEqual(fs.readFileSync(f.config),f.configBytes);
 assert.equal(f.store.undo({version:f.store.version}).dirty,false);assert.deepEqual(f.store.redo({version:f.store.version}).data,staged.data);
 const saved=f.store.save({version:f.store.version});assert.equal(saved.result.saved,true);assert.deepEqual(saved.result.files,['assets/resources/characters/catalog.json']);assert.equal(saved.canUndo,false);assert.equal(saved.canRedo,false);
 assert.deepEqual(fs.readFileSync(path.resolve(f.root,saved.result.backup)),f.bytes);const written=fs.readFileSync(f.file,'utf8');assert(written.includes('"number": 1.00'));assert.equal(JSON.parse(written).profiles.slime.future.retain,7);assert.equal(JSON.parse(written).unitAnimationSpeeds['enemy:91001:default'],.45);assert.deepEqual(fs.readFileSync(f.config),f.configBytes);
 const bytes=fs.readFileSync(f.file),mtime=fs.statSync(f.file).mtimeMs;assert.equal(f.store.save({version:f.store.version}).result.saved,false);assert.deepEqual(fs.readFileSync(f.file),bytes);assert.equal(fs.statSync(f.file).mtimeMs,mtime);
 change(f.store,data=>{delete data.unitAnimationSpeeds['enemy:91001:default'];});const reset=f.store.save({version:f.store.version});assert.deepEqual(reset.result.files,['assets/resources/characters/catalog.json']);assert.equal(Speeds.resolve(reset.data,units[2]),1);assert.equal(Speeds.resolve(reset.data,units[1],3),0);
 const reopened=new Service(f.root);assert.equal(Speeds.resolve(reopened.data,units[1],3),0);assert.deepEqual(fs.readFileSync(f.config),f.configBytes);
});

test('mixed speed and appearance edits use the existing appearance transaction',t=>{
 const f=fixture(t),Build=require('../../packages/hkd-characters/lib/appearance-build'),plan=Build.plan;let builds=0;
 Build.plan=(root,data)=>{builds++;return{data,files:new Map(),reads:new Map()};};t.after(()=>{Build.plan=plan;});
 change(f.store,data=>{data.unitAnimationSpeeds={'enemy:91001:default':1.25};data.profiles.slime.name='Renamed slime';});
 const saved=f.store.save({version:f.store.version});assert.equal(builds,1);assert.equal(saved.data.profiles.slime.name,'Renamed slime');assert.equal(saved.data.unitAnimationSpeeds['enemy:91001:default'],1.25);
});

test('speed-only drafts still refuse stale revisions and external catalog writes without losing edits',t=>{
 const f=fixture(t),version=f.store.version;change(f.store,data=>{data.unitAnimationSpeeds={'hero:hero:default':1.4};});const draft=f.store.snapshot();
 assert.throws(()=>f.store.change({version,data:draft.data}),/another window/);
 const external=JSON.parse(f.bytes);external.future.external=true;fs.writeFileSync(f.file,JSON.stringify(external));
 assert.throws(()=>f.store.save({version:f.store.version}),/outside this draft/);assert.deepEqual(f.store.snapshot(),draft);assert.equal(JSON.parse(fs.readFileSync(f.file)).future.external,true);assert.deepEqual(fs.readFileSync(f.config),f.configBytes);
});
