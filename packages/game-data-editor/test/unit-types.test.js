'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../../..'),Store=require('../lib/store').Store,Schema=require('../lib/schema'),Assets=require('../lib/asset-validation');
test('Unit Types browsing creates no draft; new types, pictograms and unit assignments stay in a shared draft and preserve timing tables',async()=>{
 const filename=path.join(__dirname,'building-panel.test.js');let prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];prefix=prefix.replace('function fixture()','function fixture(kind)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
 const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout,setImmediate};vm.createContext(context);vm.runInContext(prefix+'\nmodule.exports={fixture};',context);const f=context.module.exports.fixture('unit-types'),before=f.store.draftState(),file=path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),bytes=fs.readFileSync(file);
 for(const row of f.panel._rows())f.render(row.key);assert.equal(f.store.changes().length,0);
 await f.panel._newUnitType();await f.panel._queue;const id=f.panel._selected;assert(f.store.draftState().overrides.unitTypes[id]);
 await f.panel._set('overrides',['unitTypes',id],{name:'Test Beast',icon:before.overrides.unitTypes.wolf.icon,tint:'#80c0ff'});await f.panel._queue;
 const assignments={...f.store.draftState().overrides.unitTypeAssignments,'enemy:90001:default':id};await f.panel._set('overrides',['unitTypeAssignments'],assignments);await f.panel._queue;
 const after=f.store.draftState();assert.deepEqual(after.overrides.timingDefaults,before.overrides.timingDefaults);assert.deepEqual(after.overrides.timings,before.overrides.timings);assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(after.A.SoldierCfg[90001].AttackType,before.A.SoldierCfg[90001].AttackType);
 assert(!Schema.validate(after,f.store.changes()).some(i=>i.severity==='error'));assert(!Assets.validate(root,after,f.store.changes()).some(i=>i.severity==='error'));
});
test('unit types reject missing images, path traversal, dangling references and invalid visual scales',()=>{
 const store=new Store(root),docs=store.draftState();docs.overrides.unitTypes.test={name:'Test',icon:'@icon/../../escape'};docs.overrides.unitTypeAssignments['enemy:90001:default']='missing';docs.overrides.visuals['ally:90001:default']={scaleX:0};
 const changes=[{doc:'overrides',path:['unitTypes']},{doc:'overrides',path:['unitTypeAssignments']},{doc:'overrides',path:['visuals']}];
 assert(Schema.validate(docs,changes).some(i=>i.path.includes('unitTypeAssignments')));assert(Schema.validate(docs,changes).some(i=>i.path.includes('scaleX')));assert(Assets.validate(root,docs,changes).some(i=>i.path.includes('unitTypes')));
});
