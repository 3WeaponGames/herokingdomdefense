'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
function fixture(){
 const filename=path.join(__dirname,'building-panel.test.js');let source=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];
 source=source.replace('function fixture()','function fixture(kind)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
 const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout,setImmediate};vm.createContext(context);vm.runInContext(source+'\nmodule.exports={fixture,fields};',context);
 return {f:context.module.exports.fixture('units'),fields:context.module.exports.fields};
}
test('Units assigns Normal, Elite and Boss in drafts without changing combat roles, stats, timing or saved data',async()=>{
 const {f,fields}=fixture(),before=f.store.draftState(),file=path.resolve(__dirname,'../../../assets/KinghtFallConfig/GameJsonCfg.json'),bytes=fs.readFileSync(file);
 f.render('enemy:90001');let choices=fields(f.panel.$detail,'Enemy class')[0];assert(choices);
 assert.deepEqual(Array.from(choices.children,option=>[option.value,option.textContent]),[['normal','Normal'],['elite','Elite'],['boss','Boss']]);assert.equal(choices.value,'normal');assert.equal(f.store.changes().length,0);
 choices.value='elite';choices.onchange();await f.panel._queue;assert.equal(f.store.documents.overrides.data.enemyClasses['enemy:90001:default'],'elite');
 f.render('enemy:90001');choices=fields(f.panel.$detail,'Enemy class')[0];choices.value='boss';choices.onchange();await f.panel._queue;assert.equal(f.store.documents.overrides.data.enemyClasses['enemy:90001:default'],'boss');
 const after=f.store.draftState();assert.deepEqual(after.A,before.A);for(const table of ['unitTypeAssignments','timings','timingDefaults'])assert.deepEqual(after.overrides[table],before.overrides[table]);assert(fs.readFileSync(file).equals(bytes));
 f.render('ally:90001');assert.equal(fields(f.panel.$detail,'Enemy class').length,0);
});
test('opening linked legacy boss forms shows Boss without writing a class assignment',()=>{
 const {f,fields}=fixture(),before=f.store.draftState();f.render('enemy:90010');assert.equal(fields(f.panel.$detail,'Enemy class')[0].value,'boss');assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0);
});
