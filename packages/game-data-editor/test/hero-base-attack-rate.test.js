'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test'),{createRequire}=require('node:module');
const {Store,files}=require('../lib/store'),Schema=require('../lib/schema'),Stats=require('../../../assets/_script/HeroEquipmentStats'),Weapons=require('../../../assets/_script/HeroWeapons'),temporary=require('./owned-temp');
const root=path.resolve(__dirname,'../../..'),rateLabel='Base attack speed (attacks/sec)',primary=files.A;
function panelFixture(kind,store){
 const filename=path.join(__dirname,'building-panel.test.js');let prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];
 prefix=prefix.replace('function fixture()','function fixture(kind,sharedStore)').replace('const store = new Store(project)','const store = sharedStore || new Store(project)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
 const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout};vm.runInNewContext(prefix+'\nmodule.exports={fixture,fields,all};',context);
 return Object.assign(context.module.exports.fixture(kind,store),{fields:context.module.exports.fields,all:context.module.exports.all});
}
function baseline(store,edit){for(const version of ['data','original'])edit(store.documents.A[version]);}
function isolated(){
 const project=temporary('hkd-hero-rates-');for(const file of Object.values(files).concat('assets/configs/GameJsonCfg.json')){const to=path.join(project,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);}
 return new Store(project,{validators:[Schema.validate],backupRoot:path.join(project,'backups')});
}
function ratesIssues(data){return Schema.validate(data,[{doc:'A',path:['HeroEquipment','baseAttackRates']}]).filter(i=>i.path[0]==='HeroEquipment'&&i.path[1]==='baseAttackRates');}
function buttons(f,label){return f.all(f.panel.$detail,e=>e.tagName==='button'&&e.textContent===label);}

test('Unit Types exposes hero defaults for six fighting styles only and browsing or unchanged input creates no draft',()=>{
 const f=panelFixture('unit-types');baseline(f.store,data=>{delete data.HeroEquipment.baseAttackRates;});f.panel._apply(f.store.snapshot());const before=f.store.draftState(),version=f.store.version,bytes=fs.readFileSync(path.join(root,primary));
 for(const style of Weapons.styles){f.render(style.id);const input=f.fields(f.panel.$detail,rateLabel)[0];assert(input,style.id);assert.equal(Number(input.value),Stats.baseAttackRate(before.A,style.id));assert.equal(input.disabled,false);assert.match(input.title,/Hero only/);assert.match(input.title,/Cloak/);assert.match(input.title,/not Spine/);input.onchange();assert.equal(buttons(f,'Reset base attack speed').length,0);}
 f.panel.$detail.textContent='';f.panel._unitType({key:'future-role',record:{name:'Future role',icon:''}});assert.equal(f.fields(f.panel.$detail,rateLabel).length,0,'Custom roles have no hero fighting-style defaults');
 assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.version,version);assert.equal(f.messages.filter(m=>m.message==='game-data-editor:change').length,0);assert.deepEqual(fs.readFileSync(path.join(root,primary)),bytes);
});

test('explicit input creates the optional table in drafts, rejects invalid rates and preserves all gameplay timing tables',async()=>{
 const f=panelFixture('unit-types');baseline(f.store,data=>{delete data.HeroEquipment.baseAttackRates;});f.panel._apply(f.store.snapshot());f.render('fighter');const before=f.store.draftState(),bytes=fs.readFileSync(path.join(root,primary));
 let input=f.fields(f.panel.$detail,rateLabel)[0];for(const bad of ['0','-1','Infinity','not-a-number','']){input.value=bad;input.onchange();}assert.equal(f.store.changes().length,0);
 input.value='1.75';input.onchange();await f.panel._queue;const after=f.store.draftState();assert.deepEqual(after.A.HeroEquipment.baseAttackRates,{fighter:1.75});assert.deepEqual(after.overrides,before.overrides);assert.deepEqual(after.A.EquipCfg,before.A.EquipCfg);assert.deepEqual(fs.readFileSync(path.join(root,primary)),bytes);
 assert.equal(buttons(f,'Reset base attack speed').length,1);const version=f.store.version;input=f.fields(f.panel.$detail,rateLabel)[0];input.onchange();assert.equal(f.store.version,version);
 await Promise.all([f.panel._setHeroAttackRate('mystic',.9),f.panel._setHeroAttackRate('guardian',.7)]);assert.deepEqual(f.store.draftState().A.HeroEquipment.baseAttackRates,{fighter:1.75,mystic:.9,guardian:.7},'Queued style edits retain their independent values');
});

