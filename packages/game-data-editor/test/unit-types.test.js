'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../../..'),Store=require('../lib/store').Store,Schema=require('../lib/schema'),Assets=require('../lib/asset-validation');
test('Unit Types browsing creates no draft; new types, pictograms and unit assignments stay in a shared draft and preserve timing tables',async()=>{
 const filename=path.join(__dirname,'building-panel.test.js');let prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];prefix=prefix.replace('function fixture()','function fixture(kind)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
 const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout,setImmediate};vm.createContext(context);vm.runInContext(prefix+'\nmodule.exports={fixture};',context);const f=context.module.exports.fixture('unit-types'),before=f.store.draftState(),file=path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),bytes=fs.readFileSync(file);
 for(const row of f.panel._rows())f.render(row.key);assert.equal(f.store.changes().length,0);
 await f.panel._newUnitType();await f.panel._queue;const id=f.panel._selected;assert(f.store.draftState().overrides.unitTypes[id]);
 await f.panel._set('overrides',['unitTypes',id],{name:'Test Beast',icon:before.overrides.unitTypes.fighter.icon,tint:'#80c0ff'});await f.panel._queue;
 const assignments={...f.store.draftState().overrides.unitTypeAssignments,'enemy:90001:default':id};await f.panel._set('overrides',['unitTypeAssignments'],assignments);await f.panel._queue;
 const after=f.store.draftState();assert.deepEqual(after.overrides.timingDefaults,before.overrides.timingDefaults);assert.deepEqual(after.overrides.timings,before.overrides.timings);assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(after.A.SoldierCfg[90001].AttackType,before.A.SoldierCfg[90001].AttackType);
 assert(!Schema.validate(after,f.store.changes()).some(i=>i.severity==='error'));assert(!Assets.validate(root,after,f.store.changes()).some(i=>i.severity==='error'));
});
test('unit types reject missing images, path traversal, dangling references and invalid visual scales',()=>{
 const store=new Store(root),docs=store.draftState();docs.overrides.unitTypes.test={name:'Test',icon:'@icon/../../escape'};docs.overrides.unitTypeAssignments['enemy:90001:default']='missing';docs.overrides.visuals['ally:90001:default']={scaleX:0};
 const changes=[{doc:'overrides',path:['unitTypes']},{doc:'overrides',path:['unitTypeAssignments']},{doc:'overrides',path:['visuals']}];
 assert(Schema.validate(docs,changes).some(i=>i.path.includes('unitTypeAssignments')));assert(Schema.validate(docs,changes).some(i=>i.path.includes('scaleX')));assert(Assets.validate(root,docs,changes).some(i=>i.path.includes('unitTypes')));
});

test('Manage types opens the registered panel directly even with a stale main-process router and preserves the current draft',async()=>{
 const filename=path.join(__dirname,'building-panel.test.js');let prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];
 prefix=prefix.replace('function fixture()','function fixture(kind)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind').replace('Panel: { extend: spec => spec },',"Panel: { extend: spec => spec, open: id => messages.push({message:'direct-panel',request:id}) },");
 const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout,setImmediate};vm.createContext(context);vm.runInContext(prefix+'\nmodule.exports={fixture,all};',context);
 const {fixture,all}=context.module.exports,f=fixture('units'),file=path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),bytes=fs.readFileSync(file);
 await f.panel._set('overrides',['unitTypes','fighter','name'],'Unsaved fighter name');await f.panel._queue;const before=f.store.draftState(),changes=JSON.stringify(f.store.changes());
 f.render('enemy:90001');const button=all(f.panel.$detail,element=>element.tagName==='button'&&element.textContent==='Manage types & pictograms')[0];assert(button);await button.onclick();
 assert(f.messages.some(message=>message.message==='direct-panel'&&message.request==='hkd-unit-types'));assert(!f.messages.some(message=>message.message==='game-data-editor:open-panel'));
 assert.deepEqual(f.store.draftState(),before);assert.equal(JSON.stringify(f.store.changes()),changes);assert.deepEqual(fs.readFileSync(file),bytes);
});

test('Units exposes six role counters and edits the allied record without touching its enemy or writing files',async()=>{
 const filename=path.join(__dirname,'building-panel.test.js');let prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];prefix=prefix.replace('function fixture()','function fixture(kind)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
 const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout,setImmediate};vm.createContext(context);vm.runInContext(prefix+'\nmodule.exports={fixture,fields};',context);const {fixture,fields}=context.module.exports,f=fixture('units'),file=path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),bytes=fs.readFileSync(file),before=f.store.draftState();
 const rows=f.panel._rows();assert.equal(rows.length,1+Object.keys(before.A.SoldierCfg).length+Object.keys(before.A.AllyCfg).length);assert.deepEqual(Array.from(rows.find(row=>row.key==='ally:90001').path),['AllyCfg','90001']);assert.deepEqual(Array.from(rows.find(row=>row.key==='enemy:90001').path),['SoldierCfg','90001']);
 f.render('ally:90001');assert.equal(f.store.changes().length,0);const counter=fields(f.panel.$detail,'Countered unit type')[0];assert(counter);assert.equal(counter.children.length,7);assert.deepEqual(Array.from(counter.children,o=>o.value).sort(),['','fighter','skirmisher','vanguard','mystic','bruiser','guardian'].sort());
 counter.value='guardian';counter.onchange();await f.panel._queue;
 const health=fields(f.panel.$detail,Schema.descriptor('Health',{table:'SoldierCfg',id:'90001'}).label)[0];assert(health);health.value=String(before.A.AllyCfg['90001'].Health+17);health.onchange();await f.panel._queue;
 const after=f.store.draftState();assert.equal(after.A.AllyCfg['90001'].CounterType,'guardian');assert.equal(after.A.AllyCfg['90001'].Health,before.A.AllyCfg['90001'].Health+17);assert.deepEqual(after.A.SoldierCfg,before.A.SoldierCfg);assert.deepEqual(after.overrides.timingDefaults,before.overrides.timingDefaults);assert.deepEqual(fs.readFileSync(file),bytes);
});
