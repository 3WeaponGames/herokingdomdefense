'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test'),{createRequire}=require('node:module');
const {Store,files}=require('../lib/store'),Schema=require('../lib/schema'),temporary=require('./owned-temp');
const Damage=require('../../../assets/_script/FightingTypeDamage');
const root=path.resolve(__dirname,'../../..'),primary=files.A;
function fixture(){
 const filename=path.join(__dirname,'building-panel.test.js');let prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];
 prefix=prefix.replace('function fixture()','function fixture(kind)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
 const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout};
 vm.runInNewContext(prefix+'\nmodule.exports={fixture,fields};',context);
 return Object.assign(context.module.exports.fixture('unit-types'),{fields:context.module.exports.fields});
}
function baseline(f,edit){for(const state of ['data','original']){edit(f.store.documents.overrides[state]);edit(f.store.documents.A[state].GameTools);}f.panel._apply(f.store.snapshot());}
function control(f,label){const input=f.fields(f.panel.$detail,label)[0];assert(input,label);return input;}
function issues(docs){return Schema.validate(docs,[{doc:'overrides',path:['unitTypes']}]).filter(i=>i.path[0]==='unitTypes'&&i.path.includes('damageTaken'));}

test('Fighting Types shows More / Less and literal percentages; browsing, legacy settings and unchanged input never create drafts or writes',async()=>{
 const f=fixture(),before=f.store.draftState(),bytes=fs.readFileSync(path.join(root,primary)),version=f.store.version;
 for(const [id,type]of Object.entries(before.overrides.unitTypes)){
  f.render(id);const mode=control(f,'Damage taken'),percent=control(f,'Amount (%)');
  assert.deepEqual(Array.from(mode.children,o=>o.textContent),['More','Less']);
  assert.equal(mode.value,type.damageTaken.mode);assert.equal(Number(percent.value),type.damageTaken.percent);
  mode.onchange();percent.onchange();await f.panel._queue;
 }
 assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.version,version);
 assert.equal(f.messages.filter(m=>m.message==='game-data-editor:change').length,0);assert.deepEqual(fs.readFileSync(path.join(root,primary)),bytes);
 baseline(f,tools=>{for(const type of Object.values(tools.unitTypes))delete type.damageTaken;});
 for(const id of Object.keys(f.store.draftState().overrides.unitTypes)){
  f.render(id);assert.equal(control(f,'Damage taken').value,'more');assert.equal(control(f,'Amount (%)').value,'0');
  control(f,'Damage taken').onchange();control(f,'Amount (%)').onchange();await f.panel._queue;
 }
 assert.equal(f.store.changes().length,0);assert.deepEqual(fs.readFileSync(path.join(root,primary)),bytes);
});

test('percentage and direction edits stay in drafts, preserve unknown fields and resolve to the agreed combat values',async()=>{
 const f=fixture();baseline(f,tools=>{tools.unitTypes.fighter.future={keep:true};tools.unitTypes.fighter.damageTaken.future={keep:[1,2]};});f.render('fighter');
 const before=f.store.draftState(),bytes=fs.readFileSync(path.join(root,primary));
 let percent=control(f,'Amount (%)');percent.value='400';percent.onchange();await f.panel._queue;
 let setting=f.store.draftState().overrides.unitTypes.fighter.damageTaken;
 assert.equal(setting.percent,400);assert.equal(Damage.multiplier(setting),5);assert.match(f.panel.$detail.textContent,/Result: 5× incoming damage \(500% of standard\)/);
 let mode=control(f,'Damage taken');mode.value='less';mode.onchange();await f.panel._queue;
 setting=f.store.draftState().overrides.unitTypes.fighter.damageTaken;assert.equal(Damage.multiplier(setting),.25);assert.match(f.panel.$detail.textContent,/Result: 0.25× incoming damage \(25% of standard\)/);
 percent=control(f,'Amount (%)');percent.value='300';percent.onchange();await f.panel._queue;assert.equal(Damage.multiplier(f.store.draftState().overrides.unitTypes.fighter.damageTaken),1/3);
 mode=control(f,'Damage taken');mode.value='more';mode.onchange();await f.panel._queue;
 percent=control(f,'Amount (%)');percent.value='10';percent.onchange();await f.panel._queue;
 setting=f.store.draftState().overrides.unitTypes.fighter.damageTaken;assert.equal(Damage.multiplier(setting),1.1);assert.deepEqual(setting.future,{keep:[1,2]});
 const after=f.store.draftState();assert.deepEqual(after.A,before.A);assert.deepEqual(after.B,before.B);assert.deepEqual(after.D,before.D);assert.deepEqual(after.catalog,before.catalog);
 const expected=structuredClone(before.overrides);expected.unitTypes.fighter.damageTaken={mode:'more',percent:10,future:{keep:[1,2]}};assert.deepEqual(after.overrides,expected);
 assert.deepEqual(issues(after),[]);assert.deepEqual(fs.readFileSync(path.join(root,primary)),bytes);
});