test('a rapid edit back to the displayed attack speed wins over an earlier queued change',async()=>{
 const f=panelFixture('unit-types');baseline(f.store,data=>{delete data.HeroEquipment.baseAttackRates;data.EquipCfg.find(row=>row.id===5).levelInfo[0].Parameters=1;});f.panel._apply(f.store.snapshot());f.render('fighter');const input=f.fields(f.panel.$detail,rateLabel)[0],before=fs.readFileSync(path.join(root,primary));
 assert.equal(input.value,'1');input.onchange();await f.panel._queue;assert.equal(f.messages.filter(m=>m.message==='game-data-editor:change').length,0,'An unchanged initial value sends no mutation');assert.equal(f.store.changes().length,0);
 input.value='2';input.onchange();input.value='1';input.onchange();await f.panel._queue;assert.equal(f.store.draftState().A.HeroEquipment.baseAttackRates.fighter,1,'The last control value is authoritative even before IPC resolves');assert.equal(f.fields(f.panel.$detail,rateLabel)[0].value,'1');assert.deepEqual(fs.readFileSync(path.join(root,primary)),before);
 const changes=f.messages.filter(m=>m.message==='game-data-editor:change').length,version=f.store.version;const current=f.fields(f.panel.$detail,rateLabel)[0];current.onchange();await f.panel._queue;assert.equal(f.store.version,version);assert.equal(f.messages.filter(m=>m.message==='game-data-editor:change').length,changes,'Fresh-value deduplication avoids redundant IPC');
});

test('Unit Types and both weapon tracks share one style value; reset removes only that style and preserves unknown fields',async()=>{
 const unit=panelFixture('unit-types');baseline(unit.store,data=>{data.HeroEquipment.baseAttackRates={fighter:1.25,guardian:.8,futureStyle:{formula:'keep',extension:[1,2]}};data.HeroEquipment.futureSetting={keep:true};});unit.panel._apply(unit.store.snapshot());
 const gear=panelFixture('equipment',unit.store);unit.render('fighter');let input=unit.fields(unit.panel.$detail,rateLabel)[0];input.value='2';input.onchange();await unit.panel._queue;
 for(const key of ['4:fighter','3:fighter']){gear.panel._apply(unit.store.snapshot());gear.render(key);assert.equal(gear.fields(gear.panel.$detail,rateLabel)[0].value,'2');}
 input=gear.fields(gear.panel.$detail,rateLabel)[0];input.value='1.6';input.onchange();await gear.panel._queue;unit.panel._apply(unit.store.snapshot());unit.render('fighter');assert.equal(unit.fields(unit.panel.$detail,rateLabel)[0].value,'1.6');
 await buttons(unit,'Reset base attack speed')[0].onclick();await unit.panel._queue;const current=unit.store.draftState();assert.equal(Object.hasOwn(current.A.HeroEquipment.baseAttackRates,'fighter'),false);assert.equal(current.A.HeroEquipment.baseAttackRates.guardian,.8);assert.deepEqual(current.A.HeroEquipment.baseAttackRates.futureStyle,{formula:'keep',extension:[1,2]});assert.deepEqual(current.A.HeroEquipment.futureSetting,{keep:true});assert.equal(Number(unit.fields(unit.panel.$detail,rateLabel)[0].value),Stats.baseAttackRate(current.A,'fighter'));
 const version=unit.store.version;await unit.panel._setHeroAttackRate('fighter',undefined);assert.equal(unit.store.version,version,'Resetting an absent leaf is a no-op');
});

test('malformed tables are not repaired by opening or editing, and legacy configurations remain read-only',async()=>{
 const f=panelFixture('unit-types');for(const invalid of [null,[],42,'bad']){baseline(f.store,data=>{data.HeroEquipment.baseAttackRates=invalid;});f.panel._apply(f.store.snapshot());f.render('mystic');const before=f.store.draftState();assert.equal(f.fields(f.panel.$detail,rateLabel)[0].disabled,true);await f.panel._setHeroAttackRate('mystic',1.5);assert.deepEqual(f.store.draftState(),before);assert.match(f.panel.$status.textContent,/invalid format/);}
 baseline(f.store,data=>{delete data.HeroEquipment;});f.panel._apply(f.store.snapshot());f.render('guardian');assert.equal(f.fields(f.panel.$detail,rateLabel)[0].disabled,true);assert.equal(f.store.changes().length,0);
});

