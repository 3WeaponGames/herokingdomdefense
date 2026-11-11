'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module'),{Store}=require('../lib/store');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-profile-main-'));t.after(()=>{assert(root.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});});
 const cfg={SoldierCfg:{1:{ID:1,Name:'Model',prefab:'shared',MonsterSource:'monster1/One',MonsterPack:'monster1',Health:40,AttackDamage:10,AttackInterval:1}},LevelCfg:[],GameTools:{unitTypes:{fighter:{name:'Fighter'}},unitTypeAssignments:{'enemy:1:default':'fighter'},timingDefaults:{'enemy:1:default':{attack:.4}}}};
 for(const [file,data]of [['assets/KinghtFallConfig/GameJsonCfg.json',cfg],['assets/KinghtFallConfigB/GameJsonCfg.json',{LevelCfg:[]}],['assets/KinghtFallConfigD/GameJsonCfg.json',{LevelCfg:[]}],['assets/resources/localization/catalog.json',{entries:{}}]]){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(data));}
 const file=path.resolve(__dirname,'../main.js'),realRequire=createRequire(file),broadcasts=[],imports=[],module={exports:{}};let store,worlds,invalidations=0;
 const Editor={Project:{path:root},Ipc:{sendToAll:(name,value)=>broadcasts.push({name,value})},assetdb:{refresh:(file,done)=>{imports.push(file);done();}}};
 const customRequire=name=>name==='./lib/store'?{Store:class extends Store{constructor(root,options){super(root,{...options,validators:[],backupRoot:path.join(root,'backups')});store=this;}}}:name==='./worlds/service'?{Service:class{constructor(){this.root=root;this.version=7;this.indexData={cached:true};this.docs={'stage:A-1':{key:'stage:A-1',data:{id:'A-1',config:{WaveCfg:[]},future:{keep:true}}}};worlds=this;}catalog(){return {cached:!!this.indexData};}}}:name==='./lib/unit-assets'?{invalidate:()=>invalidations++}:realRequire(name);
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,Editor,require:customRequire,setTimeout,clearTimeout},{filename:file});
 const invoke=(name,request)=>new Promise((resolve,reject)=>module.exports.messages[name]({reply:(error,value)=>error?reject(Error(error)):resolve(value)},request));return {root,invoke,broadcasts,imports,get store(){return store;},get worlds(){return worlds;},get invalidations(){return invalidations;}};
}
test('profile IPC reads and edits drafts only; Save invalidates unit catalogs without dropping stage drafts or changing their revision',async t=>{
 const f=fixture(t);await f.invoke('world-catalog');const docs=f.worlds.docs,before=JSON.stringify(docs),read=await f.invoke('unit-profiles',{id:1});assert.equal(read.dirty,false);assert.equal(f.imports.length,0);
 const created=await f.invoke('unit-profile-change',{version:read.version,id:1,action:'add',name:'Fighter variant'});assert(created.id>=100000);assert.equal(f.imports.length,0);assert(f.worlds.indexData);
 const saved=await f.invoke('save',{version:created.version});assert(saved.result.saved);assert.equal(f.worlds.indexData,null);assert.equal(f.worlds.unitCatalogRevision,1);assert.equal(f.worlds.version,7);assert.equal(f.worlds.docs,docs);assert.equal(JSON.stringify(docs),before);assert.equal(f.invalidations,1);assert(f.imports.includes('db://assets/KinghtFallConfig/GameJsonCfg.json'));
 const imported=f.imports.length;await f.invoke('save',{version:f.store.version});assert.equal(f.imports.length,imported);assert.equal(f.worlds.unitCatalogRevision,1);
});
test('a wave that starts using a removed draft profile blocks Save and preserves the draft for correction',async t=>{
 const f=fixture(t);const view=await f.invoke('unit-profiles',{id:1}),created=await f.invoke('unit-profile-change',{version:view.version,id:1,action:'add',name:'Temporary'});await f.invoke('save',{version:created.version});await f.invoke('world-catalog');
 const removed=await f.invoke('unit-profile-change',{version:f.store.version,id:created.id,action:'remove'});f.worlds.docs['stage:A-1'].data.config.WaveCfg=[{SpawnTimeline:[{unitId:created.id}]}];
 await assert.rejects(f.invoke('save',{version:removed.version}),/now used/);assert(f.store.changes().length);const saved=JSON.parse(fs.readFileSync(path.join(f.root,'assets/KinghtFallConfig/GameJsonCfg.json')));assert(saved.SoldierCfg[created.id]);
});