test('queued edits use the latest draft, invalid percentages are rejected, and selecting Less from zero starts at its neutral 100%',async()=>{
 const f=fixture();baseline(f,tools=>{delete tools.unitTypes.fighter.damageTaken;});f.render('fighter');
 let mode=control(f,'Damage taken');mode.value='less';mode.onchange();await f.panel._queue;
 assert.deepEqual(f.store.draftState().overrides.unitTypes.fighter.damageTaken,{mode:'less',percent:100});
 const percent=control(f,'Amount (%)');for(const value of ['','bad','Infinity','-1','0','10','99']){percent.value=value;percent.onchange();}
 await f.panel._queue.catch(()=>{});assert.equal(f.store.draftState().overrides.unitTypes.fighter.damageTaken.percent,100);
 percent.value='400';percent.onchange();percent.value='100';percent.onchange();await f.panel._queue;
 assert.equal(f.store.draftState().overrides.unitTypes.fighter.damageTaken.percent,100,'Returning to the displayed percentage wins over an earlier queued edit');
 mode=control(f,'Damage taken');const input=control(f,'Amount (%)');mode.value='more';mode.onchange();input.value='10';input.onchange();await f.panel._queue;
 assert.deepEqual(f.store.draftState().overrides.unitTypes.fighter.damageTaken,{mode:'more',percent:10});
 await Promise.all([f.panel._setUnitTypeDamageTaken('fighter','percent',400),f.panel._setUnitTypeDamageTaken('mystic','percent',300)]);
 const tools=f.store.draftState().overrides;assert.equal(tools.unitTypes.fighter.damageTaken.percent,400);assert.equal(tools.unitTypes.mystic.damageTaken.percent,300);
 const version=f.store.version;await f.panel._setUnitTypeDamageTaken('fighter','percent',400);assert.equal(f.store.version,version);
});

test('optional percentage settings validate without normalization, and malformed settings are not repaired by opening the panel',async()=>{
 const store=new Store(root),docs=store.draftState();delete docs.overrides.unitTypes.fighter.damageTaken;assert.deepEqual(issues(docs),[]);
 for(const setting of [{mode:'more',percent:0},{mode:'more',percent:10},{mode:'more',percent:400},{mode:'less',percent:100},{mode:'less',percent:400,future:{keep:true}}]){
  docs.overrides.unitTypes.fighter.damageTaken=setting;const before=JSON.stringify(docs);assert.deepEqual(issues(docs),[]);assert.equal(JSON.stringify(docs),before);
 }
 for(const setting of [null,[],0,'400',{}, {mode:'other',percent:400},{mode:'more',percent:'400'},{mode:'more',percent:NaN},{mode:'more',percent:Infinity},{mode:'more',percent:-1},{mode:'less',percent:99}]){
  docs.overrides.unitTypes.fighter.damageTaken=setting;assert(issues(docs).some(i=>i.severity==='error'&&i.path[1]==='fighter'));
 }
 const f=fixture();baseline(f,tools=>{tools.unitTypes.fighter.damageTaken={mode:'less',percent:0,future:'preserve'};});f.render('fighter');const before=f.store.draftState();
 assert.equal(control(f,'Damage taken').disabled,true);assert.equal(control(f,'Amount (%)').disabled,true);
 await f.panel._setUnitTypeDamageTaken('fighter','percent',400);assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0);
 assert.match(f.panel.$status.textContent,/invalid format/);
});

test('explicit saves persist percentage settings alone, retain extensions, create backups and reject concurrent writes; no-change saves write nothing',()=>{
 const project=temporary('hkd-type-damage-');
 for(const relative of Object.values(files).concat('assets/configs/GameJsonCfg.json')){const target=path.join(project,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,relative),target);}
 const target=path.join(project,primary),config=JSON.parse(fs.readFileSync(target));config.GameTools.unitTypes.guardian.damageTaken.future={keep:[1,2]};fs.writeFileSync(target,JSON.stringify(config,null,2));
 const backupRoot=path.join(project,'backups'),store=new Store(project,{validators:[Schema.validate],backupRoot});
 const unchanged=Object.fromEntries(Object.values(files).filter(p=>p!==primary).concat('assets/configs/GameJsonCfg.json').map(p=>[p,fs.readFileSync(path.join(project,p))]));
 const initial=fs.readFileSync(target),stat=fs.statSync(target);assert.equal(store.save({version:store.version}).result.noChanges,true);assert.equal(fs.statSync(target).mtimeMs,stat.mtimeMs);
 store.change({version:store.version,edits:[{doc:'overrides',path:['unitTypes','guardian','damageTaken','percent'],value:400}]});assert.deepEqual(fs.readFileSync(target),initial);
 const result=store.save({version:store.version});assert.equal(result.result.saved,true);config.GameTools.unitTypes.guardian.damageTaken.percent=400;
 assert.deepEqual(JSON.parse(fs.readFileSync(target)),config);assert.equal(Damage.multiplier(JSON.parse(fs.readFileSync(target)).GameTools.unitTypes.guardian.damageTaken),.25);
 assert(fs.readdirSync(backupRoot).length>0);for(const [relative,bytes]of Object.entries(unchanged))assert.deepEqual(fs.readFileSync(path.join(project,relative)),bytes);
 const saved=fs.readFileSync(target),savedStat=fs.statSync(target);assert.equal(store.save({version:store.version}).result.noChanges,true);assert.deepEqual(fs.readFileSync(target),saved);assert.equal(fs.statSync(target).mtimeMs,savedStat.mtimeMs);
 store.change({version:store.version,edits:[{doc:'overrides',path:['unitTypes','guardian','damageTaken','percent'],value:300}]});
 const external=JSON.parse(fs.readFileSync(target));external.GameTools.unitTypes.guardian.damageTaken.percent=250;fs.writeFileSync(target,JSON.stringify(external));const draft=store.draftState();
 assert.throws(()=>store.save({version:store.version}),/changed outside/);assert.deepEqual(store.draftState(),draft);assert.equal(JSON.parse(fs.readFileSync(target)).GameTools.unitTypes.guardian.damageTaken.percent,250);
});