test('optional rate validation accepts sparse and future fields without normalizing, and rejects malformed or invalid known values',()=>{
 const store=new Store(root),docs=store.draftState();delete docs.A.HeroEquipment.baseAttackRates;assert.deepEqual(ratesIssues(docs),[]);
 docs.A.HeroEquipment.baseAttackRates={fighter:1.3,futureStyle:{implementation:'unknown',data:[null,'keep']}};const before=JSON.stringify(docs);assert.deepEqual(ratesIssues(docs),[]);assert.equal(JSON.stringify(docs),before);
 for(const value of [null,[],true,42,'bad']){docs.A.HeroEquipment.baseAttackRates=value;assert(ratesIssues(docs).some(i=>i.severity==='error'&&i.path.length===2));}
 for(const value of [0,-1,NaN,Infinity,-Infinity,'2',null]){docs.A.HeroEquipment.baseAttackRates={fighter:value};assert(ratesIssues(docs).some(i=>i.severity==='error'&&i.path[2]==='fighter'));}
 for(const style of Weapons.styles){docs.A.HeroEquipment.baseAttackRates={[style.id]:.37};assert.deepEqual(ratesIssues(docs),[]);}
});

test('configured rates require a positive level-one Cloak baseline and finite results across its curve',()=>{
 const store=new Store(root),docs=store.draftState(),cloak=docs.A.EquipCfg.find(row=>row.id===5),original=cloak.levelInfo[0].Parameters;cloak.levelInfo[0].Parameters=0;delete docs.A.HeroEquipment.baseAttackRates;assert.deepEqual(ratesIssues(docs),[],'Legacy zero baseline remains valid without the new setting');docs.A.HeroEquipment.baseAttackRates={futureStyle:{keep:true}};assert.deepEqual(ratesIssues(docs),[]);
 docs.A.HeroEquipment.baseAttackRates={fighter:1};assert(ratesIssues(docs).some(i=>/level 1 Cloak/.test(i.message)));
 cloak.levelInfo[0].Parameters=original;docs.A.HeroEquipment.baseAttackRates={fighter:Number.MAX_VALUE};assert(ratesIssues(docs).some(i=>i.path[2]==='fighter'&&/remain finite/.test(i.message)));
 docs.A.HeroEquipment.baseAttackRates={fighter:1e10};assert.deepEqual(ratesIssues(docs),[],'No arbitrary attack speed cap is introduced');
});

test('isolated saves persist sparse style defaults, retain unknown fields, reject stale revisions and perform no writes on no-op',()=>{
 const store=isolated(),target=path.join(store.root,primary),before=fs.readFileSync(target),version=store.version,mirror=path.join(store.root,'assets/configs/GameJsonCfg.json'),mirrorBefore=fs.readFileSync(mirror);const edits=[{doc:'A',path:['HeroEquipment','baseAttackRates'],value:{fighter:1.8,futureStyle:{keep:'future'}}}];
 store.change({version,edits});assert.deepEqual(fs.readFileSync(target),before);assert.throws(()=>store.change({version,edits}),/Another panel/);store.undo({version:store.version});assert.equal(store.changes().length,0);store.redo({version:store.version});
 const saved=store.save({version:store.version});assert.equal(saved.result.saved,true);const current=JSON.parse(fs.readFileSync(target));assert.deepEqual(current.HeroEquipment.baseAttackRates,{fighter:1.8,futureStyle:{keep:'future'}});assert.equal(Stats.baseAttackRate(current,'fighter'),1.8,'The saved canonical config is the runtime helper input');assert.deepEqual(fs.readFileSync(mirror),mirrorBefore,'Existing generic save behavior leaves the separate legacy config untouched');const stable=fs.readFileSync(target),stat=fs.statSync(target);const noop=store.save({version:store.version});assert.equal(noop.result.noChanges,true);assert.deepEqual(fs.readFileSync(target),stable);assert.equal(fs.statSync(target).mtimeMs,stat.mtimeMs);
 store.change({version:store.version,edits:[{doc:'A',path:['HeroEquipment','baseAttackRates','fighter'],value:2.1}]});fs.appendFileSync(target,' ');const draft=store.draftState();assert.throws(()=>store.save({version:store.version}),/changed outside/);assert.deepEqual(store.draftState(),draft);assert.equal(JSON.parse(fs.readFileSync(target)).HeroEquipment.baseAttackRates.fighter,1.8);
});
