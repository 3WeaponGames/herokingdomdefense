'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Classes=require('../lib/enemy-classes'),Profiles=require('../lib/unit-profiles'),API=require('../lib/unit-profile-service'),{Store}=require('../lib/store'),Schema=require('../lib/schema');
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-enemy-classes-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const base={ID:1,Name:'Model',prefab:'model',MonsterSource:'monster1/Shared',MonsterPack:'monster1',Health:40,AttackDamage:10,AttackInterval:1,AttackRange:50,SearchRange:100,Speed:80,Future:{keep:true}};
 const config={SoldierCfg:{1:base,2:{...clone(base),ID:2,MonsterSource:undefined,AppearanceSourceUnit:1,CampaignBaseUnit:90001,Health:65}},LevelCfg:[{Level:1,WaveCfg:[{Wave:1,SpawnTimeline:[{unitId:2,count:3}]}]}],GameTools:{unitTypes:{fighter:{name:'Fighter'}},unitTypeAssignments:{'enemy:1:default':'fighter','enemy:2:default':'fighter'},timingDefaults:{'enemy:1:default':{attack:.3}},timings:{}}};
 for(const [file,value]of [['assets/KinghtFallConfig/GameJsonCfg.json',config],['assets/KinghtFallConfigB/GameJsonCfg.json',{LevelCfg:[]}],['assets/KinghtFallConfigD/GameJsonCfg.json',{LevelCfg:[]}],['assets/resources/localization/catalog.json',{entries:{}}]]){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(value));}
 const store=new Store(root,{backupRoot:path.join(root,'test-backups')}),act=(id,action,data)=>API.change(store,{version:store.version,id,action,...data});
 return {root,store,act,file:path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json')};
}
test('enemy classes read virtual defaults and exact assignments without seeding or inferring strength from a model pack',()=>{
 const settings={unitProfiles:{entries:{100000:{baseId:90010},100001:{baseId:100001}}}},before=clone(settings);
 assert.deepEqual(Classes.CHOICES.map(choice=>choice.label),['Normal','Elite','Boss']);
 for(const id of [1,94001,100001])assert.equal(Classes.resolve(settings,id),'normal');
 for(const id of [90010,90011,90012,100000])assert.equal(Classes.resolve(settings,id),'boss');
 assert.deepEqual(settings,before);assert.equal(Classes.key(90011),'enemy:90011:2');
 settings.enemyClasses={'enemy:1:default':'elite','enemy:90011:2':'normal'};
 assert.equal(Classes.resolve(settings,1),'elite');assert.equal(Classes.resolve(settings,90011),'normal');
 settings.enemyClasses['enemy:1:default']='future';assert.equal(Classes.resolve(settings,1),'normal');assert.equal(Classes.label('elite'),'Elite');
});
test('classification validation rejects invalid enums, missing enemies, allied assignments and wrong boss forms',()=>{
 const base={SoldierCfg:{1:{ID:1},90011:{ID:90011}}};
 assert.deepEqual(Classes.validate({enemyClasses:{'enemy:1:default':'normal','enemy:90011:2':'boss'}},base),[]);
 for(const enemyClasses of [[],null,{'ally:1:default':'elite'},{'enemy:99:default':'elite'},{'enemy:90011:default':'boss'},{'enemy:1:default':'mythic'}])assert(Classes.validate({enemyClasses},base).length);
 const docs={A:base,overrides:{version:1,enemyClasses:{'enemy:1:default':'mythic'}}};assert(Schema.validate(docs,[]).some(issue=>issue.doc==='overrides'&&issue.path[0]==='enemyClasses'));
});
test('profile classes inherit, override and reset while independent campaign profiles retain their original class',t=>{
 const f=fixture(t),bytes=fs.readFileSync(f.file),before=f.store.draftState();
 assert.equal(API.read(f.store,{id:1}).profiles[0].enemyClass,'normal');assert.deepEqual(f.store.draftState(),before);assert(!f.store.documents.overrides.data.enemyClasses);
 const id=f.act(1,'add',{name:'Variant'}).id;assert(!f.store.documents.overrides.data.enemyClasses,'new Normal profile does not seed a class table');
 f.act(2,'rename',{name:'Campaign'});assert.equal(Classes.resolve(f.store.documents.overrides.data,2),'normal');const timingBefore=clone(f.store.documents.overrides.data.timingDefaults);
 f.act(1,'set',{field:'enemyClass',value:'elite'});let state=f.store.draftState();assert.equal(Classes.resolve(state.overrides,id),'elite');assert.equal(Classes.resolve(state.overrides,2),'normal');
 f.act(id,'set',{field:'enemyClass',value:'boss'});f.act(1,'set',{field:'enemyClass',value:'normal'});state=f.store.draftState();assert.equal(Classes.resolve(state.overrides,id),'boss');
 f.act(id,'reset',{field:'enemyClass'});state=f.store.draftState();assert.equal(Classes.resolve(state.overrides,id),'normal');assert(!Object.hasOwn(state.overrides.unitProfiles.entries[id],'enemyClass'));
 for(const [unitId,row]of Object.entries(before.A.SoldierCfg))assert.deepEqual(state.A.SoldierCfg[unitId],row);assert.deepEqual(state.overrides.timingDefaults,timingBefore);assert.deepEqual(state.overrides.unitTypeAssignments['enemy:1:default'],before.overrides.unitTypeAssignments['enemy:1:default']);assert(fs.readFileSync(f.file).equals(bytes));
});
test('existing profiles remain unseeded on unrelated edits and direct classification edits reconcile into overrides',t=>{
 const f=fixture(t),id=f.act(1,'add',{name:'Variant'}).id;
 f.act(1,'set',{field:'Health',value:50});assert(!f.store.documents.overrides.data.enemyClasses);
 f.store.change({version:f.store.version,edits:[{doc:'overrides',path:['enemyClasses'],value:{[Classes.key(id)]:'elite'}}]});
 assert.equal(f.store.documents.overrides.data.unitProfiles.entries[id].enemyClass,'elite');
 f.act(1,'set',{field:'enemyClass',value:'boss'});assert.equal(Classes.resolve(f.store.documents.overrides.data,id),'elite');
 const duplicate=f.act(id,'duplicate',{name:'Duplicate'}).id;assert.equal(Classes.resolve(f.store.documents.overrides.data,duplicate),'elite');
 f.act(duplicate,'remove');assert(!Object.hasOwn(f.store.documents.overrides.data.enemyClasses,Classes.key(duplicate)));
});
test('classification changes support undo, redo, explicit save and no-op save without modifying stage data',t=>{
 const f=fixture(t),before=f.store.draftState(),bytes=fs.readFileSync(f.file);f.act(1,'set',{field:'enemyClass',value:'boss'});
 assert(fs.readFileSync(f.file).equals(bytes));f.store.undo({version:f.store.version});assert.deepEqual(f.store.draftState(),before);f.store.redo({version:f.store.version});
 const bad=f.store.draftState();assert.throws(()=>f.act(1,'set',{field:'enemyClass',value:'legendary'}),/Normal, Elite or Boss/);assert.deepEqual(f.store.draftState(),bad);
 assert(f.store.save({version:f.store.version}).result.saved);const saved=JSON.parse(fs.readFileSync(f.file));assert.equal(saved.GameTools.enemyClasses[Classes.key(1)],'boss');assert.deepEqual(saved.LevelCfg,before.A.LevelCfg);assert.deepEqual(saved.SoldierCfg,before.A.SoldierCfg);assert(f.store.save({version:f.store.version}).result.noChanges);
});
